import json
import shlex

from app.models import Server

_PM2_RESOLVE = """
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/bin:/usr/local/bin:$PATH"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
[ -s "/usr/local/nvm/nvm.sh" ] && . "/usr/local/nvm/nvm.sh" >/dev/null 2>&1
if [ -d "$HOME/.fnm" ]; then
  export PATH="$HOME/.fnm:$PATH"
fi
PM2_BIN=$(command -v pm2 2>/dev/null)
if [ -z "$PM2_BIN" ] && [ -d "$HOME/.nvm/versions/node" ]; then
  PM2_BIN=$(find "$HOME/.nvm/versions/node" -maxdepth 3 -name pm2 -type f 2>/dev/null | head -1)
fi
if [ -z "$PM2_BIN" ] && [ -x /usr/local/bin/pm2 ]; then PM2_BIN=/usr/local/bin/pm2; fi
if [ -z "$PM2_BIN" ]; then
  echo "pm2: command not found. Установите: npm install -g pm2" >&2
  exit 127
fi
""".strip()


def build_pm2_subcommand(pm2_args: str) -> str:
    pm2_args = pm2_args.strip()
    return f'{_PM2_RESOLVE}; "$PM2_BIN" {pm2_args}'


def build_pm2_jlist_subcommand() -> str:
    return (
        f'{_PM2_RESOLVE}; '
        f'OUT=$("$PM2_BIN" jlist 2>/dev/null); '
        f'case "$OUT" in "["* ) ;; * ) OUT=$("$PM2_BIN" list --json 2>/dev/null) ;; esac; '
        f'printf "%s" "$OUT"'
    )


def extract_pm2_json_array(text: str) -> str | None:
    if not text:
        return None
    cleaned = text.strip().lstrip("\ufeff")
    if not cleaned:
        return None
    if cleaned.startswith("["):
        return cleaned
    start = cleaned.find("[")
    if start == -1:
        return None
    end = cleaned.rfind("]")
    if end <= start:
        return None
    return cleaned[start : end + 1]


def parse_pm2_jlist_payload(stdout: str, stderr: str) -> list[dict] | None:
    for candidate in (stdout, stderr, f"{stdout}\n{stderr}"):
        json_text = extract_pm2_json_array(candidate)
        if not json_text:
            continue
        try:
            data = json.loads(json_text)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]
        if isinstance(data, dict):
            processes = data.get("processes")
            if isinstance(processes, list):
                return [item for item in processes if isinstance(item, dict)]
    return None


def wrap_pm2_command(server: Server, pm2_args: str, run_as_user: str | None = None) -> str:
    inner = build_pm2_subcommand(pm2_args)
    return _wrap_login_shell(server, inner, run_as_user)


def wrap_pm2_jlist_command(server: Server, run_as_user: str | None = None) -> str:
    inner = build_pm2_jlist_subcommand()
    return _wrap_login_shell(server, inner, run_as_user)


def _wrap_login_shell(server: Server, inner: str, run_as_user: str | None = None) -> str:
    quoted = shlex.quote(inner)
    target_user = (run_as_user or "").strip()
    if not target_user or target_user == server.login:
        return f"bash -lc {quoted}"
    if server.login == "root":
        return f"su - {shlex.quote(target_user)} -c {quoted}"
    return f"sudo -iu {shlex.quote(target_user)} bash -lc {quoted}"
