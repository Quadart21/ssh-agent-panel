import shlex

from app.models import Server

_PM2_RESOLVE = """
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
[ -s "/usr/local/nvm/nvm.sh" ] && . "/usr/local/nvm/nvm.sh" >/dev/null 2>&1
[ -f "$HOME/.profile" ] && . "$HOME/.profile" >/dev/null 2>&1
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc" >/dev/null 2>&1
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


def wrap_pm2_command(server: Server, pm2_args: str, run_as_user: str | None = None) -> str:
    inner = build_pm2_subcommand(pm2_args)
    quoted = shlex.quote(inner)
    target_user = (run_as_user or "").strip()
    if not target_user or target_user == server.login:
        return f"bash -lc {quoted}"
    if server.login == "root":
        return f"su - {shlex.quote(target_user)} -c {quoted}"
    return f"sudo -iu {shlex.quote(target_user)} bash -lc {quoted}"
