from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Server
from app.schemas import ServerMetricSnapshot


def apply_metrics_snapshot(server: Server, snapshot: dict[str, object]) -> None:
    server.metrics_cpu_percent = int(snapshot["cpu_percent"])
    server.metrics_ram_percent = int(snapshot["ram_percent"])
    server.metrics_disk_percent = int(snapshot["disk_percent"])
    server.metrics_uptime = str(snapshot["uptime"])
    server.metrics_online = bool(snapshot["online"])
    server.metrics_available = bool(snapshot.get("metrics_available", False))
    server.metrics_source = str(snapshot.get("metrics_source", "none"))
    server.metrics_collected_at = datetime.utcnow()


def read_cached_metric_snapshot(server: Server) -> ServerMetricSnapshot:
    if not server.metrics_collected_at:
        return ServerMetricSnapshot(
            server_id=server.id,
            cpu_percent=0,
            ram_percent=0,
            disk_percent=0,
            uptime="не опрошен",
            online=False,
            metrics_available=False,
            collected_at=None,
        )

    return ServerMetricSnapshot(
        server_id=server.id,
        cpu_percent=int(server.metrics_cpu_percent or 0),
        ram_percent=int(server.metrics_ram_percent or 0),
        disk_percent=int(server.metrics_disk_percent or 0),
        uptime=server.metrics_uptime or "—",
        online=bool(server.metrics_online),
        metrics_available=bool(server.metrics_available),
        collected_at=server.metrics_collected_at,
    )


def persist_metrics_snapshot(db: Session, server: Server, snapshot: dict[str, object]) -> ServerMetricSnapshot:
    apply_metrics_snapshot(server, snapshot)
    db.add(server)
    db.commit()
    db.refresh(server)
    return read_cached_metric_snapshot(server)
