import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.bootstrap import ensure_admin_user
from app.core.config import settings
from app.db import SessionLocal, run_startup_migrations
from app.routers import automation, audit, auth, firewall, groups, linux_users, notifications, panel_users, patterns, pm2, security, servers, system, terminal
from app.services.scheduler import scheduler_loop

run_startup_migrations()

with SessionLocal() as db:
    ensure_admin_user(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    scheduler_task: asyncio.Task[None] | None = None
    if settings.scheduler_enabled:
        scheduler_task = asyncio.create_task(scheduler_loop())
    try:
        yield
    finally:
        if scheduler_task is not None:
            scheduler_task.cancel()
            try:
                await scheduler_task
            except asyncio.CancelledError:
                pass


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
app.add_middleware(GZipMiddleware, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_v1_prefix)
app.include_router(automation.router, prefix=settings.api_v1_prefix)
app.include_router(audit.router, prefix=settings.api_v1_prefix)
app.include_router(firewall.router, prefix=settings.api_v1_prefix)
app.include_router(groups.router, prefix=settings.api_v1_prefix)
app.include_router(linux_users.router, prefix=settings.api_v1_prefix)
app.include_router(notifications.router, prefix=settings.api_v1_prefix)
app.include_router(panel_users.router, prefix=settings.api_v1_prefix)
app.include_router(patterns.router, prefix=settings.api_v1_prefix)
app.include_router(security.router, prefix=settings.api_v1_prefix)
app.include_router(servers.router, prefix=settings.api_v1_prefix)
app.include_router(system.router, prefix=settings.api_v1_prefix)
app.include_router(terminal.router, prefix=settings.api_v1_prefix)
app.include_router(pm2.router, prefix=settings.api_v1_prefix)


@app.get("/health")
def healthcheck():
    return {"status": "ok"}
