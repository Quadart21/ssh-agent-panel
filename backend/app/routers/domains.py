from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import ensure_action_access, ensure_section_access, get_current_user, require_admin
from app.models import User
from app.schemas import (
    CloudflareDnsRecordCreate,
    CloudflareDnsRecordRead,
    CloudflareDnsRecordUpdate,
    CloudflareSettingsRead,
    CloudflareSettingsUpdate,
    CloudflareStatusRead,
    CloudflareZoneRead,
)
from app.services.audit import write_audit_log
from app.services.cloudflare import (
    CloudflareAPIError,
    create_dns_record,
    delete_dns_record,
    is_subdomain_record,
    list_dns_records,
    list_zones,
    normalize_record_name,
    record_relative_name,
    update_dns_record,
    verify_cloudflare_token,
)
from app.services.cloudflare_settings import (
    cloudflare_api_token,
    cloudflare_is_configured,
    get_or_create_cloudflare_settings,
    visible_cloudflare_token,
)
from app.core.security import encrypt_secret

router = APIRouter(prefix="/domains", tags=["domains"])


def _require_cloudflare_token(db: Session) -> str:
    profile = get_or_create_cloudflare_settings(db)
    token = cloudflare_api_token(profile)
    if not token:
        raise HTTPException(status_code=400, detail="Cloudflare API token не настроен.")
    return token


def _serialize_zone(item: dict) -> CloudflareZoneRead:
    return CloudflareZoneRead(
        id=item["id"],
        name=item["name"],
        status=item.get("status") or "unknown",
        paused=bool(item.get("paused")),
        type=item.get("type") or "full",
        name_servers=list(item.get("name_servers") or []),
    )


def _serialize_record(item: dict, zone_name: str) -> CloudflareDnsRecordRead:
    name = item.get("name") or zone_name
    return CloudflareDnsRecordRead(
        id=item["id"],
        type=item.get("type") or "A",
        name=name,
        content=item.get("content") or "",
        ttl=int(item.get("ttl") or 1),
        proxied=item.get("proxied"),
        comment=item.get("comment"),
        priority=item.get("priority"),
        created_on=item.get("created_on"),
        modified_on=item.get("modified_on"),
        relative_name=record_relative_name(name, zone_name),
        is_subdomain=is_subdomain_record(name, zone_name),
    )


@router.get("/settings", response_model=CloudflareSettingsRead)
def get_cloudflare_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    profile = get_or_create_cloudflare_settings(db)
    return CloudflareSettingsRead(
        api_token=visible_cloudflare_token(profile),
        account_id=profile.account_id,
        default_ttl=profile.default_ttl,
        configured=cloudflare_is_configured(db),
    )


@router.put("/settings", response_model=CloudflareSettingsRead)
def update_cloudflare_settings(
    payload: CloudflareSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    profile = get_or_create_cloudflare_settings(db)
    data = payload.model_dump()
    token_value = data.pop("api_token", None)
    for field, value in data.items():
        setattr(profile, field, value)
    if token_value is not None:
        cleaned = token_value.strip()
        if cleaned and "…" not in cleaned:
            profile.api_token = encrypt_secret(cleaned)
        elif cleaned == "":
            profile.api_token = None
    db.commit()
    db.refresh(profile)
    write_audit_log(db, user=current_user, action="domains.settings.update", target_type="system", target_id="cloudflare")
    return CloudflareSettingsRead(
        api_token=visible_cloudflare_token(profile),
        account_id=profile.account_id,
        default_ttl=profile.default_ttl,
        configured=cloudflare_is_configured(db),
    )


@router.get("/status", response_model=CloudflareStatusRead)
def get_cloudflare_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    return CloudflareStatusRead(configured=cloudflare_is_configured(db))


@router.post("/test", response_model=CloudflareStatusRead)
def test_cloudflare_connection(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    token = _require_cloudflare_token(db)
    try:
        verify_cloudflare_token(token)
    except CloudflareAPIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CloudflareStatusRead(configured=True, message="Cloudflare API token действителен.")


@router.get("/zones", response_model=list[CloudflareZoneRead])
def get_cloudflare_zones(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    token = _require_cloudflare_token(db)
    try:
        zones = list_zones(token)
    except CloudflareAPIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return [_serialize_zone(item) for item in zones]


@router.get("/zones/{zone_id}/records", response_model=list[CloudflareDnsRecordRead])
def get_cloudflare_records(
    zone_id: str,
    search: str | None = Query(default=None),
    record_type: str | None = Query(default=None),
    only_subdomains: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    token = _require_cloudflare_token(db)
    try:
        zones = list_zones(token)
        zone = next((item for item in zones if item.get("id") == zone_id), None)
        if not zone:
            raise HTTPException(status_code=404, detail="Зона Cloudflare не найдена.")
        records = list_dns_records(token, zone_id, search=search, record_type=record_type)
    except CloudflareAPIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    zone_name = zone["name"]
    serialized = [_serialize_record(item, zone_name) for item in records]
    if only_subdomains:
        serialized = [item for item in serialized if item.is_subdomain]
    serialized.sort(key=lambda item: (not item.is_subdomain, item.relative_name.lower(), item.type))
    return serialized


@router.post("/zones/{zone_id}/records", response_model=CloudflareDnsRecordRead)
def create_cloudflare_record(
    zone_id: str,
    payload: CloudflareDnsRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    ensure_action_access(current_user, "domains_manage")
    token = _require_cloudflare_token(db)
    profile = get_or_create_cloudflare_settings(db)

    try:
        zones = list_zones(token)
        zone = next((item for item in zones if item.get("id") == zone_id), None)
        if not zone:
            raise HTTPException(status_code=404, detail="Зона Cloudflare не найдена.")
        zone_name = zone["name"]
        body = payload.model_dump(exclude_none=True)
        body["name"] = normalize_record_name(body["name"], zone_name)
        if "ttl" not in body or body["ttl"] is None:
            body["ttl"] = profile.default_ttl
        if body.get("type") in {"A", "AAAA", "CNAME"} and body.get("proxied") is None:
            body["proxied"] = False
        created = create_dns_record(token, zone_id, body)
    except CloudflareAPIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db,
        user=current_user,
        action="domains.record.create",
        target_type="cloudflare_record",
        target_id=created.get("id"),
        details=f"{created.get('type')} {created.get('name')}",
    )
    return _serialize_record(created, zone_name)


@router.patch("/zones/{zone_id}/records/{record_id}", response_model=CloudflareDnsRecordRead)
def update_cloudflare_record(
    zone_id: str,
    record_id: str,
    payload: CloudflareDnsRecordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    ensure_action_access(current_user, "domains_manage")
    token = _require_cloudflare_token(db)

    try:
        zones = list_zones(token)
        zone = next((item for item in zones if item.get("id") == zone_id), None)
        if not zone:
            raise HTTPException(status_code=404, detail="Зона Cloudflare не найдена.")
        zone_name = zone["name"]
        body = payload.model_dump(exclude_none=True)
        if "name" in body and body["name"] is not None:
            body["name"] = normalize_record_name(body["name"], zone_name)
        updated = update_dns_record(token, zone_id, record_id, body)
    except CloudflareAPIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db,
        user=current_user,
        action="domains.record.update",
        target_type="cloudflare_record",
        target_id=record_id,
        details=f"{updated.get('type')} {updated.get('name')}",
    )
    return _serialize_record(updated, zone_name)


@router.delete("/zones/{zone_id}/records/{record_id}")
def delete_cloudflare_record(
    zone_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ensure_section_access(current_user, "domains")
    ensure_action_access(current_user, "domains_manage")
    token = _require_cloudflare_token(db)

    try:
        delete_dns_record(token, zone_id, record_id)
    except CloudflareAPIError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    write_audit_log(
        db,
        user=current_user,
        action="domains.record.delete",
        target_type="cloudflare_record",
        target_id=record_id,
    )
    return {"ok": True, "message": "DNS-запись удалена."}
