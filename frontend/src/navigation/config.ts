import type { SectionItem } from "./types";

export const sections: SectionItem[] = [
  { path: "/dashboard", label: "Дашборд", description: "Сводка и метрики", group: "overview" },
  { path: "/alerts", label: "Уведомления", description: "Офлайн и оплаты", group: "overview" },
  { path: "/servers", label: "Серверы", description: "Инвентарь и SSH", group: "infrastructure" },
  { path: "/groups", label: "Группы", description: "Структура серверов", group: "infrastructure" },
  { path: "/users", label: "Linux-пользователи", description: "Аккаунты на серверах", group: "infrastructure" },
  { path: "/commands", label: "Команды", description: "Массовые операции", group: "operations" },
  { path: "/automation", label: "Автоматизация", description: "Сценарии и шаблоны", group: "operations" },
  { path: "/terminal", label: "Терминал", description: "Интерактивный SSH", group: "operations" },
  { path: "/pm2", label: "PM2", description: "Node-процессы и cluster", group: "operations" },
  { path: "/patterns", label: "Шаблоны", description: "Готовые команды", group: "operations" },
  { path: "/firewall", label: "Firewall", description: "Порты и UFW", group: "security" },
  { path: "/security", label: "Безопасность", description: "SSH и fail2ban", group: "security" },
  { path: "/sessions", label: "Сессии", description: "Входы в панель", group: "security" },
  { path: "/two-factor", label: "2FA", description: "TOTP и recovery-коды", group: "security" },
  { path: "/telegram", label: "Telegram", description: "Уведомления и тест", group: "security" },
  { path: "/panel-users", label: "Доступ", description: "Пользователи панели", adminOnly: true, group: "administration" },
  { path: "/system", label: "Система", description: "Backup и обслуживание", adminOnly: true, group: "administration" },
  { path: "/audit", label: "Аудит", description: "Журнал действий", adminOnly: true, group: "administration" }
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
  "servers",
  "groups",
  "users",
  "commands",
  "automation",
  "terminal",
  "pm2",
  "patterns",
  "firewall",
  "security",
  "sessions",
  "two-factor",
  "telegram"
] as const;
