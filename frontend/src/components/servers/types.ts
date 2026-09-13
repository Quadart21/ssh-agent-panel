export type ServerForm = {
  name: string;
  ip: string;
  port: number;
  login: string;
  password_enc: string;
  key_path: string;
  group_id: string;
  pay_until: string;
  monthly_cost: string;
  billing_period: string;
  currency: string;
  provider: string;
  setup_cost: string;
  notes: string;
  test_connection: boolean;
};

export type ServerViewTab = "fleet" | "form" | "bulk" | "accounting";

export type StatusFilter = "all" | "online" | "offline";

export type AgentFilter = "all" | "online" | "pending" | "none";

export type PaymentFilter = "all" | "expiring" | "expired";

export type FleetFilters = {
  query: string;
  groupId: string;
  status: StatusFilter;
  agent: AgentFilter;
  payment: PaymentFilter;
};

export type FleetStatKey = "total" | "online" | "offline" | "agentOnline" | "expiringSoon";

export type FleetStats = {
  total: number;
  online: number;
  offline: number;
  agentOnline: number;
  expiringSoon: number;
  monthlySpend: number | null;
  currency: string;
};
