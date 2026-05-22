from __future__ import annotations

import json
from typing import Any
from urllib import error, parse, request

CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4"
MAX_PAGES = 100


class CloudflareAPIError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


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
        with request.urlopen(req, timeout=30) as response:
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


def _paginate(token: str, path: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    page = 1
    per_page = 100
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


def list_zones(token: str) -> list[dict[str, Any]]:
    return _paginate(token, "/zones", {"status": "active"})


def list_dns_records(token: str, zone_id: str, *, search: str | None = None, record_type: str | None = None) -> list[dict[str, Any]]:
    params: dict[str, Any] = {}
    if search:
        params["search"] = search
    if record_type:
        params["type"] = record_type
    return _paginate(token, f"/zones/{zone_id}/dns_records", params)


def create_dns_record(token: str, zone_id: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = _request("POST", f"/zones/{zone_id}/dns_records", token, body=body)
    return payload.get("result") or {}


def update_dns_record(token: str, zone_id: str, record_id: str, body: dict[str, Any]) -> dict[str, Any]:
    payload = _request("PATCH", f"/zones/{zone_id}/dns_records/{record_id}", token, body=body)
    return payload.get("result") or {}


def delete_dns_record(token: str, zone_id: str, record_id: str) -> None:
    _request("DELETE", f"/zones/{zone_id}/dns_records/{record_id}", token)


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
