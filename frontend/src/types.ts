export type Group = {
  id: number;
  name: string;
  description: string | null;
  server_count: number;
  created_at: string;
  updated_at: string;
};

export type Server = {
  id: number;
  name: string;
  ip: string;
  port: number;
  login: string;
  password_enc: string | null;
  key_path: string | null;
  group_id: number | null;
  group_name: string | null;
  pay_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Pattern = {
  id: number;
  name: string;
  description: string | null;
  commands: string[];
  created_at: string;
  updated_at: string;
};

export type DashboardStats = {
  total_servers: number;
  online_servers: number;
  expiring_soon: number;
  groups_total: number;
  patterns_total: number;
};

export type ServerMetricSnapshot = {
  server_id: number;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  uptime: string;
  online: boolean;
};

export type ConnectionTestResult = {
  ok: boolean;
  message: string;
  latency_ms: number | null;
};

export type CommandExecutionResult = {
  server_id: number;
  server_name: string;
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
};

export type BulkCommandResponse = {
  results: CommandExecutionResult[];
};

export type TmuxActionResponse = {
  ok: boolean;
  message: string;
};

export type Pm2Process = {
  name: string;
  pm_id: number;
  status: string;
  mode: string;
  pid: number | null;
  instances: number | null;
  cpu: number;
  memory: number;
  restarts: number;
  uptime_ms: number | null;
};

export type Pm2LogsResponse = {
  app_name: string;
  content: string;
};

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  section_permissions: string[];
  action_permissions: string[];
  allowed_server_ids: number[];
};

export type PanelUserForm = {
  email: string;
  full_name: string;
  password: string;
  role: string;
  is_active: boolean;
  section_permissions: string[];
  action_permissions: string[];
  allowed_server_ids: number[];
};

export type TokenResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type TwoFactorStatus = {
  enabled: boolean;
  pending_setup: boolean;
};

export type TwoFactorSetup = {
  secret: string;
  otpauth_url: string;
  qr_svg: string;
  recovery_codes: string[];
};

export type TwoFactorRecoveryCodes = {
  recovery_codes: string[];
};

export type AuditLog = {
  id: number;
  user_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: string | null;
  created_at: string;
};

export type UserSession = {
  id: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  is_current: boolean;
};

export type Alert = {
  level: string;
  category: string;
  title: string;
  message: string;
  server_id: number | null;
  server_name: string | null;
  pay_until: string | null;
};

export type LinuxUser = {
  username: string;
  shell: string | null;
};

export type LinuxUserOperationResult = {
  server_id: number;
  server_name: string;
  ok: boolean;
  username: string;
  action: string;
  message: string;
  stderr: string;
};

export type LinuxUserOperationResponse = {
  results: LinuxUserOperationResult[];
};

export type FirewallRule = {
  index: number | null;
  rule: string;
};

export type FirewallStatus = {
  enabled: boolean;
  status_text: string;
  rules: FirewallRule[];
  raw_output: string;
};

export type Fail2BanJail = {
  name: string;
  banned_count: number;
  banned_ips: string[];
};

export type SecurityReport = {
  auth_log_path: string | null;
  auth_log_excerpt: string;
  lastb_excerpt: string;
  fail2ban_summary: string;
  fail2ban_jails: Fail2BanJail[];
};

export type AutomationPreset = {
  key: string;
  name: string;
  description: string;
  category: string;
  commands: string[];
};

export type TelegramStatus = {
  configured: boolean;
  chat_id: string | null;
};

export type NotificationSettings = {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  configured: boolean;
  scheduler_enabled: boolean;
  scheduler_interval_seconds: number;
  alert_repeat_minutes: number;
  notify_login: boolean;
  notify_server_offline: boolean;
  notify_payment_expired: boolean;
  notify_payment_expiring: boolean;
  notify_automation_failed: boolean;
};
