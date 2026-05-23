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


def _parse_speed_bar(label: str, raw_value: str) -> dict[str, object] | None:
    match = re.search(
        r"([\d.]+)\s*(G|M|K)?\s*(Gbit/s|Gbps|G/s|GB/s|MB/s|Mbit/s|Mbps|KB/s|bit/s|bps)?",
        raw_value,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    value = float(match.group(1))
    prefix = (match.group(2) or "").upper()
    unit_raw = (match.group(3) or "").lower()
    if "gbit" in unit_raw or "gbps" in unit_raw or unit_raw == "g/s":
        normalized = value * 1000
        unit = "Mbps"
        max_value = 10000
    elif "mb/s" in unit_raw or "gb/s" in unit_raw:
        normalized = value * (1000 if "g" in unit_raw else 1)
        unit = "MB/s"
        max_value = 2000
    elif "mbps" in unit_raw or "mbit" in unit_raw or "bit" in unit_raw or "bps" in unit_raw:
        normalized = value * {"G": 1000, "M": 1, "K": 0.001}.get(prefix, 1)
        unit = "Mbps"
        max_value = 10000
    elif "kb/s" in unit_raw:
        normalized = value / 1000
        unit = "MB/s"
        max_value = 2000
    else:
        normalized = value
        unit = "units"
        max_value = max(value * 1.5, 100)
    tone = "success" if normalized >= max_value * 0.5 else "warning" if normalized >= max_value * 0.2 else "error"
    return {
        "label": label,
        "value": round(normalized, 2),
        "max_value": float(max_value),
        "unit": unit,
        "tone": tone,
    }


def _scorecard_icon(label: str) -> str:
    lowered = label.lower()
    if "cpu" in lowered or "events" in lowered:
        return "⚙️"
    if "ram" in lowered or "mem" in lowered:
        return "🧠"
    if "disk" in lowered or "dd" in lowered or "fio" in lowered:
        return "💾"
    if "upload" in lowered:
        return "⬆️"
    if "download" in lowered:
        return "⬇️"
    if "страна" in lowered or "country" in lowered:
        return "🌍"
    if "город" in lowered or "city" in lowered:
        return "🏙"
    if "region" in lowered or "регион" in lowered:
        return "🗺"
    if "isp" in lowered or "asn" in lowered or "provider" in lowered:
        return "🏢"
    if "ip" in lowered:
        return "🌐"
    return "📊"


def _parse_tile_from_line(line: str) -> dict[str, str] | None:
    cleaned = re.sub(r"\s{2,}", " ", line.strip(" •|-"))
    if len(cleaned) < 3 or cleaned.startswith(("=", "-", "_", "*", "#")):
        return None
    if re.fullmatch(r"[\W\d_]+", cleaned):
        return None

    success_markers = ("✓", "✔", "☑", "[ ok ]", "[ok]", " pass", "passed", "success", "available", " reachable", " clean", " open")
    error_markers = ("✗", "✘", "❌", "×", "[fail", " fail", "failed", "blocked", "denied", "error", "unavailable", "timeout", "banned")
    warning_markers = ("warn", "warning", "partial", "slow", "limited")

    lowered = cleaned.lower()
    status = "neutral"
    if any(marker in lowered for marker in error_markers):
        status = "error"
    elif any(marker in lowered for marker in warning_markers):
        status = "warning"
    elif any(marker in lowered for marker in success_markers):
        status = "success"

    match = re.match(r"^[\[\(]?\s*(OK|PASS|FAIL|WARN|BLOCKED|YES|NO)\s*[\]\)]?\s*[-:–—]?\s*(.+)$", cleaned, flags=re.IGNORECASE)
    if match:
        token = match.group(1).lower()
        title = match.group(2).strip()
        if token in {"ok", "pass", "yes"}:
            status = "success"
        elif token in {"fail", "no", "blocked"}:
            status = "error"
        elif token == "warn":
            status = "warning"
        return {"title": title[:80], "status": status, "detail": None}

    match = re.match(r"^(.+?)\s*[:：\-–—]\s*(.+)$", cleaned)
    if match:
        title = match.group(1).strip()
        detail = match.group(2).strip()
        detail_lower = detail.lower()
        if status == "neutral":
            if detail_lower in {"ok", "pass", "passed", "success", "available", "yes", "open", "clean"}:
                status = "success"
            elif detail_lower in {"fail", "failed", "blocked", "denied", "no", "error", "unavailable"}:
                status = "error"
            elif detail_lower in {"warn", "warning", "partial", "slow"}:
                status = "warning"
        if len(title) <= 64 and not title.lower().startswith(("http", "wget", "curl", "bash")):
            return {"title": title, "status": status, "detail": detail[:120] if detail else None}

    if status != "neutral" and len(cleaned) <= 96:
        title = re.sub(r"^[✓✔☑✗✘❌×]+\s*", "", cleaned)
        title = re.sub(r"\s*(OK|PASS|FAIL|BLOCKED)$", "", title, flags=re.IGNORECASE).strip()
        if title:
            return {"title": title[:80], "status": status, "detail": None}
    return None


def _extract_scorecards_and_bars(check_id: str, text: str) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    scorecards: list[dict[str, object]] = []
    bars: list[dict[str, object]] = []
    seen_labels: set[str] = set()

    metric_patterns = [
        (r"events per second:\s*([\d.]+)", "Events/sec", None),
        (r"total time:\s*([\d.]+)\s*s", "Время теста", None),
        (r"CPU\s*[:：]\s*(.+)", "CPU", None),
        (r"RAM\s*[:：]\s*(.+)", "RAM", None),
        (r"Mem(?:ory)?\s*[:：]\s*(.+)", "RAM", None),
        (r"Disk\s*[:：]\s*(.+)", "Disk", None),
        (r"Upload\s*[:：]\s*(.+)", "Upload", "bar"),
        (r"Download\s*[:：]\s*(.+)", "Download", "bar"),
        (r"ISP\s*[:：]\s*(.+)", "ISP", None),
        (r"Provider\s*[:：]\s*(.+)", "Провайдер", None),
        (r"Country\s*[:：]\s*(.+)", "Страна", None),
        (r"Region\s*[:：]\s*(.+)", "Регион", None),
        (r"City\s*[:：]\s*(.+)", "Город", None),
        (r"ASN\s*[:：]\s*(.+)", "ASN", None),
        (r"IP\s*[:：]\s*(.+)", "IP", None),
        (r"Latency\s*[:：]\s*(.+)", "Latency", None),
    ]

    for pattern, label, kind in metric_patterns:
        if label in seen_labels:
            continue
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        raw = match.group(1).strip()
        seen_labels.add(label)
        if kind == "bar":
            bar = _parse_speed_bar(label, raw)
            if bar:
                bars.append(bar)
            continue
        tone = "info"
        if label == "Events/sec":
            try:
                eps = float(raw)
                tone = "success" if eps >= 1000 else "warning" if eps >= 300 else "error"
            except ValueError:
                tone = "neutral"
        scorecards.append(
            {
                "label": label,
                "value": raw,
                "hint": None,
                "tone": tone,
                "icon": _scorecard_icon(label),
            }
        )

    for line in text.splitlines():
        match = re.match(r"^\s*(Upload|Download|Speed|Disk Read|Disk Write|IOPS)\s*[:：]\s*(.+)$", line, flags=re.IGNORECASE)
        if not match:
            continue
        label = match.group(1).strip().title()
        if any(bar["label"].lower() == label.lower() for bar in bars):
            continue
        bar = _parse_speed_bar(label, match.group(2).strip())
        if bar:
            bars.append(bar)

    if check_id == "cpu_sysbench" and "Events/sec" not in seen_labels:
        match = re.search(r"([\d.]+)\s+events per second", text, flags=re.IGNORECASE)
        if match:
            value = match.group(1)
            eps = float(value)
            scorecards.append(
                {
                    "label": "Events/sec",
                    "value": value,
                    "hint": "1 поток sysbench",
                    "tone": "success" if eps >= 1000 else "warning" if eps >= 300 else "error",
                    "icon": "⚙️",
                }
            )
    return scorecards, bars


def _build_visual(check: ServerCheckDefinition, exit_code: int, text: str, metrics: list[tuple[str, str]]) -> dict[str, object]:
    scorecards, bars = _extract_scorecards_and_bars(check.id, text)
    if not scorecards and metrics:
        for label, value in metrics:
            scorecards.append(
                {
                    "label": label,
                    "value": value,
                    "hint": None,
                    "tone": "info",
                    "icon": _scorecard_icon(label),
                }
            )

    tiles: list[dict[str, str | None]] = []
    seen_titles: set[str] = set()
    for line in text.splitlines():
        tile = _parse_tile_from_line(_strip_ansi(line))
        if not tile:
            continue
        key = tile["title"].lower()
        if key in seen_titles or len(key) < 2:
            continue
        seen_titles.add(key)
        tiles.append(tile)
        if len(tiles) >= 48:
            break

    passed = sum(1 for tile in tiles if tile["status"] == "success")
    failed = sum(1 for tile in tiles if tile["status"] == "error")
    warnings = sum(1 for tile in tiles if tile["status"] == "warning")

    highlights: list[dict[str, str]] = []
    if check.group == "ip_region" and scorecards:
        highlights.append({"icon": "🗺", "text": " · ".join(card["value"] for card in scorecards[:4]), "tone": "info"})
    if check.group == "cpu" and scorecards:
        eps = next((card for card in scorecards if card["label"] == "Events/sec"), None)
        if eps:
            highlights.append({"icon": "⚙️", "text": f"Производительность CPU: {eps['value']} events/sec", "tone": str(eps["tone"])})
    if failed > 0:
        highlights.append({"icon": "⚠️", "text": f"Обнаружено проблем: {failed}", "tone": "error"})
    elif passed > 0:
        highlights.append({"icon": "✅", "text": f"Успешных проверок: {passed}", "tone": "success"})

    if failed > 0 and passed == 0:
        health, health_label = "poor", "Критично"
    elif failed > 0:
        health, health_label = "fair", "Есть проблемы"
    elif passed > 0 or exit_code == 0:
        health, health_label = "good", "Хорошо"
    else:
        health, health_label = "unknown", "Нет данных"

    lowered = text.lower()
    if "__missing__" in lowered or "не установлен" in lowered:
        health, health_label = "poor", "Нет зависимостей"
        highlights.insert(0, {"icon": "🧩", "text": "На сервере не установлены нужные утилиты для теста.", "tone": "error"})

    return {
        "health": health,
        "health_label": health_label,
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "scorecards": scorecards[:12],
        "tiles": tiles,
        "bars": bars[:8],
        "highlights": highlights[:6],
    }


def _build_summary(check: ServerCheckDefinition, exit_code: int, text: str, visual: dict[str, object]) -> tuple[bool, str]:
    lowered = text.lower()
    if "__missing__" in lowered or "command not found" in lowered or "не установлен" in lowered:
        return False, "На сервере не хватает зависимостей для этого теста."
    if exit_code != 0 and not text.strip():
        return False, "Команда завершилась с ошибкой без вывода."

    scorecards = visual.get("scorecards") or []
    if scorecards:
        headline = " · ".join(f"{card['label']}: {card['value']}" for card in scorecards[:3])
        return exit_code == 0 and visual.get("health") != "poor", headline

    passed = int(visual.get("passed") or 0)
    failed = int(visual.get("failed") or 0)
    if passed or failed:
        return failed == 0 and exit_code == 0, f"Успешно: {passed} · Проблем: {failed} · Предупреждений: {int(visual.get('warnings') or 0)}"

    if exit_code == 0:
        return True, "Проверка завершена."
    if any(token in lowered for token in ("block", "blocked", "fail", "error", "denied")):
        return False, "Обнаружены признаки блокировок или ошибок."
    return False, "Проверка завершилась с ошибкой."


def parse_check_report(check: ServerCheckDefinition, *, exit_code: int, stdout: str, stderr: str, duration_ms: int) -> dict[str, object]:
    combined = _strip_ansi("\n".join(part for part in [stdout, stderr] if part)).strip()
    metrics = _extract_metrics(check.id, combined)
    visual = _build_visual(check, exit_code, combined, metrics)
    sections = _split_sections(combined)
    ok, summary = _build_summary(check, exit_code, combined, visual)
    return {
        "check_id": check.id,
        "check_title": check.title,
        "group": check.group,
        "ok": ok and exit_code == 0,
        "exit_code": exit_code,
        "duration_ms": duration_ms,
        "summary": summary,
        "visual": visual,
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
