import json
import socket
import time
import shlex
from pathlib import Path

import paramiko

from app.models import Server
from app.schemas import CommandExecutionResult, ConnectionTestResult, Pm2ProcessRead, ServerConnectionCheck
from app.core.security import decrypt_secret


def build_ssh_client(
    host: str,
    port: int,
    username: str,
    password: str | None = None,
    key_path: str | None = None,
) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    kwargs: dict[str, object] = {
        "hostname": host,
        "port": port,
        "username": username,
        "timeout": 5,
        "banner_timeout": 5,
        "auth_timeout": 5,
        "look_for_keys": False,
        "allow_agent": False,
    }
    if password:
        kwargs["password"] = password
    if key_path:
        path = Path(key_path)
        if not path.exists():
            raise FileNotFoundError(f"SSH-ключ не найден: {path}")
        kwargs["key_filename"] = str(path)

    client.connect(**kwargs)
    return client


def test_ssh_connection(payload: ServerConnectionCheck) -> ConnectionTestResult:
    start = time.perf_counter()

    try:
        with socket.create_connection((payload.ip, payload.port), timeout=5):
            latency_ms = int((time.perf_counter() - start) * 1000)
    except OSError as exc:
        return ConnectionTestResult(ok=False, message=f"Не удалось открыть TCP-соединение: {exc}", latency_ms=None)

    if not payload.password_enc and not payload.key_path:
        return ConnectionTestResult(
            ok=True,
            message="TCP-порт доступен. Добавьте пароль или SSH-ключ для полной проверки авторизации.",
            latency_ms=latency_ms,
        )

    try:
        client = build_ssh_client(
            host=payload.ip,
            port=payload.port,
            username=payload.login,
            password=payload.password_enc,
            key_path=payload.key_path,
        )
        return ConnectionTestResult(ok=True, message="SSH-авторизация прошла успешно.", latency_ms=latency_ms)
    except FileNotFoundError as exc:
        return ConnectionTestResult(ok=False, message=str(exc), latency_ms=latency_ms)
    except Exception as exc:
        return ConnectionTestResult(ok=False, message=f"Ошибка SSH-авторизации: {exc}", latency_ms=latency_ms)
    finally:
        if "client" in locals():
            client.close()


def execute_commands(server: Server, commands: list[str]) -> list[CommandExecutionResult]:
    if not commands:
        return []
    if not server.password_enc and not server.key_path:
        return [
            CommandExecutionResult(
                server_id=server.id,
                server_name=server.name,
                ok=False,
                command="; ".join(commands),
                stdout="",
                stderr="Для сервера не задан пароль или SSH-ключ.",
            )
        ]

    client = build_ssh_client(
        host=server.ip,
        port=server.port,
        username=server.login,
        password=decrypt_secret(server.password_enc),
        key_path=server.key_path,
    )
    results: list[CommandExecutionResult] = []
    try:
        for command in commands:
            stdin, stdout, stderr = client.exec_command(command, timeout=30)
            exit_code = stdout.channel.recv_exit_status()
            results.append(
                CommandExecutionResult(
                    server_id=server.id,
                    server_name=server.name,
                    ok=exit_code == 0,
                    command=command,
                    stdout=stdout.read().decode("utf-8", errors="ignore").strip(),
                    stderr=stderr.read().decode("utf-8", errors="ignore").strip(),
                )
            )
            stdin.close()
        return results
    finally:
        client.close()


def ensure_server_credentials(server: Server) -> None:
    if not server.password_enc and not server.key_path:
        raise ValueError("Для сервера не задан пароль или SSH-ключ.")


def run_command_on_server(server: Server, command: str, timeout: int = 30) -> tuple[int, str, str]:
    ensure_server_credentials(server)
    client = build_ssh_client(
        host=server.ip,
        port=server.port,
        username=server.login,
        password=decrypt_secret(server.password_enc),
        key_path=server.key_path,
    )
    try:
        stdin, stdout, stderr = client.exec_command(command, timeout=timeout)
        exit_code = stdout.channel.recv_exit_status()
        output = stdout.read().decode("utf-8", errors="ignore").strip()
        error = stderr.read().decode("utf-8", errors="ignore").strip()
        stdin.close()
        return exit_code, output, error
    finally:
        client.close()


def wrap_command_for_server_user(server: Server, command: str, run_as_user: str | None = None) -> str:
    target_user = (run_as_user or "").strip()
    if not target_user or target_user == server.login:
        return command

    quoted_command = shlex.quote(command)
    if server.login == "root":
        return f"su - {shlex.quote(target_user)} -c {quoted_command}"
    return f"sudo -iu {shlex.quote(target_user)} bash -lc {quoted_command}"


def stream_command_on_server(server: Server, command: str, timeout: int = 30):
    ensure_server_credentials(server)
    client = build_ssh_client(
        host=server.ip,
        port=server.port,
        username=server.login,
        password=decrypt_secret(server.password_enc),
        key_path=server.key_path,
    )
    try:
        transport = client.get_transport()
        if transport is None:
            raise RuntimeError("SSH transport недоступен.")

        channel = transport.open_session(timeout=timeout)
        channel.settimeout(1.0)
        channel.exec_command(command)

        while True:
            if channel.recv_ready():
                chunk = channel.recv(4096).decode("utf-8", errors="ignore")
                if chunk:
                    yield ("stdout", chunk)
            if channel.recv_stderr_ready():
                chunk = channel.recv_stderr(4096).decode("utf-8", errors="ignore")
                if chunk:
                    yield ("stderr", chunk)
            if channel.exit_status_ready():
                while channel.recv_ready():
                    chunk = channel.recv(4096).decode("utf-8", errors="ignore")
                    if chunk:
                        yield ("stdout", chunk)
                while channel.recv_stderr_ready():
                    chunk = channel.recv_stderr(4096).decode("utf-8", errors="ignore")
                    if chunk:
                        yield ("stderr", chunk)
                break
            time.sleep(0.15)

        yield ("exit", channel.recv_exit_status())
        channel.close()
    finally:
        client.close()


def list_pm2_processes(server: Server, run_as_user: str | None = None) -> list[Pm2ProcessRead]:
    exit_code, output, error = run_command_on_server(
        server,
        wrap_command_for_server_user(server, "pm2 jlist", run_as_user),
        timeout=45,
    )
    if exit_code != 0:
        raise RuntimeError(error or output or "Не удалось выполнить pm2 jlist. Установлен ли PM2 и доступен ли он пользователю?")

    text = (output or "").strip()
    if not text:
        return []

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Некорректный JSON от pm2 jlist: {exc}") from exc

    if not isinstance(data, list):
        raise RuntimeError("Ожидался массив процессов от pm2 jlist.")

    processes: list[Pm2ProcessRead] = []
    for raw in data:
        if not isinstance(raw, dict):
            continue
        pm2_env = raw.get("pm2_env") if isinstance(raw.get("pm2_env"), dict) else {}
        monit = raw.get("monit") if isinstance(raw.get("monit"), dict) else {}
        exec_mode = str(pm2_env.get("exec_mode") or "")
        mode = "cluster" if "cluster" in exec_mode.lower() else "fork"
        pid_raw = raw.get("pid")
        pid: int | None
        try:
            pid = int(pid_raw) if pid_raw not in (None, "", 0, "0") else None
        except (TypeError, ValueError):
            pid = None
        pm_id_raw = raw.get("pm_id")
        try:
            pm_id = int(pm_id_raw) if pm_id_raw is not None else -1
        except (TypeError, ValueError):
            pm_id = -1
        inst_raw = pm2_env.get("instances")
        instances: int | None
        try:
            instances = int(inst_raw) if inst_raw is not None else None
        except (TypeError, ValueError):
            instances = None
        try:
            restarts = int(pm2_env.get("restart_time") or 0)
        except (TypeError, ValueError):
            restarts = 0
        uptime_raw = pm2_env.get("pm_uptime")
        try:
            uptime_ms = int(uptime_raw) if uptime_raw not in (None, "") else None
        except (TypeError, ValueError):
            uptime_ms = None
        try:
            cpu = float(monit.get("cpu") or 0)
        except (TypeError, ValueError):
            cpu = 0.0
        try:
            memory = int(monit.get("memory") or 0)
        except (TypeError, ValueError):
            memory = 0

        processes.append(
            Pm2ProcessRead(
                name=str(raw.get("name") or ""),
                pm_id=pm_id,
                status=str(pm2_env.get("status") or "unknown"),
                mode=mode,
                pid=pid,
                instances=instances,
                cpu=cpu,
                memory=memory,
                restarts=restarts,
                uptime_ms=uptime_ms,
            )
        )

    return processes


def list_linux_users(server: Server) -> list[dict[str, str | None]]:
    awk_script = '($1 == "root") || ($3 >= 1000 && $1 != "nobody") {print $1 "|" $7}'
    command = "sh -lc " + shlex.quote(f"getent passwd | awk -F: '{awk_script}'")
    exit_code, output, error = run_command_on_server(server, command, timeout=20)
    if exit_code != 0:
        raise RuntimeError(error or output or "Не удалось получить список пользователей.")

    users: list[dict[str, str | None]] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        username, shell = (line.split("|", 1) + [""])[:2]
        users.append({"username": username.strip(), "shell": shell.strip() or None})
    return users


def build_linux_user_create_command(
    username: str,
    password: str | None = None,
    ssh_public_key: str | None = None,
    sudo_access: bool = False,
) -> str:
    quoted_username = shlex.quote(username)
    script_lines = [
        "set -e",
        f"username={quoted_username}",
        'if id "$username" >/dev/null 2>&1; then',
        '  echo "Пользователь уже существует."',
        "  exit 10",
        "fi",
        'useradd -m -s /bin/bash "$username"',
    ]
    if password:
        quoted_password = shlex.quote(password)
        script_lines.extend(
            [
                f"password={quoted_password}",
                'echo "$username:$password" | chpasswd',
            ]
        )
    if ssh_public_key:
        quoted_key = shlex.quote(ssh_public_key)
        script_lines.extend(
            [
                'home_dir=$(eval echo "~$username")',
                'mkdir -p "$home_dir/.ssh"',
                'chmod 700 "$home_dir/.ssh"',
                f"printf '%s\\n' {quoted_key} > \"$home_dir/.ssh/authorized_keys\"",
                'chmod 600 "$home_dir/.ssh/authorized_keys"',
                'chown -R "$username:$username" "$home_dir/.ssh"',
            ]
        )
    if sudo_access:
        script_lines.extend(
            [
                'if getent group sudo >/dev/null 2>&1; then usermod -aG sudo "$username"; fi',
                'if getent group wheel >/dev/null 2>&1; then usermod -aG wheel "$username"; fi',
            ]
        )
    script_lines.append('echo "Пользователь создан."')
    return "sh -lc " + shlex.quote("\n".join(script_lines))


def build_linux_user_delete_command(username: str, purge_home: bool = True) -> str:
    quoted_username = shlex.quote(username)
    delete_command = 'userdel -r "$username"' if purge_home else 'userdel "$username"'
    script = "\n".join(
        [
            "set -e",
            f"username={quoted_username}",
            'if ! id "$username" >/dev/null 2>&1; then',
            '  echo "Пользователь не найден."',
            "  exit 11",
            "fi",
            'pkill -u "$username" >/dev/null 2>&1 || true',
            f"{delete_command} >/dev/null 2>&1 || {delete_command}",
            'echo "Пользователь удалён."',
        ]
    )
    return "sh -lc " + shlex.quote(script)


def get_firewall_status(server: Server) -> dict[str, object]:
    command = "sh -lc " + shlex.quote("ufw status numbered")
    exit_code, output, error = run_command_on_server(server, command, timeout=30)
    combined_output = "\n".join(part for part in [output, error] if part).strip()

    if exit_code != 0 and "command not found" in combined_output.lower():
        raise RuntimeError("UFW не установлен на сервере.")

    text = combined_output or output or error or "Статус UFW недоступен."
    lowered = text.lower()
    enabled = "status: active" in lowered
    if "status: inactive" in lowered:
        enabled = False

    rules: list[dict[str, object]] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.lower().startswith("status:"):
            continue
        if stripped.startswith("To") and "Action" in stripped and "From" in stripped:
            continue

        index: int | None = None
        rule_text = stripped
        if stripped.startswith("[") and "]" in stripped:
            prefix, remainder = stripped.split("]", 1)
            digits = "".join(char for char in prefix if char.isdigit())
            if digits:
                index = int(digits)
            rule_text = remainder.strip()

        rules.append({"index": index, "rule": rule_text})

    return {
        "enabled": enabled,
        "status_text": "active" if enabled else "inactive",
        "rules": rules,
        "raw_output": text,
    }


def build_firewall_rule_command(action: str, port: int, protocol: str, source: str | None = None) -> str:
    target_rule = f"{port}/{protocol}"
    source_clause = f" from {source}" if source else ""
    if action == "delete":
        base_command = f"ufw --force delete allow {target_rule}{source_clause}"
    else:
        base_command = f"ufw {action} {target_rule}{source_clause}"
    return "sh -lc " + shlex.quote(base_command)


def build_firewall_toggle_command(enabled: bool) -> str:
    command = "ufw --force enable" if enabled else "ufw disable"
    return "sh -lc " + shlex.quote(command)


def _extract_fail2ban_value(text: str, label: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith(label.lower()):
            parts = stripped.split(":", 1)
            if len(parts) == 2:
                return parts[1].strip()
    return ""


def get_security_report(server: Server) -> dict[str, object]:
    command = """sh -lc '
auth_log=""
if [ -f /var/log/auth.log ]; then auth_log="/var/log/auth.log"; fi
if [ -z "$auth_log" ] && [ -f /var/log/secure ]; then auth_log="/var/log/secure"; fi
echo "__AUTH_LOG_PATH__=${auth_log:-}"
if [ -n "$auth_log" ]; then
  echo "__AUTH_LOG_START__"
  tail -n 80 "$auth_log" 2>/dev/null || true
  echo "__AUTH_LOG_END__"
fi
echo "__LASTB_START__"
if command -v lastb >/dev/null 2>&1; then
  lastb -a | head -n 20 2>/dev/null || true
else
  echo "Команда lastb недоступна."
fi
echo "__LASTB_END__"
echo "__FAIL2BAN_START__"
if command -v fail2ban-client >/dev/null 2>&1; then
  fail2ban-client status 2>&1 || true
else
  echo "fail2ban-client не найден."
fi
echo "__FAIL2BAN_END__"
'"""
    exit_code, output, error = run_command_on_server(server, command, timeout=45)
    text = "\n".join(part for part in [output, error] if part)
    if exit_code != 0 and not text.strip():
        raise RuntimeError("Не удалось получить отчёт по безопасности.")

    auth_log_path = None
    auth_log_excerpt = "Журнал SSH не найден."
    lastb_excerpt = "Команда lastb недоступна или не вернула данных."
    fail2ban_summary = "Fail2Ban не установлен или не запущен."
    fail2ban_jails: list[dict[str, object]] = []

    def extract_block(start_marker: str, end_marker: str) -> str:
        if start_marker not in text or end_marker not in text:
            return ""
        start_index = text.index(start_marker) + len(start_marker)
        end_index = text.index(end_marker, start_index)
        return text[start_index:end_index].strip()

    for line in text.splitlines():
        if line.startswith("__AUTH_LOG_PATH__="):
            auth_log_path = line.split("=", 1)[1].strip() or None
            break

    auth_block = extract_block("__AUTH_LOG_START__", "__AUTH_LOG_END__")
    if auth_block:
        auth_log_excerpt = auth_block

    lastb_block = extract_block("__LASTB_START__", "__LASTB_END__")
    if lastb_block:
        lastb_excerpt = lastb_block

    fail2ban_block = extract_block("__FAIL2BAN_START__", "__FAIL2BAN_END__")
    if fail2ban_block:
        fail2ban_summary = fail2ban_block
        if "Jail list:" in fail2ban_block:
            jail_list_raw = _extract_fail2ban_value(fail2ban_block, "Jail list")
            jail_names = [item.strip() for item in jail_list_raw.split(",") if item.strip()]
            for jail_name in jail_names:
                jail_command = "sh -lc " + shlex.quote(f"fail2ban-client status {shlex.quote(jail_name)}")
                jail_exit_code, jail_output, jail_error = run_command_on_server(server, jail_command, timeout=20)
                jail_text = "\n".join(part for part in [jail_output, jail_error] if part).strip()
                if jail_exit_code != 0 or not jail_text:
                    fail2ban_jails.append({"name": jail_name, "banned_count": 0, "banned_ips": []})
                    continue
                banned_total = _extract_fail2ban_value(jail_text, "Currently banned")
                banned_ips_raw = _extract_fail2ban_value(jail_text, "Banned IP list")
                fail2ban_jails.append(
                    {
                        "name": jail_name,
                        "banned_count": int(banned_total or "0"),
                        "banned_ips": [item for item in banned_ips_raw.split() if item],
                    }
                )

    return {
        "auth_log_path": auth_log_path,
        "auth_log_excerpt": auth_log_excerpt,
        "lastb_excerpt": lastb_excerpt,
        "fail2ban_summary": fail2ban_summary,
        "fail2ban_jails": fail2ban_jails,
    }


def build_kick_user_command(username: str) -> str:
    return "sh -lc " + shlex.quote(f'pkill -u {shlex.quote(username)} || true; echo "Сессии пользователя завершены."')


def build_fail2ban_unban_command(jail: str, ip: str) -> str:
    command = f"fail2ban-client set {shlex.quote(jail)} unbanip {shlex.quote(ip)}"
    return "sh -lc " + shlex.quote(command)


def _format_uptime(total_seconds: int) -> str:
    days, remainder = divmod(max(total_seconds, 0), 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, _ = divmod(remainder, 60)
    if days > 0:
        return f"{days}d {hours}h"
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


def fetch_server_metrics(server: Server) -> dict[str, object]:
    tcp_check = test_ssh_connection(
        ServerConnectionCheck(
            ip=server.ip,
            port=server.port,
            login=server.login,
            password_enc=decrypt_secret(server.password_enc),
            key_path=server.key_path,
        )
    )
    if not tcp_check.ok:
        return {
            "online": False,
            "cpu_percent": 0,
            "ram_percent": 0,
            "disk_percent": 0,
            "uptime": "offline",
        }

    if not server.password_enc and not server.key_path:
        return {
            "online": True,
            "cpu_percent": 0,
            "ram_percent": 0,
            "disk_percent": 0,
            "uptime": "нет SSH-метрик",
        }

    metrics_command = r"""sh -lc '
read _ user nice system idle iowait irq softirq steal _ < /proc/stat
total1=$((user+nice+system+idle+iowait+irq+softirq+steal))
idle1=$((idle+iowait))
sleep 1
read _ user2 nice2 system2 idle2 iowait2 irq2 softirq2 steal2 _ < /proc/stat
total2=$((user2+nice2+system2+idle2+iowait2+irq2+softirq2+steal2))
idle_total2=$((idle2+iowait2))
diff_total=$((total2-total1))
diff_idle=$((idle_total2-idle1))
if [ "$diff_total" -gt 0 ]; then cpu=$((100*(diff_total-diff_idle)/diff_total)); else cpu=0; fi
mem_total=$(awk "/MemTotal/ {print \$2}" /proc/meminfo)
mem_avail=$(awk "/MemAvailable/ {print \$2}" /proc/meminfo)
if [ "$mem_total" -gt 0 ]; then ram=$((100*(mem_total-mem_avail)/mem_total)); else ram=0; fi
disk=$(df -P / | awk "NR==2 {gsub(/%/, \"\", \$5); print \$5}")
uptime=$(awk "{print int(\$1)}" /proc/uptime)
printf "CPU=%s\nRAM=%s\nDISK=%s\nUPTIME=%s\n" "$cpu" "$ram" "${disk:-0}" "${uptime:-0}"
'"""

    exit_code, output, error = run_command_on_server(server, metrics_command, timeout=15)
    if exit_code != 0:
        return {
            "online": True,
            "cpu_percent": 0,
            "ram_percent": 0,
            "disk_percent": 0,
            "uptime": error or "ошибка чтения",
        }

    values: dict[str, str] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    uptime_seconds = int(values.get("UPTIME", "0") or 0)
    return {
        "online": True,
        "cpu_percent": int(values.get("CPU", "0") or 0),
        "ram_percent": int(values.get("RAM", "0") or 0),
        "disk_percent": int(values.get("DISK", "0") or 0),
        "uptime": _format_uptime(uptime_seconds),
    }
