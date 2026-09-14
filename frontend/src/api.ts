import type {
  Alert,
  AgentEnrollResponse,
  AccountingBudget,
  AccountingCalendarEvent,
  AccountingMarkPaidResponse,
  AccountingOverview,
  AccountingPayment,
  AccountingPlan,
  AccountingReport,
  AutomationPreset,
  AuditLog,
  BulkCommandResponse,
  BulkAgentReinstallResponse,
  BulkServerCreateResponse,
  CloudflareBootstrap,
  CloudflareDnsRecord,
  CloudflareSettings,
  CloudflareStatus,
  CloudflareZone,
  ConnectionTestResult,
  DashboardStats,
  FirewallStatus,
  Group,
  InfraAsset,
  LinuxUser,
  LinuxUserOperationResponse,
  MetricsEmbed,
  NotificationSettings,
  PanelUserCreated,
  PublicEmbedMetrics,
  SecurityReport,
  Server,
  ServerAccess,
  ServerAccountingSummary,
  ServerConvertToKeyResult,
  SshKeyDeployResult,
  SshKeysOverview,
  ServerMetricSnapshot,
  TelegramStatus,
  TelegramWebhookInfo,
  PanelSshKeyInfo,
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

export function getApiBaseUrl() {
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

function formatApiDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg ?? item);
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return "Запрос завершился ошибкой.";
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
    const isAuthMeRequest = path === "/auth/me";
    if (response.status === 401 || (response.status === 400 && isAuthMeRequest)) {
      setStoredToken(null);
    }
    const payload = await response.json().catch(() => ({ detail: "Непредвиденная ошибка API." }));
    throw new ApiError(formatApiDetail(payload.detail), response.status);
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
  sendTelegramTypedTest: (eventType: string) =>
    request<TmuxActionResponse>(`/notifications/telegram/test/${encodeURIComponent(eventType)}`, {
      method: "POST"
    }),
  sendTelegramAlerts: () =>
    request<TmuxActionResponse>("/notifications/telegram/alerts", {
      method: "POST"
    }),
  telegramWebhookInfo: () => request<TelegramWebhookInfo>("/notifications/telegram/webhook-info"),
  registerTelegramWebhook: () =>
    request<TmuxActionResponse>("/notifications/telegram/webhook/set", {
      method: "POST"
    }),
  unregisterTelegramWebhook: () =>
    request<TmuxActionResponse>("/notifications/telegram/webhook/set", {
      method: "DELETE"
    }),
  listPanelUsers: () => request<User[]>("/panel-users"),
  generatePanelUserPassword: () => request<{ password: string }>("/panel-users/generate-password"),
  createPanelUser: (payload: Record<string, unknown>) =>
    request<PanelUserCreated>("/panel-users", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updatePanelUser: (id: number, payload: Record<string, unknown>) =>
    request<User>(`/panel-users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  deletePanelUser: (id: number) => request<void>(`/panel-users/${id}`, { method: "DELETE" }),
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
  downloadFilezillaExport: async () => {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE}/servers/export/filezilla`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Не удалось выгрузить FileZilla XML." }));
      throw new ApiError(formatApiDetail(payload.detail), response.status);
    }
    return response.blob();
  },
  importFilezilla: async (file: File) => {
    const token = getStoredToken();
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`${API_BASE}/servers/import/filezilla`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ detail: "Не удалось импортировать FileZilla XML." }));
      throw new ApiError(formatApiDetail(payload.detail), response.status);
    }
    return response.json() as Promise<BulkServerCreateResponse>;
  },
  listAlerts: () => request<Alert[]>("/servers/alerts"),
  listServers: () => request<Server[]>("/servers"),
  serversAccounting: () => request<ServerAccountingSummary>("/servers/accounting"),
  accountingOverview: () => request<AccountingOverview>("/accounting/overview"),
  accountingCalendar: () => request<AccountingCalendarEvent[]>("/accounting/calendar"),
  accountingReports: (params?: { from?: string; to?: string }) => {
    const query = new URLSearchParams();
    if (params?.from) query.set("from", params.from);
    if (params?.to) query.set("to", params.to);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request<AccountingReport>(`/accounting/reports${suffix}`);
  },
  listInfraAssets: () => request<InfraAsset[]>("/accounting/assets"),
  createInfraAsset: (payload: Record<string, unknown>) =>
    request<InfraAsset>("/accounting/assets", { method: "POST", body: JSON.stringify(payload) }),
  updateInfraAsset: (id: number, payload: Record<string, unknown>) =>
    request<InfraAsset>(`/accounting/assets/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteInfraAsset: (id: number) => request<void>(`/accounting/assets/${id}`, { method: "DELETE" }),
  listAccountingPayments: () => request<AccountingPayment[]>("/accounting/payments"),
  createAccountingPayment: (payload: Record<string, unknown>) =>
    request<AccountingPayment>("/accounting/payments", { method: "POST", body: JSON.stringify(payload) }),
  updateAccountingPayment: (id: number, payload: Record<string, unknown>) =>
    request<AccountingPayment>(`/accounting/payments/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAccountingPayment: (id: number) => request<void>(`/accounting/payments/${id}`, { method: "DELETE" }),
  listAccountingPlans: () => request<AccountingPlan[]>("/accounting/plans"),
  createAccountingPlan: (payload: Record<string, unknown>) =>
    request<AccountingPlan>("/accounting/plans", { method: "POST", body: JSON.stringify(payload) }),
  updateAccountingPlan: (id: number, payload: Record<string, unknown>) =>
    request<AccountingPlan>(`/accounting/plans/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  completeAccountingPlan: (id: number) =>
    request<AccountingMarkPaidResponse>(`/accounting/plans/${id}/complete`, { method: "POST" }),
  deleteAccountingPlan: (id: number) => request<void>(`/accounting/plans/${id}`, { method: "DELETE" }),
  listAccountingBudgets: (year?: number) => {
    const suffix = year != null ? `?year=${year}` : "";
    return request<AccountingBudget[]>(`/accounting/budgets${suffix}`);
  },
  createAccountingBudget: (payload: Record<string, unknown>) =>
    request<AccountingBudget>("/accounting/budgets", { method: "POST", body: JSON.stringify(payload) }),
  updateAccountingBudget: (id: number, payload: Record<string, unknown>) =>
    request<AccountingBudget>(`/accounting/budgets/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAccountingBudget: (id: number) => request<void>(`/accounting/budgets/${id}`, { method: "DELETE" }),
  accountingMarkPaid: (payload: {
    target_type: "server" | "asset";
    target_id: number;
    amount?: number | null;
    paid_at?: string | null;
    notes?: string | null;
  }) => request<AccountingMarkPaidResponse>("/accounting/mark-paid", { method: "POST", body: JSON.stringify(payload) }),
  createServer: (payload: Record<string, unknown>) =>
    request<Server>("/servers", { method: "POST", body: JSON.stringify(payload) }),
  createServersBulk: (payload: Record<string, unknown>) =>
    request<BulkServerCreateResponse>("/servers/bulk", { method: "POST", body: JSON.stringify(payload) }),
  updateServer: (id: number, payload: Record<string, unknown>) =>
    request<Server>(`/servers/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  patchServerQuick: (id: number, payload: Record<string, unknown>) =>
    request<Server>(`/servers/${id}/quick`, { method: "PATCH", body: JSON.stringify(payload) }),
  getServerAccess: (id: number) => request<ServerAccess>(`/servers/${id}/access`),
  convertServerToKey: (id: number) =>
    request<ServerConvertToKeyResult>(`/servers/${id}/convert-to-key`, { method: "POST" }),
  sshKeysOverview: () => request<SshKeysOverview>("/ssh-keys"),
  generatePanelSshKey: () =>
    request<PanelSshKeyInfo>("/ssh-keys/generate", { method: "POST", body: JSON.stringify({}) }),
  exportPanelSshPrivateKey: () =>
    request<{ private_key: string; public_key: string | null; fingerprint: string | null }>("/ssh-keys/private"),
  deployPanelSshKey: (payload: { server_ids: number[]; remove_password?: boolean }) =>
    request<SshKeyDeployResult>("/ssh-keys/deploy", { method: "POST", body: JSON.stringify(payload) }),
  deleteServer: (id: number) => request<void>(`/servers/${id}`, { method: "DELETE" }),
  enrollServerAgent: (id: number) =>
    request<AgentEnrollResponse>(`/servers/${id}/agent/enroll`, {
      method: "POST"
    }),
  reinstallAllAgents: () =>
    request<BulkAgentReinstallResponse>("/servers/agent/reinstall-all", {
      method: "POST"
    }),
  listMetricEmbeds: () => request<MetricsEmbed[]>("/metric-embeds"),
  createMetricEmbed: (payload: { title: string; server_ids: number[]; theme: "dark" | "light" }) =>
    request<MetricsEmbed>("/metric-embeds", { method: "POST", body: JSON.stringify(payload) }),
  updateMetricEmbed: (id: number, payload: Partial<{ title: string; server_ids: number[]; theme: "dark" | "light"; enabled: boolean }>) =>
    request<MetricsEmbed>(`/metric-embeds/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteMetricEmbed: (id: number) => request<void>(`/metric-embeds/${id}`, { method: "DELETE" }),
  rotateMetricEmbedToken: (id: number) => request<MetricsEmbed>(`/metric-embeds/${id}/rotate-token`, { method: "POST" }),
  getPublicEmbedMetrics: async (token: string) => {
    const response = await fetch(`${getApiBaseUrl()}/embed/${encodeURIComponent(token)}/metrics`);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new ApiError(payload.detail ?? "Не удалось загрузить метрики виджета.", response.status);
    }
    return response.json() as Promise<PublicEmbedMetrics>;
  },
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
  refreshAllMetrics: () =>
    request<ServerMetricSnapshot[]>("/servers/metrics/refresh-all", {
      method: "POST"
    }),
  refreshServerMetrics: (serverId: number) =>
    request<ServerMetricSnapshot>(`/servers/${serverId}/metrics/refresh`, {
      method: "POST"
    }),
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
  getPm2Logs: (
    serverId: number,
    appName: string,
    options?: { lines?: number; runAsUser?: string }
  ) =>
    request<Pm2LogsResponse>(
      appendQuery(`/pm2/${serverId}/apps/${encodeURIComponent(appName)}/logs`, {
        run_as_user: options?.runAsUser,
        lines: options?.lines
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
    }),
  cloudflareSettings: () => request<CloudflareSettings>("/domains/settings"),
  cloudflareBootstrap: (refresh = false) =>
    request<CloudflareBootstrap>(appendQuery("/domains/bootstrap", { refresh: refresh ? "true" : undefined })),
  updateCloudflareSettings: (payload: Record<string, unknown>) =>
    request<CloudflareSettings>("/domains/settings", {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  testCloudflare: () =>
    request<CloudflareStatus>("/domains/test", {
      method: "POST"
    }),
  listCloudflareZones: (refresh = false) =>
    request<CloudflareZone[]>(appendQuery("/domains/zones", { refresh: refresh ? "true" : undefined })),
  listCloudflareRecords: (zoneId: string, params?: { refresh?: boolean }) =>
    request<CloudflareDnsRecord[]>(
      appendQuery(`/domains/zones/${encodeURIComponent(zoneId)}/records`, {
        refresh: params?.refresh ? "true" : undefined
      })
    ),
  createCloudflareRecord: (zoneId: string, payload: Record<string, unknown>) =>
    request<CloudflareDnsRecord>(`/domains/zones/${encodeURIComponent(zoneId)}/records`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCloudflareRecord: (zoneId: string, recordId: string, payload: Record<string, unknown>) =>
    request<CloudflareDnsRecord>(`/domains/zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteCloudflareRecord: (zoneId: string, recordId: string) =>
    request<{ ok: boolean; message: string }>(
      `/domains/zones/${encodeURIComponent(zoneId)}/records/${encodeURIComponent(recordId)}`,
      { method: "DELETE" }
    )
};
