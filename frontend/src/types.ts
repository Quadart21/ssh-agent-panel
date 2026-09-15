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
  monthly_cost: number | null;
  billing_period: string;
  currency: string;
  provider: string | null;
  setup_cost: number | null;
  monthly_equivalent: number | null;
  agent_enabled: boolean;
  agent_version: string | null;
  agent_last_seen_at: string | null;
  agent_online: boolean;
  auth_method: "password" | "key" | "none";
  has_password: boolean;
  key_fingerprint: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ServerAccess = {
  server_id: number;
  server_name: string;
  ip: string;
  port: number;
  login: string;
  auth_method: "password" | "key" | "none";
  password: string | null;
  private_key: string | null;
  public_key: string | null;
  key_fingerprint: string | null;
  ssh_command: string;
  ssh_command_with_key: string | null;
};

export type ServerConvertToKeyResult = {
  ok: boolean;
  message: string;
  auth_method: string;
  key_fingerprint: string;
  private_key: string;
  public_key: string;
  ssh_command: string;
};

export type PanelSshKeyInfo = {
  configured: boolean;
  fingerprint: string | null;
  public_key: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ServerKeyBindingStatus = "panel_bound" | "unbound" | "outdated" | "individual" | "no_access";

export type ServerKeyBinding = {
  server_id: number;
  server_name: string;
  ip: string;
  port: number;
  login: string;
  group_name: string | null;
  binding_status: ServerKeyBindingStatus;
  can_deploy: boolean;
  panel_key_deployed_at: string | null;
  auth_method: string;
};

export type SshKeysOverview = {
  panel_key: PanelSshKeyInfo | null;
  stats: Record<string, number>;
  servers: ServerKeyBinding[];
};

export type SshKeyDeployResult = {
  total: number;
  ok: number;
  failed: number;
  results: Array<{
    server_id: number;
    server_name: string;
    ok: boolean;
    message: string;
    binding_status?: string | null;
  }>;
};

export type ServerAccountingItem = {
  server_id: number;
  server_name: string;
  group_name: string;
  provider: string | null;
  monthly_cost: number | null;
  billing_period: string;
  currency: string;
  monthly_equivalent: number | null;
  pay_until: string | null;
  setup_cost: number | null;
};

export type ServerAccountingGroupTotal = {
  group_name: string;
  currency: string;
  monthly_total: number;
  server_count: number;
};

export type ServerAccountingSummary = {
  primary_currency: string;
  total_monthly: number;
  total_yearly: number;
  total_setup_cost: number;
  servers_with_cost: number;
  servers_without_cost: number;
  totals_by_currency: Record<string, number>;
  by_group: ServerAccountingGroupTotal[];
  items: ServerAccountingItem[];
};

export type InfraAssetCategory = "domain" | "cdn" | "license" | "server" | "other";

export type InfraAsset = {
  id: number;
  name: string;
  category: InfraAssetCategory | string;
  provider: string | null;
  cost: number | null;
  billing_period: string;
  currency: string;
  pay_until: string | null;
  notes: string | null;
  monthly_equivalent: number | null;
  created_at: string;
  updated_at: string;
};

export type AccountingPayment = {
  id: number;
  paid_at: string;
  amount: number;
  currency: string;
  title: string;
  category: string;
  server_id: number | null;
  asset_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingPlan = {
  id: number;
  title: string;
  amount: number;
  currency: string;
  due_date: string;
  category: string;
  server_id: number | null;
  asset_id: number | null;
  status: "planned" | "paid" | "cancelled" | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountingBudget = {
  id: number;
  year: number;
  month: number;
  currency: string;
  planned_amount: number;
  category: string | null;
  actual_amount: number;
  created_at: string;
  updated_at: string;
};

export type AccountingCalendarEvent = {
  source: "server" | "asset" | "plan" | string;
  source_id: number;
  title: string;
  category: string;
  provider: string | null;
  amount: number | null;
  currency: string;
  due_date: string;
  status: "overdue" | "today" | "upcoming" | string;
  billing_period: string | null;
};

export type AccountingOverview = {
  primary_currency: string;
  monthly_recurring: number;
  yearly_forecast: number;
  assets_monthly: number;
  servers_monthly: number;
  budget_planned: number | null;
  budget_actual: number;
  budget_remaining: number | null;
  upcoming_7d: AccountingCalendarEvent[];
  upcoming_month: AccountingCalendarEvent[];
  upcoming_month_total: number;
  overdue: AccountingCalendarEvent[];
  top_expenses: Array<{ label: string; amount: number; currency: string }>;
};

export type AccountingReportBreakdown = {
  key: string;
  label: string;
  amount: number;
  currency: string;
  count: number;
};

export type AccountingReport = {
  primary_currency: string;
  period_from: string;
  period_to: string;
  total_paid: number;
  payments_count: number;
  by_category: AccountingReportBreakdown[];
  by_provider: AccountingReportBreakdown[];
  by_month: AccountingReportBreakdown[];
  by_group: AccountingReportBreakdown[];
  recurring_monthly: number;
};

export type CryptoSpreadOrder = {
  task_id: number;
  pair: string;
  give_xml: string;
  get_xml: string;
  completed_at: string | null;
  client_gave: number;
  client_gave_usdt: number;
  ps_fee: number;
  ps_fee_usdt: number;
  paid_out: number;
  paid_out_usdt: number;
  system_earned_usdt: number;
  course_display: string | null;
  merchant_provider: string | null;
};

export type CryptoSpreadPairStat = {
  pair: string;
  orders_count: number;
  client_gave_usdt: number;
  ps_fee_usdt: number;
  paid_out_usdt: number;
  system_earned_usdt: number;
};

export type CryptoSpreadReport = {
  source: string;
  currency: string;
  orders_count: number;
  scanned_count: number;
  client_gave_usdt: number;
  ps_fee_usdt: number;
  paid_out_usdt: number;
  system_earned_usdt: number;
  pairs: CryptoSpreadPairStat[];
  orders: CryptoSpreadOrder[];
};

export type AccountingMarkPaidResponse = {
  payment: AccountingPayment;
  pay_until: string | null;
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
  offline_servers: number;
  agent_online: number;
  expiring_soon: number;
  payment_expired: number;
  groups_total: number;
  patterns_total: number;
  avg_cpu: number;
  avg_ram: number;
  avg_disk: number;
  password_auth_count: number;
  key_auth_count: number;
  monthly_spend: number;
  monthly_currency: string;
};

export type ServerMetricSnapshot = {
  server_id: number;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  uptime: string;
  online: boolean;
  metrics_available?: boolean;
  collected_at?: string | null;
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

export type AgentEnrollResponse = {
  ok: boolean;
  message: string;
  token: string;
  install_script: string;
  installed?: boolean;
  install_error?: string | null;
};

export type BulkAgentReinstallItemResult = {
  server_id: number;
  server_name: string;
  ok: boolean;
  installed: boolean;
  message: string;
};

export type BulkAgentReinstallResponse = {
  total: number;
  installed: number;
  failed: number;
  skipped: number;
  results: BulkAgentReinstallItemResult[];
};

export type BulkServerCreateItemResult = {
  name: string;
  ip: string;
  ok: boolean;
  server_id: number | null;
  message: string;
};

export type BulkServerCreateResponse = {
  total: number;
  created: number;
  skipped?: number;
  failed: number;
  results: BulkServerCreateItemResult[];
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
  lines: number;
  pages: number;
  lines_per_page: number;
  truncated: boolean;
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
  notify_telegram: boolean;
};

export type PanelUserCreated = User & {
  issued_password: string;
  telegram_sent: boolean;
  telegram_note: string | null;
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

export type MetricEmbedTheme = "dark" | "light" | "midnight" | "slate" | "ocean";

export type MetricsEmbed = {
  id: number;
  title: string;
  token: string;
  server_ids: number[];
  theme: MetricEmbedTheme;
  accent_color: string | null;
  enabled: boolean;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  embed_url: string;
  iframe_code: string;
};

export type PublicEmbedServerMetrics = {
  name: string;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  uptime: string;
  online: boolean;
  metrics_available?: boolean;
};

export type PublicEmbedMetrics = {
  title: string;
  theme: MetricEmbedTheme;
  accent_color: string | null;
  updated_at: string;
  servers: PublicEmbedServerMetrics[];
};

export type AutomationPreset = {
  key: string;
  name: string;
  description: string;
  category: string;
  commands: string[];
  default_env?: Record<string, string>;
};

export type TelegramStatus = {
  configured: boolean;
  chat_id: string | null;
};

export type TelegramWebhookInfo = {
  configured: boolean;
  webhook_url: string | null;
  webhook_active: boolean;
  telegram_webhook_url: string | null;
};

export type NotificationSettings = {
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  telegram_topic_general: number | null;
  telegram_topic_login: number | null;
  telegram_topic_servers: number | null;
  telegram_topic_payments: number | null;
  telegram_topic_automation: number | null;
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

export type CloudflareSettings = {
  api_token: string | null;
  account_id: string | null;
  default_ttl: number;
  configured: boolean;
};

export type CloudflareStatus = {
  configured: boolean;
  message?: string | null;
};

export type CloudflareZone = {
  id: string;
  name: string;
  status: string;
  paused: boolean;
  type: string;
  name_servers: string[];
};

export type CloudflareBootstrap = {
  settings: CloudflareSettings;
  zones: CloudflareZone[];
};

export type CloudflareDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean | null;
  comment: string | null;
  priority: number | null;
  created_on: string | null;
  modified_on: string | null;
  relative_name: string;
  is_subdomain: boolean;
};

export type CloudflareDnsRecordForm = {
  type: string;
  name: string;
  content: string;
  ttl: string;
  proxied: boolean;
  comment: string;
  priority: string;
};
