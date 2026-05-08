import shlex
from string import Template

from app.schemas import AutomationPresetRead


AUTOMATION_PRESETS: list[AutomationPresetRead] = [
    AutomationPresetRead(
        key="docker_install",
        name="Установить Docker",
        description="Ставит Docker Engine и Docker Compose plugin на Debian/Ubuntu.",
        category="Базовая подготовка",
        commands=[
            "apt-get update",
            "apt-get install -y ca-certificates curl gnupg",
            "install -m 0755 -d /etc/apt/keyrings",
            "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg",
            "chmod a+r /etc/apt/keyrings/docker.gpg",
            """sh -lc 'echo \"deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable\" > /etc/apt/sources.list.d/docker.list'""",
            "apt-get update",
            "apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
            "systemctl enable docker --now",
        ],
    ),
    AutomationPresetRead(
        key="nginx_proxy_manager",
        name="Установить Nginx Proxy Manager",
        description="Поднимает Nginx Proxy Manager в Docker Compose.",
        category="Прокси",
        commands=[
            "mkdir -p /opt/nginx-proxy-manager",
            """sh -lc 'cat > /opt/nginx-proxy-manager/docker-compose.yml <<\"EOF\"\nservices:\n  app:\n    image: \"jc21/nginx-proxy-manager:latest\"\n    restart: unless-stopped\n    ports:\n      - \"80:80\"\n      - \"81:81\"\n      - \"443:443\"\n    volumes:\n      - ./data:/data\n      - ./letsencrypt:/etc/letsencrypt\nEOF'""",
            "docker compose -f /opt/nginx-proxy-manager/docker-compose.yml up -d",
        ],
    ),
    AutomationPresetRead(
        key="xray_install",
        name="Установить X-Ray",
        description="Запускает официальный install-скрипт Xray-core.",
        category="VPN",
        commands=[
            "bash -lc \"$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)\" @ install",
            "systemctl enable xray --now",
        ],
    ),
    AutomationPresetRead(
        key="fastpanel_install",
        name="Установить FastPanel",
        description="Запускает официальный установщик FastPanel.",
        category="Панели",
        commands=[
            "bash -lc \"wget http://repo.fastpanel.direct/install_fastpanel.sh -O - | bash -\"",
        ],
    ),
    AutomationPresetRead(
        key="system_update",
        name="Обновить систему",
        description="Обновляет пакеты и чистит устаревшие зависимости.",
        category="Обслуживание",
        commands=[
            "apt-get update",
            "DEBIAN_FRONTEND=noninteractive apt-get upgrade -y",
            "apt-get autoremove -y",
        ],
    ),
]


def list_automation_presets() -> list[AutomationPresetRead]:
    return AUTOMATION_PRESETS


def get_automation_preset(preset_key: str) -> AutomationPresetRead:
    for preset in AUTOMATION_PRESETS:
        if preset.key == preset_key:
            return preset
    raise KeyError(preset_key)


def render_automation_commands(commands: list[str], custom_env: dict[str, str]) -> list[str]:
    rendered: list[str] = []
    template_values = {key: value for key, value in custom_env.items()}
    export_prefix = ""
    if template_values:
        export_parts = [f"{key}={shlex.quote(value)}" for key, value in template_values.items()]
        export_prefix = "export " + " ".join(export_parts) + "; "

    for command in commands:
        prepared = Template(command).safe_substitute(template_values)
        if export_prefix:
            rendered.append("sh -lc " + shlex.quote(export_prefix + prepared))
        else:
            rendered.append(prepared)
    return rendered
