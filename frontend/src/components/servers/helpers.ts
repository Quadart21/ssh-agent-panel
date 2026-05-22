import type { Server, ServerAccountingSummary, ServerMetricSnapshot } from "../../types";
import type { AgentFilter, FleetFilters, FleetStats, StatusFilter } from "./types";

const EXPIRING_SOON_DAYS = 3;

export function isPaymentExpired(payUntil: string | null): boolean {
  if (!payUntil) {
    return false;
  }
  return new Date(payUntil).getTime() < Date.now();
}

export function isPaymentExpiringSoon(payUntil: string | null, days = EXPIRING_SOON_DAYS): boolean {
  if (!payUntil) {
    return false;
  }
  const deadline = new Date(payUntil).getTime();
  const now = Date.now();
  if (deadline < now) {
    return false;
  }
  return deadline - now <= days * 24 * 60 * 60 * 1000;
}

export function computeFleetStats(
  servers: Server[],
  metrics: ServerMetricSnapshot[],
  accounting: ServerAccountingSummary | null
): FleetStats {
  const onlineIds = new Set(metrics.filter((item) => item.online).map((item) => item.server_id));

  return {
    total: servers.length,
    online: servers.filter((server) => onlineIds.has(server.id)).length,
    offline: servers.filter((server) => !onlineIds.has(server.id)).length,
    agentOnline: servers.filter((server) => server.agent_online).length,
    expiringSoon: servers.filter((server) => isPaymentExpiringSoon(server.pay_until)).length,
    monthlySpend: accounting?.total_monthly ?? null,
    currency: accounting?.primary_currency ?? "RUB"
  };
}

function matchesStatus(serverId: number, status: StatusFilter, metrics: ServerMetricSnapshot[]): boolean {
  if (status === "all") {
    return true;
  }
  const metric = metrics.find((item) => item.server_id === serverId);
  const online = metric?.online ?? false;
  return status === "online" ? online : !online;
}

function matchesAgent(server: Server, agent: AgentFilter): boolean {
  if (agent === "all") {
    return true;
  }
  if (agent === "online") {
    return server.agent_online;
  }
  if (agent === "pending") {
    return server.agent_enabled && !server.agent_online;
  }
  return !server.agent_enabled;
}

export function filterServers(
  servers: Server[],
  metrics: ServerMetricSnapshot[],
  filters: FleetFilters
): Server[] {
  const query = filters.query.trim().toLowerCase();

  return servers.filter((server) => {
    if (filters.groupId && String(server.group_id ?? "") !== filters.groupId) {
      return false;
    }
    if (!matchesStatus(server.id, filters.status, metrics)) {
      return false;
    }
    if (!matchesAgent(server, filters.agent)) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [
      server.name,
      server.ip,
      server.login,
      server.group_name ?? "",
      server.provider ?? ""
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}
