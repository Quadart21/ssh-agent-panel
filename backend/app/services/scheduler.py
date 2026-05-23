import asyncio

from app.db import SessionLocal
from app.services.notification_settings import get_or_create_notification_settings
from app.services.alerts import sync_alert_notifications
from app.services.payment_notifications import sync_payment_notifications
from app.services.server_check_jobs import expire_stale_server_check_runs


def run_scheduler_cycle() -> int:
    with SessionLocal() as db:
        profile = get_or_create_notification_settings(db)
        if profile.scheduler_enabled:
            expire_stale_server_check_runs(db)
            sync_alert_notifications(db)
            sync_payment_notifications(db)
        return max(profile.scheduler_interval_seconds, 30)


async def scheduler_loop() -> None:
    while True:
        interval_seconds = 300
        try:
            interval_seconds = await asyncio.to_thread(run_scheduler_cycle)
        except Exception:
            pass
        await asyncio.sleep(interval_seconds)
