import type {
  Alert,
  AutomationPreset,
  AuditLog,
  BulkCommandResponse,
  ConnectionTestResult,
  DashboardStats,
  FirewallStatus,
  Group,
  LinuxUser,
  LinuxUserOperationResponse,
  NotificationSettings,
  Pattern,
  SecurityReport,
  Server,
  ServerMetricSnapshot,
  TelegramStatus,
  Pm2LogsResponse,
  Pm2Process,
  TmuxActionResponse,
  TokenResponse,
  TwoFactorRecoveryCodes,
  TwoFactorSetup,
  TwoFactorStatus,
  UserSession,
  User
} from "./types";

function getApiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/v1`;
  }
  return "/api/v1";
}

export function getTerminalWsBaseUrl() {
  const configured = import.meta.env.VITE_TERMINAL_WS_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/v1/terminal/ws`;
  }
  return "/api/v1/terminal/ws";
}

export function getCommandsWsBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "").replace(/^http:/, "ws:").replace(/^https:/, "wss:") + "/servers/ws/run-commands";
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/api/v1/servers/ws/run-commands`;
  }
  return "/api/v1/servers/ws/run-commands";
}

const API_BASE = getApiBaseUrl();
const TOKEN_KEY = "gui_ssh_manager_token";

function appendQuery(path: string, params: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && `${value}`.trim() !== "") {
      query.set(key, String(value));
    }
  });
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export function getStoredToken() {
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options?.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options
  });

  if (!response.ok) {
    if (response.status === 401) {
      setStoredToken(null);
    }
    const payload = await response.json().catch(() => ({ detail: "Непредвиденная ошибка API." }));
    throw new ApiError(payload.detail ?? "Запрос завершился ошибкой.", response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getCommandsWsBaseUrl,
  login: async (email: string, password: string, otpCode?: string, recoveryCode?: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        otp_code: otpCode || null,
        recovery_code: recoveryCode || null
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Ошибка авторизации." }));
      throw new ApiError(payload.detail ?? "Ошибка авторизации.", response.status);
    }

    return response.json() as Promise<TokenResponse>;
  },
  me: () => request<User>("/auth/me"),
  twoFactorStatus: () => request<TwoFactorStatus>("/auth/2fa/status"),
  twoFactorSetup: () => request<TwoFactorSetup>("/auth/2fa/setup", { method: "POST" }),
  twoFactorEnable: (payload: Record<string, unknown>) =>
    request<TwoFactorStatus>("/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  twoFactorDisable: (payload: Record<string, unknown>) =>
    request<TwoFactorStatus>("/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  regenerateRecoveryCodes: () =>
    request<TwoFactorRecoveryCodes>("/auth/2fa/recovery-codes", {
      method: "POST"
    }),
  logout: () =>
    request<TmuxActionResponse>("/auth/logout", {
      method: "POST"
    }),
  changePassword: (payload: Record<string, unknown>) =>
    request<TmuxActionResponse>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  listSessions: () => request<UserSession[]>("/auth/sessions"),
  logoutAllSessions: () =>
    request<TmuxActionResponse>("/auth/sessions/logout-all", {
      method: "POST"
    }),
  revokeSession: (sessionId: number) =>
    request<TmuxActionResponse>(`/auth/sessions/${sessionId}`, {
      method: "DELETE"
    }),
  telegramStatus: () => request<TelegramStatus>("/notifications/telegram/status"),
  notificationSettings: () => request<NotificationSettings>("/notifications/settings"),
  updateNotificationSettings: (payload: Record<string, unknown>) =>
    request<NotificationSettings>("/notifications/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  sendTelegramTest: () =>
    request<TmuxActionResponse>("/notifications/telegram/test", {
      method: "POST"
    }),
  sendTelegramAlerts: () =>
    request<TmuxActionResponse>("/notifications/telegram/alerts", {
      method: "POST"
    }),
  listPanelUsers: () => request<User[]>("/panel-users"),
  createPanelUser: (payload: Record<string, unknown>) =>
    request<User>("/panel-users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updatePanelUser: (id: number, payload: Record<string, unknown>) =>
    request<User>(`/panel-users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  logoutAllPanelUserSessions: (id: number) =>
    request<TmuxActionResponse>(`/panel-users/${id}/logout-all`, {
      method: "POST"
    }),
  listAutomationPresets: () => request<AutomationPreset[]>("/automation/presets"),
  listAuditLogs: () => request<AuditLog[]>("/audit/logs"),
  downloadAuditLogs: async () => {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE}/audit/logs/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Не удалось выгрузить аудит." }));
      throw new ApiError(payload.detail ?? "Не удалось выгрузить аудит.", response.status);
    }
    return response.blob();
  },
  downloadBackup: async () => {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE}/system/backup/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Не удалось выгрузить резервную копию." }));
      throw new ApiError(payload.detail ?? "Не удалось выгрузить резервную копию.", response.status);
    }
    return response.blob();
  },
  importBackup: async (file: File) => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/system/backup/import`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Не удалось восстановить резервную копию." }));
      throw new ApiError(payload.detail ?? "Не удалось восстановить резервную копию.", response.status);
    }
    return response.json() as Promise<TmuxActionResponse>;
  },
  listAlerts: () => request<Alert[]>("/servers/alerts"),
  listServers: () => request<Server[]>("/servers"),
  createServer: (payload: Record<string, unknown>) =>
    request<Server>("/servers", { method: "POST", body: JSON.stringify(payload) }),
  updateServer: (id: number, payload: Record<string, unknown>) =>
    request<Server>(`/servers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteServer: (id: number) => request<void>(`/servers/${id}`, { method: "DELETE" }),
  listGroups: () => request<Group[]>("/groups"),
  createGroup: (payload: Record<string, unknown>) =>
    request<Group>("/groups", { method: "POST", body: JSON.stringify(payload) }),
  updateGroup: (id: number, payload: Record<string, unknown>) =>
    request<Group>(`/groups/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteGroup: (id: number) => request<void>(`/groups/${id}`, { method: "DELETE" }),
  listPatterns: () => request<Pattern[]>("/patterns"),
  createPattern: (payload: Record<string, unknown>) =>
    request<Pattern>("/patterns", { method: "POST", body: JSON.stringify(payload) }),
  updatePattern: (id: number, payload: Record<string, unknown>) =>
    request<Pattern>(`/patterns/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deletePattern: (id: number) => request<void>(`/patterns/${id}`, { method: "DELETE" }),
  listLinuxUsers: (serverId: number) => request<LinuxUser[]>(`/linux-users/${serverId}`),
  createLinuxUser: (payload: Record<string, unknown>) =>
    request<LinuxUserOperationResponse>("/linux-users/create", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteLinuxUser: (payload: Record<string, unknown>) =>
    request<LinuxUserOperationResponse>("/linux-users/delete", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  firewallStatus: (serverId: number) => request<FirewallStatus>(`/firewall/${serverId}`),
  applyFirewallRule: (serverId: number, payload: Record<string, unknown>) =>
    request<TmuxActionResponse>(`/firewall/${serverId}/rule`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  toggleFirewall: (serverId: number, payload: Record<string, unknown>) =>
    request<TmuxActionResponse>(`/firewall/${serverId}/toggle`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  securityReport: (serverId: number) => request<SecurityReport>(`/security/${serverId}/report`),
  kickUser: (serverId: number, payload: Record<string, unknown>) =>
    request<TmuxActionResponse>(`/security/${serverId}/kick-user`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  unbanFail2BanIp: (serverId: number, payload: Record<string, unknown>) =>
    request<TmuxActionResponse>(`/security/${serverId}/fail2ban/unban`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  runAutomationPreset: (payload: Record<string, unknown>) =>
    request<BulkCommandResponse>("/automation/run", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  dashboard: () => request<DashboardStats>("/servers/dashboard"),
  metrics: () => request<ServerMetricSnapshot[]>("/servers/metrics"),
  listPm2Apps: (serverId: number, runAsUser?: string) =>
    request<Pm2Process[]>(appendQuery(`/pm2/${serverId}/apps`, { run_as_user: runAsUser })),
  startPm2App: (serverId: number, payload: Record<string, unknown>) =>
    request<TmuxActionResponse>(`/pm2/${serverId}/apps`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  stopPm2App: (serverId: number, appName: string, runAsUser?: string) =>
    request<TmuxActionResponse>(
      appendQuery(`/pm2/${serverId}/apps/${encodeURIComponent(appName)}/stop`, { run_as_user: runAsUser }),
      { method: "POST" }
    ),
  restartPm2App: (serverId: number, appName: string, runAsUser?: string) =>
    request<TmuxActionResponse>(
      appendQuery(`/pm2/${serverId}/apps/${encodeURIComponent(appName)}/restart`, { run_as_user: runAsUser }),
      { method: "POST" }
    ),
  deletePm2App: (serverId: number, appName: string, runAsUser?: string) =>
    request<TmuxActionResponse>(
      appendQuery(`/pm2/${serverId}/apps/${encodeURIComponent(appName)}`, { run_as_user: runAsUser }),
      { method: "DELETE" }
    ),
  getPm2Logs: (serverId: number, appName: string, lines?: number, runAsUser?: string) =>
    request<Pm2LogsResponse>(
      appendQuery(`/pm2/${serverId}/apps/${encodeURIComponent(appName)}/logs`, {
        run_as_user: runAsUser,
        lines: lines ?? undefined
      })
    ),
  runCommands: (payload: Record<string, unknown>) =>
    request<BulkCommandResponse>("/servers/run-commands", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  testConnection: (payload: Record<string, unknown>) =>
    request<ConnectionTestResult>("/servers/test-connection", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};
