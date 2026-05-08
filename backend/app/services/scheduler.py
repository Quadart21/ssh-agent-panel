import asyncio

from app.db import SessionLocal
from app.services.notification_settings import get_or_create_notification_settings
from app.services.alerts import sync_alert_notifications


def run_scheduler_cycle() -> int:
    with SessionLocal() as db:
        profile = get_or_create_notification_settings(db)
        if profile.scheduler_enabled:
            sync_alert_notifications(db)
        return max(profile.scheduler_interval_seconds, 30)


async def scheduler_loop() -> None:
    while True:
        interval_seconds = 300
        try:
            interval_seconds = await asyncio.to_thread(run_scheduler_cycle)
        except Exception:
            pass
        await asyncio.sleep(interval_seconds)
