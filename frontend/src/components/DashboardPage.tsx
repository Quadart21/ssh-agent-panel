import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { isPaymentExpired, isPaymentExpiringSoon } from "./servers/helpers";
import SshAccessPopover from "./dashboard/SshAccessPopover";
import { EmptyState, PageHero, PageShell, PageToolbar, Panel } from "./ui";
import type { Alert, DashboardStats, Group, Server, ServerMetricSnapshot } from "../types";
import { formatMoney } from "../utils/formatMoney";

type Props = {
  stats: DashboardStats | null;
  metrics: ServerMetricSnapshot[];
  servers: Server[];
  groups: Group[];
  alerts: Alert[];
  loading: boolean;
  canViewAccess: boolean;
  canConvertKey: boolean;
  onReload: () => Promise<void>;
  onRefreshAllMetrics: () => Promise<ServerMetricSnapshot[]>;
  onError: (message: string) => void;
};

type SortKey = "name" | "status" | "cpu" | "payment";
type StatusFilter = "all" | "online" | "offline" | "issues" | "expired" | "expiring";

type AttentionItem = {
  key: string;
  level: string;
  title: string;
  message: string;
  serverId: number | null;
  serverName: string | null;
};

function onlineLabel(state: boolean | null) {
  if (state === true) {
    return "online";
  }
  if (state === false) {
    return "offline";
  }
  return "не опрошен";
}

function resolveServerOnline(server: Server, metric: ServerMetricSnapshot | undefined): boolean | null {
  if (metric?.collected_at) {
    return metric.online;
  }
  if (server.agent_online) {
    return true;
  }
  return null;
}

function metricText(value: number | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return `${Math.round(value)}%`;
}

function DashboardPage({
  stats,
  metrics,
  servers,
  groups,
  alerts,
  loading,
  canViewAccess,
  canConvertKey,
  onReload,
  onRefreshAllMetrics,
  onError
}: Props) {
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [search, setSearch] = useState("");
  const [metricsRefreshing, setMetricsRefreshing] = useState(false);
  const [accessServerId, setAccessServerId] = useState<number | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const accessButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.server_id, item])), [metrics]);

  const attentionItems = useMemo(() => {
    const items: AttentionItem[] = [];
    const seenServers = new Set<number>();

    for (const alert of alerts) {
      items.push({
        key: `alert-${alert.category}-${alert.server_id ?? alert.title}`,
        level: alert.level || "warning",
        title: alert.title,
        message: alert.message,
        serverId: alert.server_id,
        serverName: alert.server_name
      });
      if (alert.server_id != null) {
        seenServers.add(alert.server_id);
      }
    }

    for (const server of servers) {
      if (seenServers.has(server.id)) {
        continue;
      }
      const metric = metricMap.get(server.id);
      const online = resolveServerOnline(server, metric);
      if (online === false) {
        items.push({
          key: `offline-${server.id}`,
          level: "critical",
          title: "Сервер офлайн",
          message: `${server.ip}:${server.port}`,
          serverId: server.id,
          serverName: server.name
        });
        continue;
      }
      if (isPaymentExpired(server.pay_until)) {
        items.push({
          key: `expired-${server.id}`,
          level: "critical",
          title: "Оплата просрочена",
          message: server.pay_until ? `до ${new Date(server.pay_until).toLocaleDateString("ru-RU")}` : "дата не указана",
          serverId: server.id,
          serverName: server.name
        });
        continue;
      }
      if (isPaymentExpiringSoon(server.pay_until)) {
        items.push({
          key: `expiring-${server.id}`,
          level: "warning",
          title: "Скоро оплата",
          message: server.pay_until ? `до ${new Date(server.pay_until).toLocaleDateString("ru-RU")}` : "",
          serverId: server.id,
          serverName: server.name
        });
      }
    }

    return items.slice(0, 8);
  }, [alerts, servers, metricMap]);

  const filteredServers = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = servers.filter((server) => {
      if (groupFilter !== "all" && String(server.group_id ?? "") !== groupFilter) {
        return false;
      }
      const metric = metricMap.get(server.id);
      const online = resolveServerOnline(server, metric);
      const paymentExpired = isPaymentExpired(server.pay_until);
      const paymentExpiring = isPaymentExpiringSoon(server.pay_until);
      if (statusFilter === "online" && online !== true) {
        return false;
      }
      if (statusFilter === "offline" && online !== false) {
        return false;
      }
      if (statusFilter === "expired" && !paymentExpired) {
        return false;
      }
      if (statusFilter === "expiring" && (paymentExpired || !paymentExpiring)) {
        return false;
      }
      if (statusFilter === "issues" && online === true && !paymentExpired && !paymentExpiring && server.agent_online) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [server.name, server.ip, server.login, server.group_name ?? "", server.provider ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    items = [...items].sort((a, b) => {
      const metricA = metricMap.get(a.id);
      const metricB = metricMap.get(b.id);
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, "ru");
      }
      if (sortKey === "cpu") {
        return (metricB?.cpu_percent ?? -1) - (metricA?.cpu_percent ?? -1);
      }
      if (sortKey === "payment") {
        const payA = a.pay_until ? new Date(a.pay_until).getTime() : Number.MAX_SAFE_INTEGER;
        const payB = b.pay_until ? new Date(b.pay_until).getTime() : Number.MAX_SAFE_INTEGER;
        return payA - payB;
      }
      const onlineA = resolveServerOnline(a, metricA);
      const onlineB = resolveServerOnline(b, metricB);
      const rank = (state: boolean | null) => (state === true ? 2 : state === false ? 0 : 1);
      return rank(onlineB) - rank(onlineA) || a.name.localeCompare(b.name, "ru");
    });
    return items;
  }, [servers, groupFilter, statusFilter, search, sortKey, metricMap]);

  const activeServer = servers.find((server) => server.id === accessServerId) ?? null;

  function openAccess(serverId: number, button: HTMLButtonElement) {
    setAccessServerId(serverId);
    setAnchorRect(button.getBoundingClientRect());
  }

  function closeAccess() {
    setAccessServerId(null);
    setAnchorRect(null);
  }

  async function handleRefreshMetrics() {
    onError("");
    setMetricsRefreshing(true);
    try {
      await onRefreshAllMetrics();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось обновить состояние серверов.");
    } finally {
      setMetricsRefreshing(false);
    }
  }

  function applyKpiFilter(next: StatusFilter) {
    setStatusFilter((current) => (current === next ? "all" : next));
  }

  return (
    <PageShell className="dashboard-page">
      <PageHero
        eyebrow="Обзор"
        title="Дашборд"
        description="Состояние парка: доступность, оплаты и быстрый доступ к серверам."
        actions={
          <>
            <button type="button" disabled={metricsRefreshing} onClick={() => void handleRefreshMetrics()}>
              {metricsRefreshing ? "Опрос…" : "Обновить"}
            </button>
            <Link to="/servers" className="button-link ghost-link">
              Серверы
            </Link>
          </>
        }
      />

      <div className="dashboard-kpi-rows">
        <div className="dashboard-kpi-row">
          <KpiCard label="Всего" value={stats?.total_servers ?? 0} hint={`${stats?.groups_total ?? 0} групп`} tone="sky" />
          <KpiCard
            label="Онлайн"
            value={stats?.online_servers ?? 0}
            hint="доступны по SSH"
            tone="mint"
            active={statusFilter === "online"}
            onClick={() => applyKpiFilter("online")}
          />
          <KpiCard
            label="Офлайн"
            value={stats?.offline_servers ?? 0}
            hint="нет ответа"
            tone="danger"
            active={statusFilter === "offline"}
            onClick={() => applyKpiFilter("offline")}
          />
          <KpiCard label="Агенты" value={stats?.agent_online ?? 0} hint="heartbeat < 90с" tone="ice" />
        </div>
        <div className="dashboard-kpi-row dashboard-kpi-row--risk">
          <KpiCard
            label="Расход / мес"
            value={formatMoney(stats?.monthly_spend ?? 0, stats?.monthly_currency ?? "RUB")}
            hint={`${stats?.password_auth_count ?? 0} пароль · ${stats?.key_auth_count ?? 0} ключ`}
            tone="rose"
          />
          <KpiCard
            label="Просрочено"
            value={stats?.payment_expired ?? 0}
            hint="оплата истекла"
            tone="danger"
            active={statusFilter === "expired"}
            onClick={() => applyKpiFilter("expired")}
          />
          <KpiCard
            label="Скоро оплата"
            value={stats?.expiring_soon ?? 0}
            hint="менее 3 дней"
            tone="warning"
            active={statusFilter === "expiring"}
            onClick={() => applyKpiFilter("expiring")}
          />
        </div>
      </div>

      <Panel
        title="Требуют внимания"
        description={attentionItems.length ? `${attentionItems.length} пунктов` : "Критичных проблем нет"}
        actions={
          <Link to="/alerts" className="muted">
            Все уведомления
          </Link>
        }
      >
        {attentionItems.length === 0 ? (
          <EmptyState title="Всё спокойно" description="Офлайн-серверов и срочных оплат нет." />
        ) : (
          <div className="dashboard-attention-list">
            {attentionItems.map((item) => (
              <article key={item.key} className={`dashboard-attention-item ${item.level}`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.serverName ? `${item.serverName} · ` : ""}
                    {item.message}
                  </p>
                </div>
                <div className="dashboard-attention-meta">
                  {item.serverName ? <span className="muted">{item.serverName}</span> : null}
                  {item.serverId != null ? (
                    <Link to="/servers" className="button-link ghost-link btn-sm">
                      К серверам
                    </Link>
                  ) : (
                    <Link to="/alerts" className="button-link ghost-link btn-sm">
                      Открыть
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <PageToolbar
        meta={loading ? "Обновление…" : `${filteredServers.length} из ${servers.length}`}
        actions={
          statusFilter !== "all" || groupFilter !== "all" || search ? (
            <button
              type="button"
              className="ghost btn-sm"
              onClick={() => {
                setStatusFilter("all");
                setGroupFilter("all");
                setSearch("");
              }}
            >
              Сбросить
            </button>
          ) : null
        }
      >
        <label className="toolbar-search">
          Поиск
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, IP, логин, группа…" />
        </label>
        <label>
          Группа
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="all">Все</option>
            {groups.map((group) => (
              <option key={group.id} value={String(group.id)}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Статус
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">Все</option>
            <option value="online">Онлайн</option>
            <option value="offline">Офлайн</option>
            <option value="issues">Требуют внимания</option>
            <option value="expired">Просрочена оплата</option>
            <option value="expiring">Скоро оплата</option>
          </select>
        </label>
        <label>
          Сортировка
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="status">По статусу</option>
            <option value="name">По имени</option>
            <option value="cpu">По CPU</option>
            <option value="payment">По оплате</option>
          </select>
        </label>
      </PageToolbar>

      <Panel title="Обзор парка" description="Компактный список серверов">
        {filteredServers.length === 0 ? (
          <EmptyState title="Ничего не найдено" description="Измените фильтры или сбросьте поиск." />
        ) : (
          <div className="dashboard-table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Сервер</th>
                  <th>Статус</th>
                  <th>Нагрузка</th>
                  <th>Группа</th>
                  <th>Оплата</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredServers.map((server) => {
                  const metric = metricMap.get(server.id);
                  const online = resolveServerOnline(server, metric);
                  const paymentExpired = isPaymentExpired(server.pay_until);
                  const paymentExpiring = isPaymentExpiringSoon(server.pay_until);
                  const pillTone = online === true ? "online" : online === false ? "offline" : "pending";
                  return (
                    <tr key={server.id}>
                      <td>
                        <div className="dashboard-table-name">
                          <strong>{server.name}</strong>
                          <span>
                            {server.ip}:{server.port}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-pill ${pillTone}`}>{onlineLabel(online)}</span>
                      </td>
                      <td>
                        {metric?.metrics_available !== false && metric ? (
                          <div className="dashboard-table-metrics">
                            <span>
                              CPU <b>{metricText(metric.cpu_percent)}</b>
                            </span>
                            <span>
                              RAM <b>{metricText(metric.ram_percent)}</b>
                            </span>
                            <span>
                              Disk <b>{metricText(metric.disk_percent)}</b>
                            </span>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{server.group_name ?? "—"}</td>
                      <td>
                        {paymentExpired ? (
                          <span className="server-chip danger-chip">просрочено</span>
                        ) : paymentExpiring ? (
                          <span className="server-chip warning-chip">скоро</span>
                        ) : server.pay_until ? (
                          <span className="muted">{new Date(server.pay_until).toLocaleDateString("ru-RU")}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {canViewAccess ? (
                          <button
                            type="button"
                            className="ghost btn-sm"
                            ref={(node) => {
                              if (node) {
                                accessButtonRefs.current.set(server.id, node);
                              } else {
                                accessButtonRefs.current.delete(server.id);
                              }
                            }}
                            onClick={(event) => openAccess(server.id, event.currentTarget)}
                          >
                            Доступ
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Быстрые действия">
        <div className="dashboard-quick-links">
          <Link to="/commands">Команды</Link>
          <Link to="/automation">Автоматизация</Link>
          <Link to="/terminal">Терминал</Link>
          <Link to="/pm2">PM2</Link>
          <Link to="/firewall">Firewall</Link>
        </div>
      </Panel>

      {activeServer && anchorRect && canViewAccess ? (
        <SshAccessPopover
          serverId={activeServer.id}
          serverName={activeServer.name}
          anchorRect={anchorRect}
          pinned
          canConvert={canConvertKey}
          onClose={closeAccess}
          onPin={() => undefined}
          onKeepOpen={() => undefined}
          onScheduleClose={() => undefined}
          onConverted={() => void onReload()}
          onError={onError}
        />
      ) : null}
    </PageShell>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  active = false,
  onClick
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: "sky" | "mint" | "amber" | "rose" | "ice" | "warning" | "danger";
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `dashboard-kpi-card ${tone}${active ? " is-active" : ""}${onClick ? " is-clickable" : ""}`;
  const body = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <p className="muted">{hint}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }
  return <article className={className}>{body}</article>;
}

export default DashboardPage;
