from app.schemas import AutomationPresetRead

AUTOMATION_PRESETS: list[AutomationPresetRead] = [
    # --- Базовая подготовка ---
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
        key="node_lts_install",
        name="Установить Node.js LTS",
        description="Ставит Node.js через NodeSource. Переменная: NODE_MAJOR (по умолчанию 20).",
        category="Базовая подготовка",
        commands=[
            "apt-get update",
            "apt-get install -y ca-certificates curl gnupg",
            "curl -fsSL https://deb.nodesource.com/setup_$NODE_MAJOR.x | bash -",
            "apt-get install -y nodejs",
            "node --version",
            "npm --version",
        ],
    ),
    AutomationPresetRead(
        key="timezone_ntp",
        name="Часовой пояс и NTP",
        description="Настраивает timezone и синхронизацию времени. Переменная: TZ (например Europe/Moscow).",
        category="Базовая подготовка",
        commands=[
            "timedatectl set-timezone $TZ",
            "timedatectl set-ntp true",
            "timedatectl status",
        ],
    ),
    AutomationPresetRead(
        key="swap_enable",
        name="Включить swap",
        description="Создаёт swap-файл и добавляет в fstab. Переменная: SWAP_SIZE (например 2G).",
        category="Базовая подготовка",
        commands=[
            "test -f /swapfile || (fallocate -l $SWAP_SIZE /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048)",
            "chmod 600 /swapfile",
            "mkswap /swapfile",
            "swapon /swapfile",
            "grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab",
            "free -h",
        ],
    ),
    AutomationPresetRead(
        key="ufw_baseline",
        name="UFW: базовые правила",
        description="Включает UFW, разрешает SSH/HTTP/HTTPS. Переменная: SSH_PORT (по умолчанию 22).",
        category="Базовая подготовка",
        commands=[
            "apt-get update",
            "apt-get install -y ufw",
            "ufw allow $SSH_PORT/tcp",
            "ufw allow 80/tcp",
            "ufw allow 443/tcp",
            "ufw --force enable",
            "ufw status verbose",
        ],
    ),
    AutomationPresetRead(
        key="ssh_hardening",
        name="SSH: базовое усиление",
        description="Отключает вход по паролю и root-login. Убедитесь, что SSH-ключ работает!",
        category="Опасно",
        commands=[
            "apt-get update",
            "apt-get install -y openssh-server",
            """sh -lc 'grep -q "^PasswordAuthentication" /etc/ssh/sshd_config && sed -i "s/^PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config || echo "PasswordAuthentication no" >> /etc/ssh/sshd_config'""",
            """sh -lc 'grep -q "^PermitRootLogin" /etc/ssh/sshd_config && sed -i "s/^PermitRootLogin.*/PermitRootLogin prohibit-password/" /etc/ssh/sshd_config || echo "PermitRootLogin prohibit-password" >> /etc/ssh/sshd_config'""",
            "sshd -t",
            "systemctl reload ssh || systemctl reload sshd",
        ],
    ),
    # --- Обслуживание ---
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
    AutomationPresetRead(
        key="server_audit",
        name="Диагностика сервера",
        description="Сводка: uptime, диск, RAM, топ процессов, load average.",
        category="Обслуживание",
        commands=[
            """sh -lc 'echo "=== uptime ==="; uptime; echo; echo "=== disk ==="; df -h; echo; echo "=== memory ==="; free -h; echo; echo "=== top cpu ==="; ps aux --sort=-%cpu | head -8; echo; echo "=== top mem ==="; ps aux --sort=-%mem | head -8'""",
        ],
    ),
    AutomationPresetRead(
        key="certbot_renew",
        name="Продление SSL (certbot)",
        description="Пробует продлить сертификаты Let's Encrypt через certbot.",
        category="Обслуживание",
        commands=[
            "apt-get update",
            "apt-get install -y certbot || true",
            "certbot renew --noninteractive || certbot renew --dry-run",
        ],
    ),
    AutomationPresetRead(
        key="sync_time",
        name="Синхронизация времени",
        description="Перезапускает службу синхронизации времени и показывает статус.",
        category="Обслуживание",
        commands=[
            "timedatectl set-ntp true",
            "systemctl restart systemd-timesyncd || systemctl restart chrony || true",
            "timedatectl status",
        ],
    ),
    AutomationPresetRead(
        key="reboot_if_required",
        name="Перезагрузка при необходимости",
        description="Перезагружает сервер, если после обновлений требуется reboot.",
        category="Опасно",
        commands=[
            "test -f /var/run/reboot-required && reboot || echo 'Reboot not required'",
        ],
    ),
    AutomationPresetRead(
        key="docker_cleanup",
        name="Очистка Docker",
        description="Удаляет неиспользуемые образы, контейнеры и volumes. Данные могут быть потеряны!",
        category="Опасно",
        commands=[
            "docker system prune -af --volumes",
            "docker volume prune -f || true",
        ],
    ),
    # --- SSH Panel ---
    AutomationPresetRead(
        key="panel_agent_restart",
        name="Перезапуск panel-agent",
        description="Перезапускает службу panel-agent на сервере.",
        category="SSH Panel",
        commands=[
            "systemctl restart panel-agent",
            "systemctl status panel-agent --no-pager -l",
        ],
    ),
    AutomationPresetRead(
        key="panel_agent_retoken",
        name="Обновить токен panel-agent",
        description="Подставляет новый токен в скрипт агента и перезапускает службу. Переменные: AGENT_TOKEN, HEARTBEAT_URL.",
        category="SSH Panel",
        commands=[
            """sh -lc 'test -f /usr/local/bin/panel-agent.py || { echo "panel-agent не установлен"; exit 1; }'""",
            """sh -lc 'sed -i "s|^TOKEN = .*|TOKEN = \\"$AGENT_TOKEN\\"|" /usr/local/bin/panel-agent.py && sed -i "s|^HEARTBEAT_URL = .*|HEARTBEAT_URL = \\"$HEARTBEAT_URL\\"|" /usr/local/bin/panel-agent.py'""",
            "systemctl restart panel-agent",
            "systemctl status panel-agent --no-pager -l",
        ],
    ),
    AutomationPresetRead(
        key="panel_agent_heartbeat_test",
        name="Проверка heartbeat агента",
        description="Отправляет тестовый heartbeat. Переменные: AGENT_TOKEN, HEARTBEAT_URL.",
        category="SSH Panel",
        commands=[
            """curl -sS -w "\\nHTTP:%{http_code}\\n" -X POST "$HEARTBEAT_URL" -H "Content-Type: application/json" -d '{"token":"$AGENT_TOKEN","version":"1.1.0","cpu_percent":1,"ram_percent":1,"disk_percent":1,"uptime":"1s"}'""",
        ],
    ),
    AutomationPresetRead(
        key="logrotate_panel_agent",
        name="Logrotate для panel-agent",
        description="Добавляет ротацию логов journald для panel-agent (syslog не требуется).",
        category="SSH Panel",
        commands=[
            "mkdir -p /etc/systemd/journald.conf.d",
            """sh -lc 'cat > /etc/systemd/journald.conf.d/panel-agent.conf <<\"EOF\"\n[Journal]\nSystemMaxUse=200M\nEOF'""",
            "systemctl restart systemd-journald",
            "journalctl -u panel-agent -n 5 --no-pager",
        ],
    ),
    # --- VPN ---
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
        key="xray_update",
        name="Обновить X-Ray",
        description="Обновляет Xray-core через официальный install-скрипт.",
        category="VPN",
        commands=[
            "bash -lc \"$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)\" @ install",
            "systemctl restart xray",
            "systemctl status xray --no-pager -l",
        ],
    ),
    AutomationPresetRead(
        key="wireguard_install",
        name="Установить WireGuard",
        description="Ставит WireGuard и включает IP-forwarding. Переменные: WG_PORT, WG_INTERFACE (опционально).",
        category="VPN",
        commands=[
            "apt-get update",
            "DEBIAN_FRONTEND=noninteractive apt-get install -y wireguard wireguard-tools",
            """sh -lc 'grep -q "^net.ipv4.ip_forward=1" /etc/sysctl.conf || echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf'""",
            "sysctl -p",
            "wg --version",
        ],
    ),
    AutomationPresetRead(
        key="marzban_install",
        name="Установить Marzban",
        description="Официальный скрипт установки панели Marzban (Xray).",
        category="VPN",
        commands=[
            "apt-get update",
            "apt-get install -y curl socat",
            "bash -c \"$(curl -sL https://github.com/Gozargah/Marzban/raw/master/marzban.sh)\" @ install",
        ],
    ),
    AutomationPresetRead(
        key="xui_install",
        name="Установить 3X-UI",
        description="Установка панели 3X-UI для управления Xray.",
        category="VPN",
        commands=[
            "apt-get update",
            "apt-get install -y curl wget",
            "bash <(curl -Ls https://raw.githubusercontent.com/mhsanaei/3x-ui/master/install.sh)",
        ],
    ),
    # --- Прокси ---
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
        key="caddy_install",
        name="Установить Caddy",
        description="Ставит Caddy и создаёт базовый reverse-proxy. Переменные: DOMAIN, UPSTREAM (например 127.0.0.1:8000).",
        category="Прокси",
        commands=[
            "apt-get update",
            "apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl",
            "curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg",
            """sh -lc 'curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" > /etc/apt/sources.list.d/caddy-stable.list'""",
            "apt-get update",
            "apt-get install -y caddy",
            """sh -lc 'cat > /etc/caddy/Caddyfile <<\"EOF\"\n$DOMAIN {\n    reverse_proxy $UPSTREAM\n}\nEOF'""",
            "systemctl enable caddy --now",
            "systemctl status caddy --no-pager -l",
        ],
    ),
    AutomationPresetRead(
        key="traefik_docker",
        name="Traefik в Docker",
        description="Поднимает Traefik с HTTP/HTTPS entrypoints. Переменные: DOMAIN (для dashboard, опционально).",
        category="Прокси",
        commands=[
            "mkdir -p /opt/traefik",
            """sh -lc 'cat > /opt/traefik/docker-compose.yml <<\"EOF\"\nservices:\n  traefik:\n    image: traefik:v3.0\n    restart: unless-stopped\n    command:\n      - \"--providers.docker=true\"\n      - \"--providers.docker.exposedbydefault=false\"\n      - \"--entrypoints.web.address=:80\"\n      - \"--entrypoints.websecure.address=:443\"\n      - \"--api.dashboard=true\"\n    ports:\n      - \"80:80\"\n      - \"443:443\"\n      - \"8080:8080\"\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock:ro\nEOF'""",
            "docker compose -f /opt/traefik/docker-compose.yml up -d",
        ],
    ),
    # --- Панели ---
    AutomationPresetRead(
        key="fastpanel_install",
        name="Установить FastPanel",
        description="Запускает официальный установщик FastPanel.",
        category="Панели",
        commands=[
            "bash -lc \"wget http://repo.fastpanel.direct/install_fastpanel.sh -O - | bash -\"",
        ],
    ),
    # --- Безопасность ---
    AutomationPresetRead(
        key="fail2ban_ssh",
        name="Установить Fail2Ban (SSH)",
        description="Ставит fail2ban с jail для SSH.",
        category="Безопасность",
        commands=[
            "apt-get update",
            "apt-get install -y fail2ban",
            """sh -lc 'cat > /etc/fail2ban/jail.local <<\"EOF\"\n[DEFAULT]\nbantime = 1h\nfindtime = 10m\nmaxretry = 5\n\n[sshd]\nenabled = true\nEOF'""",
            "systemctl enable fail2ban --now",
            "fail2ban-client status sshd || fail2ban-client status",
        ],
    ),
    AutomationPresetRead(
        key="unattended_upgrades",
        name="Автообновления безопасности",
        description="Включает unattended-upgrades для патчей безопасности.",
        category="Безопасность",
        commands=[
            "apt-get update",
            "apt-get install -y unattended-upgrades apt-listchanges",
            "dpkg-reconfigure -plow unattended-upgrades",
            "systemctl enable unattended-upgrades --now",
        ],
    ),
    AutomationPresetRead(
        key="audit_open_ports",
        name="Аудит: открытые порты",
        description="Показывает слушающие TCP/UDP порты и процессы.",
        category="Безопасность",
        commands=[
            "ss -tulpn",
        ],
    ),
    AutomationPresetRead(
        key="audit_shell_users",
        name="Аудит: пользователи с shell",
        description="Список пользователей с интерактивной оболочкой.",
        category="Безопасность",
        commands=[
            """getent passwd | awk -F: '$7 !~ /(nologin|false)$/ {print $1, $3, $6, $7}'""",
        ],
    ),
    # --- Мониторинг и бэкапы ---
    AutomationPresetRead(
        key="node_exporter_install",
        name="Установить node_exporter",
        description="Ставит Prometheus node_exporter как systemd-сервис. Переменная: EXPORTER_VERSION (например 1.8.2).",
        category="Мониторинг",
        commands=[
            "apt-get update",
            "apt-get install -y curl tar",
            """sh -lc 'curl -fsSL "https://github.com/prometheus/node_exporter/releases/download/v$EXPORTER_VERSION/node_exporter-$EXPORTER_VERSION.linux-amd64.tar.gz" -o /tmp/node_exporter.tgz'""",
            "tar -xzf /tmp/node_exporter.tgz -C /tmp",
            """sh -lc 'install -m 0755 /tmp/node_exporter-$EXPORTER_VERSION.linux-amd64/node_exporter /usr/local/bin/node_exporter'""",
            """sh -lc 'cat > /etc/systemd/system/node_exporter.service <<\"EOF\"\n[Unit]\nDescription=Prometheus Node Exporter\nAfter=network.target\n\n[Service]\nUser=nobody\nExecStart=/usr/local/bin/node_exporter\nRestart=always\n\n[Install]\nWantedBy=multi-user.target\nEOF'""",
            "systemctl daemon-reload",
            "systemctl enable node_exporter --now",
            "systemctl status node_exporter --no-pager -l",
        ],
    ),
    AutomationPresetRead(
        key="backup_opt_tar",
        name="Бэкап /opt",
        description="Архивирует /opt в tar.gz. Переменная: BACKUP_DIR (например /var/backups).",
        category="Мониторинг",
        commands=[
            "mkdir -p $BACKUP_DIR",
            """sh -lc 'tar czf "$BACKUP_DIR/opt-backup-$(date +%Y%m%d-%H%M%S).tar.gz" /opt 2>/dev/null || echo "Nothing to backup in /opt"'""",
            "ls -lh $BACKUP_DIR | tail -5",
        ],
    ),
    AutomationPresetRead(
        key="backup_etc_configs",
        name="Бэкап конфигов (/etc)",
        description="Архивирует nginx, caddy, wireguard, xray из /etc. Переменная: BACKUP_DIR.",
        category="Мониторинг",
        commands=[
            "mkdir -p $BACKUP_DIR",
            """sh -lc 'tar czf "$BACKUP_DIR/etc-configs-$(date +%Y%m%d-%H%M%S).tar.gz" /etc/nginx /etc/caddy /etc/wireguard /etc/xray /usr/local/x-ui 2>/dev/null || true'""",
            "ls -lh $BACKUP_DIR | tail -5",
        ],
    ),
    AutomationPresetRead(
        key="postgresql_backup",
        name="Бэкап PostgreSQL (локальный)",
        description="pg_dumpall на сервере с PostgreSQL. Переменная: BACKUP_DIR.",
        category="Мониторинг",
        commands=[
            "mkdir -p $BACKUP_DIR",
            "apt-get install -y postgresql-client || true",
            """sh -lc 'sudo -u postgres pg_dumpall > "$BACKUP_DIR/pg-all-$(date +%Y%m%d-%H%M%S).sql"'""",
            "ls -lh $BACKUP_DIR | tail -5",
        ],
    ),
]

DEFAULT_AUTOMATION_ENV: dict[str, dict[str, str]] = {
    "node_lts_install": {"NODE_MAJOR": "20"},
    "timezone_ntp": {"TZ": "Europe/Moscow"},
    "swap_enable": {"SWAP_SIZE": "2G"},
    "ufw_baseline": {"SSH_PORT": "22"},
    "caddy_install": {"DOMAIN": "example.com", "UPSTREAM": "127.0.0.1:8000"},
    "node_exporter_install": {"EXPORTER_VERSION": "1.8.2"},
    "backup_opt_tar": {"BACKUP_DIR": "/var/backups"},
    "backup_etc_configs": {"BACKUP_DIR": "/var/backups"},
    "postgresql_backup": {"BACKUP_DIR": "/var/backups"},
    "panel_agent_retoken": {
        "AGENT_TOKEN": "paste-token-from-panel",
        "HEARTBEAT_URL": "https://panel.example.com/api/v1/agent/heartbeat",
    },
    "panel_agent_heartbeat_test": {
        "AGENT_TOKEN": "paste-token-from-panel",
        "HEARTBEAT_URL": "https://panel.example.com/api/v1/agent/heartbeat",
    },
}
