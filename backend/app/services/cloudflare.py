from __future__ import annotations

import hashlib
import http.client
import json
import socket
import ssl
import threading
import time
from typing import Any
from urllib import error, parse, request

CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
MAX_PAGES = 100
REQUEST_TIMEOUT_SECONDS = 12
ZONES_CACHE_TTL_SECONDS = 300
RECORDS_CACHE_TTL_SECONDS = 120
ZONES_PER_PAGE = 50
RECORDS_PER_PAGE = 100

_cache_lock = threading.Lock()
_zones_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_zone_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_records_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_opener_lock = threading.Lock()
_ipv4_opener: request.OpenerDirector | None = None


class _IPv4HTTPSConnection(http.client.HTTPSConnection):
    """HTTPS connection that prefers IPv4.

    On some hosts IPv6 routes to api.cloudflare.com time out while IPv4 is fine.
    CPython's urllib tries getaddrinfo() order (IPv6 first) and can burn a minute
    on dead AAAA records before falling back — forcing IPv4 first keeps Domains fast.
    """

    def connect(self) -> None:
        errors: list[OSError] = []
        families = (socket.AF_INET, socket.AF_INET6)
        for family in families:
            try:
                addrinfos = socket.getaddrinfo(self.host, self.port, family, socket.SOCK_STREAM)
            except OSError as exc:
                errors.append(exc)
                continue
            for af, socktype, proto, _canon, sockaddr in addrinfos:
                sock: socket.socket | None = None
                try:
                    sock = socket.socket(af, socktype, proto)
                    if self.timeout is not None:
                        sock.settimeout(self.timeout)
                    if self.source_address:
                        sock.bind(self.source_address)
                    sock.connect(sockaddr)
                    self.sock = sock
                    sock = None
                    if self._tunnel_host:
                        self._tunnel()
                    context = self._context
                    server_hostname = self.host
                    if hasattr(self, "_server_hostname") and self._server_hostname:
                        server_hostname = self._server_hostname
                    self.sock = context.wrap_socket(self.sock, server_hostname=server_hostname)
                    return
                except OSError as exc:
                    errors.append(exc)
                    if sock is not None:
                        sock.close()
        if errors:
            raise errors[-1]
        raise OSError(f"Unable to connect to {self.host}:{self.port}")


class _IPv4HTTPSHandler(request.HTTPSHandler):
    def https_open(self, req: request.Request):  # type: ignore[override]
        return self.do_open(_IPv4HTTPSConnection, req)


def _get_opener() -> request.OpenerDirector:
    global _ipv4_opener
    with _opener_lock:
        if _ipv4_opener is None:
            context = ssl.create_default_context()
            _ipv4_opener = request.build_opener(_IPv4HTTPSHandler(context=context))
        return _ipv4_opener


class CloudflareAPIError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


def _token_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]


def _cache_get(store: dict[str, tuple[float, Any]], key: str, ttl: float) -> Any | None:
    with _cache_lock:
        item = store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at < time.monotonic():
            store.pop(key, None)
            return None
        return value


def _cache_set(store: dict[str, tuple[float, Any]], key: str, value: Any, ttl: float) -> None:
    with _cache_lock:
        store[key] = (time.monotonic() + ttl, value)


def invalidate_cloudflare_caches(token: str | None = None, *, zone_id: str | None = None) -> None:
    with _cache_lock:
        if token is None and zone_id is None:
            _zones_cache.clear()
            _zone_cache.clear()
            _records_cache.clear()
            return

        token_prefix = _token_key(token) if token else None
        if token_prefix:
            _zones_cache.pop(token_prefix, None)
            for key in [k for k in _zone_cache if k.startswith(f"{token_prefix}:")]:
                if zone_id is None or key.endswith(f":{zone_id}"):
                    _zone_cache.pop(key, None)
            for key in [k for k in _records_cache if k.startswith(f"{token_prefix}:")]:
                if zone_id is None or key.endswith(f":{zone_id}"):
                    _records_cache.pop(key, None)
        elif zone_id:
            for key in [k for k in _zone_cache if k.endswith(f":{zone_id}")]:
                _zone_cache.pop(key, None)
            for key in [k for k in _records_cache if k.endswith(f":{zone_id}")]:
                _records_cache.pop(key, None)


def _extract_error_message(payload: dict[str, Any]) -> str:
    errors = payload.get("errors") or []
    if errors:
        parts = []
        for item in errors:
            code = item.get("code")
            message = item.get("message") or "Cloudflare API error"
            parts.append(f"{message} ({code})" if code is not None else message)
        return "; ".join(parts)
    return payload.get("message") or "Cloudflare API вернул ошибку."


def _request(
    method: str,
    path: str,
    token: str,
    *,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = f"{CLOUDFLARE_API_BASE}{path}"
    if params:
        query = parse.urlencode({key: value for key, value in params.items() if value is not None})
        if query:
            url = f"{url}?{query}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = request.Request(url, data=data, headers=headers, method=method)

    try:
        with _get_opener().open(req, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8", errors="ignore")
            payload = json.loads(raw) if raw else {}
            if response.status >= 400 or not payload.get("success", True):
                raise CloudflareAPIError(_extract_error_message(payload), response.status)
            return payload
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="ignore")
        try:
            payload = json.loads(raw) if raw else {}
            message = _extract_error_message(payload)
        except json.JSONDecodeError:
            message = raw or str(exc)
        raise CloudflareAPIError(message, exc.code) from exc
    except error.URLError as exc:
        raise CloudflareAPIError(f"Не удалось связаться с Cloudflare API: {exc}") from exc
    except TimeoutError as exc:
        raise CloudflareAPIError(f"Таймаут Cloudflare API: {exc}") from exc
    except OSError as exc:
        raise CloudflareAPIError(f"Не удалось связаться с Cloudflare API: {exc}") from exc


def _paginate(
    token: str,
    path: str,
    params: dict[str, Any] | None = None,
    *,
    per_page: int = RECORDS_PER_PAGE,
) -> list[dict[str, Any]]:
    page = 1
    collected: list[dict[str, Any]] = []

    while page <= MAX_PAGES:
        payload = _request(
            "GET",
            path,
            token,
            params={**(params or {}), "page": page, "per_page": per_page},
        )
        collected.extend(payload.get("result") or [])
        info = payload.get("result_info") or {}
        total_pages = int(info.get("total_pages") or 1)
        if page >= total_pages:
            break
        page += 1

    return collected


def verify_cloudflare_token(token: str) -> dict[str, Any]:
    payload = _request("GET", "/user/tokens/verify", token)
    return payload.get("result") or {}


def list_zones(token: str, *, force_refresh: bool = False) -> list[dict[str, Any]]:
    cache_key = _token_key(token)
    if not force_refresh:
        cached = _cache_get(_zones_cache, cache_key, ZONES_CACHE_TTL_SECONDS)
        if cached is not None:
            return cached

    zones = _paginate(token, "/zones", {"status": "active"}, per_page=ZONES_PER_PAGE)
    _cache_set(_zones_cache, cache_key, zones, ZONES_CACHE_TTL_SECONDS)
    for zone in zones:
        zone_id = zone.get("id")
        if zone_id:
            _cache_set(_zone_cache, f"{cache_key}:{zone_id}", zone, ZONES_CACHE_TTL_SECONDS)
    return zones


def get_zone(token: str, zone_id: str, *, force_refresh: bool = False) -> dict[str, Any]:
    cache_key = f"{_token_key(token)}:{zone_id}"
    if not force_refresh:
        cached = _cache_get(_zone_cache, cache_key, ZONES_CACHE_TTL_SECONDS)
        if cached is not None:
            return cached

    payload = _request("GET", f"/zones/{zone_id}", token)
    zone = payload.get("result") or {}
    if not zone.get("id"):
        raise CloudflareAPIError("Зона Cloudflare не найдена.", 404)
    _cache_set(_zone_cache, cache_key, zone, ZONES_CACHE_TTL_SECONDS)
    return zone


def list_dns_records(
    token: str,
    zone_id: str,
    *,
    search: str | None = None,
    record_type: str | None = None,
    force_refresh: bool = False,
) -> list[dict[str, Any]]:
    # Filtered queries bypass cache — they are rare after client-side filtering.
    if search or record_type:
        params: dict[str, Any] = {}
        if search:
            params["search"] = search
        if record_type:
            params["type"] = record_type
        return _paginate(token, f"/zones/{zone_id}/dns_records", params, per_page=RECORDS_PER_PAGE)

    cache_key = f"{_token_key(token)}:{zone_id}"
    if not force_refresh:
        cached = _cache_get(_records_cache, cache_key, RECORDS_CACHE_TTL_SECONDS)
        if cached is not None:
            return cached

    records = _paginate(token, f"/zones/{zone_id}/dns_records", per_page=RECORDS_PER_PAGE)
    _cache_set(_records_cache, cache_key, records, RECORDS_CACHE_TTL_SECONDS)
    return records


def create_dns_record(token: str, zone_id: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = _request("POST", f"/zones/{zone_id}/dns_records", token, body=body)
    invalidate_cloudflare_caches(token, zone_id=zone_id)
    return payload.get("result") or {}


def update_dns_record(token: str, zone_id: str, record_id: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = _request("PATCH", f"/zones/{zone_id}/dns_records/{record_id}", token, body=body)
    invalidate_cloudflare_caches(token, zone_id=zone_id)
    return payload.get("result") or {}


def delete_dns_record(token: str, zone_id: str, record_id: str) -> None:
    _request("DELETE", f"/zones/{zone_id}/dns_records/{record_id}", token)
    invalidate_cloudflare_caches(token, zone_id=zone_id)


def normalize_record_name(raw_name: str, zone_name: str) -> str:
    cleaned = raw_name.strip().rstrip(".")
    zone = zone_name.strip().rstrip(".").lower()
    if not cleaned:
        return zone
    if cleaned == "@" or cleaned.lower() == zone:
        return zone
    if cleaned.lower().endswith(f".{zone}"):
        return cleaned
    if "." in cleaned:
        return cleaned
    return f"{cleaned}.{zone}"


def record_relative_name(record_name: str, zone_name: str) -> str:
    name = record_name.strip().rstrip(".").lower()
    zone = zone_name.strip().rstrip(".").lower()
    if name == zone:
        return "@"
    suffix = f".{zone}"
    if name.endswith(suffix):
        return name[: -len(suffix)] or "@"
    return record_name


def is_subdomain_record(record_name: str, zone_name: str) -> bool:
    return record_relative_name(record_name, zone_name) != "@"
