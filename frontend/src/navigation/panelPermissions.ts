import { permissionSections, sectionGroups, sections } from "./config";

export type AccessLevel = "none" | "view" | "edit";

export type PanelAccessPresetId = "viewer" | "operator" | "editor" | "admin" | "custom";

export type PermissionModule = {
  id: string;
  label: string;
  description: string;
  group: (typeof sectionGroups)[number]["key"];
  sections: string[];
  editActions: string[];
};

export const panelPermissionModules: PermissionModule[] = [
  {
    id: "overview",
    label: "Обзор",
    description: "Дашборд и уведомления",
    group: "overview",
    sections: ["dashboard", "alerts"],
    editActions: []
  },
  {
    id: "fleet",
    label: "Серверы и виджеты",
    description: "Инвентарь, метрики, embed-виджеты",
    group: "infrastructure",
    sections: ["servers", "metric-embeds"],
    editActions: ["server_create", "server_update", "server_delete"]
  },
  {
    id: "groups",
    label: "Группы",
    description: "Структура серверов",
    group: "infrastructure",
    sections: ["groups"],
    editActions: ["group_create", "group_update", "group_delete"]
  },
  {
    id: "domains",
    label: "Домены",
    description: "Cloudflare DNS",
    group: "infrastructure",
    sections: ["domains"],
    editActions: ["domains_manage"]
  },
  {
    id: "linux-users",
    label: "Linux-пользователи",
    description: "Аккаунты на серверах",
    group: "infrastructure",
    sections: ["users"],
    editActions: ["linux_users_manage"]
  },
  {
    id: "commands",
    label: "Команды",
    description: "Массовые SSH-команды",
    group: "operations",
    sections: ["commands"],
    editActions: ["command_run"]
  },
  {
    id: "automation",
    label: "Автоматизация",
    description: "Сценарии и шаблоны запуска",
    group: "operations",
    sections: ["automation", "patterns"],
    editActions: ["automation_run", "pattern_create", "pattern_update", "pattern_delete"]
  },
  {
    id: "terminal",
    label: "Терминал",
    description: "Интерактивный SSH",
    group: "operations",
    sections: ["terminal"],
    editActions: ["terminal_use"]
  },
  {
    id: "pm2",
    label: "PM2",
    description: "Node-процессы",
    group: "operations",
    sections: ["pm2"],
    editActions: ["pm2_use"]
  },
  {
    id: "firewall",
    label: "Firewall",
    description: "Порты и UFW",
    group: "security",
    sections: ["firewall"],
    editActions: ["firewall_manage"]
  },
  {
    id: "security",
    label: "Безопасность",
    description: "SSH, fail2ban, отчёты",
    group: "security",
    sections: ["security", "ssh-keys"],
    editActions: ["security_manage", "ssh_keys_manage"]
  },
  {
    id: "account",
    label: "Аккаунт и уведомления",
    description: "Сессии, 2FA, Telegram",
    group: "security",
    sections: ["sessions", "two-factor", "telegram"],
    editActions: []
  }
];

export const panelAccessPresets: Array<{
  id: PanelAccessPresetId;
  label: string;
  description: string;
  role: "admin" | "user";
  levels: Record<string, AccessLevel>;
}> = [
  {
    id: "viewer",
    label: "Только просмотр",
    description: "Видит метрики и статусы, ничего не меняет",
    role: "user",
    levels: {
      overview: "view",
      fleet: "view",
      groups: "view",
      domains: "view",
      "linux-users": "none",
      commands: "none",
      automation: "none",
      terminal: "none",
      pm2: "none",
      firewall: "none",
      security: "none",
      account: "none"
    }
  },
  {
    id: "operator",
    label: "Оператор",
    description: "Просмотр + команды, терминал и PM2",
    role: "user",
    levels: {
      overview: "view",
      fleet: "view",
      groups: "view",
      domains: "view",
      "linux-users": "none",
      commands: "edit",
      automation: "edit",
      terminal: "edit",
      pm2: "edit",
      firewall: "none",
      security: "view",
      account: "view"
    }
  },
  {
    id: "editor",
    label: "Редактор",
    description: "Может менять серверы, DNS, firewall и пользователей Linux",
    role: "user",
    levels: {
      overview: "view",
      fleet: "edit",
      groups: "edit",
      domains: "edit",
      "linux-users": "edit",
      commands: "edit",
      automation: "edit",
      terminal: "edit",
      pm2: "edit",
      firewall: "edit",
      security: "edit",
      account: "view"
    }
  },
  {
    id: "admin",
    label: "Администратор",
    description: "Полный доступ ко всей панели",
    role: "admin",
    levels: Object.fromEntries(panelPermissionModules.map((module) => [module.id, "edit"])) as Record<string, AccessLevel>
  }
];

const sectionLabelMap = Object.fromEntries(
  sections.map((section) => [section.path.replace(/^\//, ""), section.label])
) as Record<string, string>;

export function sectionLabel(sectionId: string) {
  return sectionLabelMap[sectionId] ?? sectionId;
}

export function defaultModuleLevels(): Record<string, AccessLevel> {
  return Object.fromEntries(panelPermissionModules.map((module) => [module.id, "none"])) as Record<string, AccessLevel>;
}

export function permissionsFromModuleLevels(levels: Record<string, AccessLevel>) {
  const sectionSet = new Set<string>();
  const actionSet = new Set<string>();

  for (const module of panelPermissionModules) {
    const level = levels[module.id] ?? "none";
    if (level === "none") {
      continue;
    }
    module.sections.forEach((section) => sectionSet.add(section));
    if (level === "edit") {
      module.editActions.forEach((action) => actionSet.add(action));
    }
  }

  return {
    section_permissions: permissionSections.filter((section) => sectionSet.has(section)),
    action_permissions: Array.from(actionSet)
  };
}

export function moduleLevelsFromPermissions(sectionPermissions: string[], actionPermissions: string[]) {
  const levels = defaultModuleLevels();
  const sectionSet = new Set(sectionPermissions);
  const actionSet = new Set(actionPermissions);

  for (const module of panelPermissionModules) {
    const hasSection = module.sections.some((section) => sectionSet.has(section));
    if (!hasSection) {
      levels[module.id] = "none";
      continue;
    }
    const hasEdit = module.editActions.some((action) => actionSet.has(action));
    levels[module.id] = hasEdit ? "edit" : "view";
  }

  return levels;
}

export function detectAccessPreset(
  role: string,
  sectionPermissions: string[],
  actionPermissions: string[]
): PanelAccessPresetId {
  if (role === "admin") {
    return "admin";
  }

  for (const preset of panelAccessPresets) {
    if (preset.id === "admin" || preset.id === "custom") {
      continue;
    }
    const derived = permissionsFromModuleLevels(preset.levels);
    const sectionsMatch =
      derived.section_permissions.length === sectionPermissions.length &&
      derived.section_permissions.every((section) => sectionPermissions.includes(section));
    const actionsMatch =
      derived.action_permissions.length === actionPermissions.length &&
      derived.action_permissions.every((action) => actionPermissions.includes(action));
    if (sectionsMatch && actionsMatch) {
      return preset.id;
    }
  }

  return "custom";
}

export function applyAccessPreset(presetId: PanelAccessPresetId) {
  const preset = panelAccessPresets.find((item) => item.id === presetId);
  if (!preset) {
    return {
      role: "user" as const,
      ...permissionsFromModuleLevels(defaultModuleLevels())
    };
  }

  if (preset.id === "admin") {
    return {
      role: "admin" as const,
      section_permissions: [] as string[],
      action_permissions: [] as string[]
    };
  }

  return {
    role: preset.role,
    ...permissionsFromModuleLevels(preset.levels)
  };
}

export function summarizeAccess(role: string, sectionPermissions: string[], actionPermissions: string[]) {
  if (role === "admin") {
    return "Администратор · полный доступ";
  }

  const preset = detectAccessPreset(role, sectionPermissions, actionPermissions);
  if (preset !== "custom") {
    return panelAccessPresets.find((item) => item.id === preset)?.label ?? "Пользователь";
  }

  const viewCount = sectionPermissions.length;
  const editCount = actionPermissions.length;
  return `Свои права · ${viewCount} раздел(ов), ${editCount} действий`;
}

export function createEmptyEditorState(): import("../types").PanelUserForm & {
  preset: PanelAccessPresetId;
  moduleLevels: Record<string, AccessLevel>;
  serverScope: "all" | "selected";
} {
  const preset: PanelAccessPresetId = "viewer";
  const applied = applyAccessPreset(preset);
  const presetConfig = panelAccessPresets.find((item) => item.id === preset)!;
  return {
    email: "",
    full_name: "",
    password: "",
    role: applied.role,
    is_active: true,
    section_permissions: applied.section_permissions,
    action_permissions: applied.action_permissions,
    allowed_server_ids: [],
    notify_telegram: true,
    preset,
    moduleLevels: { ...presetConfig.levels },
    serverScope: "all"
  };
}

export function editorStateFromUser(user: import("../types").User) {
  const preset = detectAccessPreset(user.role, user.section_permissions, user.action_permissions);
  return {
    email: user.email,
    full_name: user.full_name,
    password: "",
    role: user.role,
    is_active: user.is_active,
    section_permissions: user.section_permissions,
    action_permissions: user.action_permissions,
    allowed_server_ids: user.allowed_server_ids,
    notify_telegram: true,
    preset,
    moduleLevels: moduleLevelsFromPermissions(user.section_permissions, user.action_permissions),
    serverScope: user.role === "admin" || user.allowed_server_ids.length === 0 ? ("all" as const) : ("selected" as const)
  };
}
