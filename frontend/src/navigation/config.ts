import type { SectionItem } from "./types";

export const sections: SectionItem[] = [
  { path: "/dashboard", label: "Дашборд", description: "Состояние парка", group: "overview" },
  { path: "/alerts", label: "Уведомления", description: "Офлайн и оплаты", group: "overview" },
  { path: "/accounting", label: "Бухгалтерия", description: "Расходы и бюджеты", group: "overview" },
  { path: "/servers", label: "Серверы", description: "Список и доступ", group: "infrastructure" },
  { path: "/metric-embeds", label: "Виджеты", description: "Метрики на сайт", group: "infrastructure" },
  { path: "/groups", label: "Группы", description: "Группировка", group: "infrastructure" },
  { path: "/domains", label: "Домены", description: "Cloudflare DNS", group: "infrastructure" },
  { path: "/users", label: "Linux-пользователи", description: "Аккаунты", group: "infrastructure" },
  { path: "/commands", label: "Команды", description: "Массовый SSH", group: "operations" },
  { path: "/automation", label: "Автоматизация", description: "Сценарии", group: "operations" },
  { path: "/terminal", label: "Терминал", description: "Интерактивный SSH", group: "operations" },
  { path: "/pm2", label: "PM2", description: "Процессы Node", group: "operations" },
  { path: "/patterns", label: "Шаблоны", description: "Готовые команды", group: "operations" },
  { path: "/firewall", label: "Firewall", description: "Порты и UFW", group: "security" },
  { path: "/security", label: "Безопасность", description: "SSH и fail2ban", group: "security" },
  { path: "/ssh-keys", label: "SSH-ключи", description: "Ключ панели", group: "security" },
  { path: "/sessions", label: "Сессии", description: "Входы в панель", group: "security" },
  { path: "/two-factor", label: "2FA", description: "TOTP и коды", group: "security" },
  { path: "/telegram", label: "Telegram", description: "Уведомления", group: "security" },
  { path: "/panel-users", label: "Доступ", description: "Пользователи", adminOnly: true, group: "administration" },
  { path: "/system", label: "Система", description: "Backup", adminOnly: true, group: "administration" },
  { path: "/audit", label: "Аудит", description: "Журнал", adminOnly: true, group: "administration" }
];

export const sectionGroups: Array<{ key: SectionItem["group"]; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "infrastructure", label: "Инфраструктура" },
  { key: "operations", label: "Операции" },
  { key: "security", label: "Безопасность" },
  { key: "administration", label: "Администрирование" }
];

export const permissionSections = [
  "dashboard",
  "alerts",
  "accounting",
  "servers",
  "metric-embeds",
  "groups",
  "domains",
  "users",
  "commands",
  "automation",
  "terminal",
  "pm2",
  "patterns",
  "firewall",
  "security",
  "ssh-keys",
  "sessions",
  "two-factor",
  "telegram"
] as const;
