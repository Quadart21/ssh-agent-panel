import re
import time
from dataclasses import dataclass

from app.models import Server
from app.services.ssh import run_command_on_server

ANSI_ESCAPE = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


@dataclass(frozen=True)
class ServerCheckDefinition:
    id: str
    group: str
    title: str
    description: str
    command: str
    timeout: int
    estimated_seconds: int
    requires_root: bool = True


SERVER_CHECK_GROUPS: dict[str, dict[str, str]] = {
    "ip_blocks": {"label": "Блокировки IP", "icon": "🌍", "hint": "Зарубежные сервисы и фильтры"},
    "benchmark_intl": {"label": "Бенчмарк", "icon": "🚀", "hint": "Зарубежные провайдеры"},
    "benchmark_ru": {"label": "Бенчмарк РФ", "icon": "📡", "hint": "Российские узлы и iPerf3"},
    "yabs": {"label": "YABS", "icon": "📊", "hint": "Комплексный тест производительности"},
    "ip_region": {"label": "Регион IP", "icon": "🗺", "hint": "Геолокация и провайдер IP"},
    "dpi": {"label": "DPI", "icon": "🔥", "hint": "Проверка DPI на серверах РФ"},
    "geoblock": {"label": "Геоблок", "icon": "🛡", "hint": "Доступность сервисов по регионам"},
    "instagram": {"label": "Instagram", "icon": "📸", "hint": "Блокировка аудио в Instagram"},
    "cpu": {"label": "CPU", "icon": "⚙️", "hint": "Оценка вычислительной мощности"},
}


SERVER_CHECKS: tuple[ServerCheckDefinition, ...] = (
    ServerCheckDefinition(
        id="ip_blocks_en",
        group="ip_blocks",
        title="IP Check Place (EN)",
        description="Проверка IP на блокировки зарубежными сервисами.",
        command="bash <(curl -Ls IP.Check.Place) -l en",
        timeout=240,
        estimated_seconds=90,
    ),
    ServerCheckDefinition(
        id="ip_blocks_alt",
        group="ip_blocks",
        title="Check.Place (расширенный)",
        description="Альтернативный режим того же сервиса с расширенным выводом.",
        command="bash <(curl -Ls https://Check.Place) -EI",
        timeout=240,
        estimated_seconds=90,
    ),
    ServerCheckDefinition(
        id="bench_intl",
        group="benchmark_intl",
        title="bench.sh",
        description="Классический бенчмарк через зарубежные узлы.",
        command="wget -qO- bench.sh | bash",
        timeout=420,
        estimated_seconds=180,
    ),
    ServerCheckDefinition(
        id="bench_intl_tlab",
        group="benchmark_intl",
        title="speed.tlab.pw",
        description="Альтернативный международный speedtest.",
        command="wget -qO- speed.tlab.pw | bash",
        timeout=420,
        estimated_seconds=180,
    ),
    ServerCheckDefinition(
        id="bench_intl_tlab2",
        group="benchmark_intl",
        title="bench.tlab.pw",
        description="Вторая альтернатива tlab-бенчмарка.",
        command="wget -qO- bench.tlab.pw | bash",
        timeout=420,
        estimated_seconds=180,
    ),
    ServerCheckDefinition(
        id="bench_ru_gig",
        group="benchmark_ru",
        title="bench.gig.ovh",
        description="Бенчмарк с тестами до российских провайдеров.",
        command="wget -qO- bench.gig.ovh | bash",
        timeout=420,
        estimated_seconds=180,
    ),
    ServerCheckDefinition(
        id="bench_ru_iperf",
        group="benchmark_ru",
        title="Russian iPerf3",
        description="Чистый iPerf3 до российских серверов.",
        command="bash <(wget -qO- https://github.com/itdoginfo/russian-iperf3-servers/raw/main/speedtest.sh)",
        timeout=300,
        estimated_seconds=120,
    ),
    ServerCheckDefinition(
        id="yabs",
        group="yabs",
        title="YABS",
        description="Yet Another Bench Script — CPU, disk, network.",
        command="curl -sL yabs.sh | bash -s -- -4",
        timeout=900,
        estimated_seconds=420,
    ),
    ServerCheckDefinition(
        id="ip_region",
        group="ip_region",
        title="ipregion.xyz",
        description="Определение региона и провайдера IP-адреса.",
        command="bash <(wget -qO- https://ipregion.xyz)",
        timeout=120,
        estimated_seconds=30,
    ),
    ServerCheckDefinition(
        id="ip_region_github",
        group="ip_region",
        title="ipregion (GitHub)",
        description="Зеркало скрипта ipregion на GitHub.",
        command="bash <(wget -qO - https://github.com/vernette/ipregion/raw/master/ipregion.sh)",
        timeout=120,
        estimated_seconds=30,
    ),
    ServerCheckDefinition(
        id="ip_region_mirror",
        group="ip_region",
        title="ipregion.vrnt.xyz",
        description="Альтернативное зеркало ipregion.",
        command="bash <(wget -qO- https://ipregion.vrnt.xyz)",
        timeout=120,
        estimated_seconds=30,
    ),
    ServerCheckDefinition(
        id="dpi",
        group="dpi",
        title="CensorCheck DPI",
        description="Проверка DPI — актуально для серверов в РФ.",
        command="bash <(wget -qO- https://github.com/vernette/censorcheck/raw/master/censorcheck.sh) --mode dpi",
        timeout=240,
        estimated_seconds=90,
    ),
    ServerCheckDefinition(
        id="geoblock",
        group="geoblock",
        title="CensorCheck Geoblock",
        description="Проверка геоблокировок популярных сервисов.",
        command="bash <(wget -qO- https://github.com/vernette/censorcheck/raw/master/censorcheck.sh) --mode geoblock",
        timeout=240,
        estimated_seconds=90,
    ),
    ServerCheckDefinition(
        id="instagram_audio",
        group="instagram",
        title="Instagram audio",
        description="Проверка блокировки аудио в Instagram.",
        command="bash <(curl -L -s https://bench.openode.xyz/checker_inst.sh)",
        timeout=120,
        estimated_seconds=45,
    ),
    ServerCheckDefinition(
        id="cpu_sysbench",
        group="cpu",
        title="sysbench CPU",
        description="Грубая оценка CPU: events per second (1 поток).",
        command="command -v sysbench >/dev/null 2>&1 || { echo '__MISSING__ sysbench не установлен. Установите: apt install sysbench / yum install sysbench'; exit 127; }; sysbench cpu run --threads=1",
        timeout=180,
        estimated_seconds=60,
    ),
)

CHECKS_BY_ID = {item.id: item for item in SERVER_CHECKS}


def get_check_catalog() -> list[dict[str, object]]:
    groups = [
        {"id": group_id, **meta, "checks": []}
        for group_id, meta in SERVER_CHECK_GROUPS.items()
    ]
    group_map = {group["id"]: group for group in groups}
    for check in SERVER_CHECKS:
        group_map[check.group]["checks"].append(
            {
                "id": check.id,
                "title": check.title,
                "description": check.description,
                "estimated_seconds": check.estimated_seconds,
                "timeout": check.timeout,
            }
        )
    return groups


def _wrap_remote_command(command: str) -> str:
    escaped = command.replace("'", "'\"'\"'")
    return f"bash -lc '{escaped}'"


def _strip_ansi(text: str) -> str:
    return ANSI_ESCAPE.sub("", text)


def _line_status(line: str) -> str:
    lowered = line.lower()
    if any(token in lowered for token in ("error", "fail", "failed", "blocked", "denied", "unavailable", "timeout", "missing")):
        return "error"
    if any(token in lowered for token in ("warn", "warning", "partial", "slow")):
        return "warning"
    if any(token in lowered for token in ("ok", "pass", "passed", "success", "available", "reachable", "open", "clean")):
        return "success"
    return "neutral"


def _extract_metrics(check_id: str, text: str) -> list[tuple[str, str]]:
    metrics: list[tuple[str, str]] = []
    patterns = [
        (r"events per second:\s*([\d.]+)", "Events/sec"),
        (r"total time:\s*([\d.]+)\s*s", "Время теста"),
        (r"CPU\s*:\s*(.+)", "CPU"),
        (r"RAM\s*:\s*(.+)", "RAM"),
        (r"Disk\s*:\s*(.+)", "Disk"),
        (r"Upload\s*:\s*(.+)", "Upload"),
        (r"Download\s*:\s*(.+)", "Download"),
        (r"ISP\s*[:：]\s*(.+)", "ISP"),
        (r"Country\s*[:：]\s*(.+)", "Страна"),
        (r"Region\s*[:：]\s*(.+)", "Регион"),
        (r"City\s*[:：]\s*(.+)", "Город"),
    ]
    for pattern, label in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            metrics.append((label, match.group(1).strip()))
    if check_id == "cpu_sysbench" and not metrics:
        match = re.search(r"([\d.]+)\s+events per second", text, flags=re.IGNORECASE)
        if match:
            metrics.append(("Events/sec", match.group(1)))
    return metrics


def _split_sections(text: str) -> list[dict[str, object]]:
    chunks = re.split(r"\n\s*\n", text)
    sections: list[dict[str, object]] = []
    for chunk in chunks:
        lines = [line.rstrip() for line in chunk.splitlines() if line.strip()]
        if not lines:
            continue
        title = lines[0]
        body = lines[1:] if len(lines) > 1 else []
        if len(title) > 96 and not body:
            body = [title]
            title = "Детали"
        statuses = [_line_status(line) for line in body or [title]]
        if "error" in statuses:
            status = "error"
        elif "warning" in statuses:
            status = "warning"
        elif "success" in statuses:
            status = "success"
        else:
            status = "neutral"
        sections.append(
            {
                "title": title[:120],
                "status": status,
                "lines": (body or [title])[:40],
                "items": [],
            }
        )
    return sections[:12]


def _build_summary(check: ServerCheckDefinition, exit_code: int, text: str, metrics: list[tuple[str, str]]) -> tuple[bool, str]:
    lowered = text.lower()
    if "__missing__" in lowered or "command not found" in lowered or "не установлен" in lowered:
        return False, "На сервере не хватает зависимостей для этого теста."
    if exit_code != 0 and not text.strip():
        return False, "Команда завершилась с ошибкой без вывода."
    if metrics:
        headline = " · ".join(f"{label}: {value}" for label, value in metrics[:3])
        return exit_code == 0, headline
    if exit_code == 0:
        return True, "Проверка завершена. Изучите секции отчёта ниже."
    if any(token in lowered for token in ("block", "blocked", "fail", "error", "denied")):
        return False, "Обнаружены признаки блокировок или ошибок."
    return False, "Проверка завершилась с ошибкой."


def parse_check_report(check: ServerCheckDefinition, *, exit_code: int, stdout: str, stderr: str, duration_ms: int) -> dict[str, object]:
    combined = _strip_ansi("\n".join(part for part in [stdout, stderr] if part)).strip()
    metrics = _extract_metrics(check.id, combined)
    sections = _split_sections(combined)
    if metrics:
        sections.insert(
            0,
            {
                "title": "Ключевые показатели",
                "status": "info",
                "lines": [],
                "items": [{"label": label, "value": value} for label, value in metrics],
            },
        )
    if not sections and combined:
        sections = [{"title": "Результат", "status": "neutral", "lines": combined.splitlines()[:40], "items": []}]
    ok, summary = _build_summary(check, exit_code, combined, metrics)
    return {
        "check_id": check.id,
        "check_title": check.title,
        "group": check.group,
        "ok": ok and exit_code == 0,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "summary": summary,
        "sections": sections,
        "raw_excerpt": combined[:4000] if combined else "",
    }


def run_server_check(server: Server, check_id: str) -> dict[str, object]:
    check = CHECKS_BY_ID.get(check_id)
    if check is None:
        raise ValueError("Неизвестная проверка.")

    started = time.perf_counter()
    exit_code, stdout, stderr = run_command_on_server(server, _wrap_remote_command(check.command), timeout=check.timeout)
    duration_ms = int((time.perf_counter() - started) * 1000)
    report = parse_check_report(check, exit_code=exit_code, stdout=stdout, stderr=stderr, duration_ms=duration_ms)
    report["server_id"] = server.id
    report["server_name"] = server.name
    return report
