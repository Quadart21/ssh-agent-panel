import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import MetricRing from "./servers/MetricRing";
import { isPaymentExpired, isPaymentExpiringSoon } from "./servers/helpers";
import SshAccessPopover from "./dashboard/SshAccessPopover";
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

function authLabel(method: Server["auth_method"] | undefined, hasPassword?: boolean) {
  if (method === "key") {
    return "Ключ";
  }
  if (method === "password" || hasPassword) {
    return "Пароль";
  }
  return "Нет доступа";
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

function onlineLabel(state: boolean | null) {
  if (state === true) {
    return "online";
  }
  if (state === false) {
    return "offline";
  }
  return "не опрошен";
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
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "issues">("all");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [search, setSearch] = useState("");
  const [metricsRefreshing, setMetricsRefreshing] = useState(false);
  const [hoveredServerId, setHoveredServerId] = useState<number | null>(null);
  const [pinnedServerId, setPinnedServerId] = useState<number | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const metricMap = useMemo(() => new Map(metrics.map((item) => [item.server_id, item])), [metrics]);

  const filteredServers = useMemo(() => {
    const query = search.trim().toLowerCase();
    let items = servers.filter((server) => {
      if (groupFilter !== "all" && String(server.group_id ?? "") !== groupFilter) {
        return false;
      }
      const metric = metricMap.get(server.id);
      const online = resolveServerOnline(server, metric);
      const paymentIssue = isPaymentExpired(server.pay_until) || isPaymentExpiringSoon(server.pay_until);
      if (statusFilter === "online" && online !== true) {
        return false;
      }
      if (statusFilter === "offline" && online !== false) {
        return false;
      }
      if (statusFilter === "issues" && online === true && !paymentIssue && server.agent_online) {
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

  const activePopoverId = pinnedServerId ?? hoveredServerId;
  const activeServer = servers.find((server) => server.id === activePopoverId) ?? null;

  function openPopover(serverId: number, rect: DOMRect) {
    if (!canViewAccess) {
      return;
    }
    setHoveredServerId(serverId);
    setAnchorRect(rect);
  }

  function scheduleClosePopover() {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = window.setTimeout(() => {
      if (!pinnedServerId) {
        closePopover();
      }
    }, 180);
  }

  function keepPopoverOpen(serverId: number) {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setHoveredServerId(serverId);
  }

  function closePopover() {
    setHoveredServerId(null);
    setPinnedServerId(null);
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

  return (
    <div className="page-stack dashboard-v2">
      <section className="page-hero dashboard-hero">
        <div>
          <p className="eyebrow">Дашборд</p>
          <h1>Операционный центр парка серверов</h1>
          <p className="hero-copy">
            Сводка по доступности, нагрузке, оплате и SSH-доступу. Наведите на сервер, чтобы увидеть данные для
            подключения, или закрепите карточку кликом.
          </p>
        </div>
        <div className="dashboard-hero-actions">
          <button type="button" className="button-link" disabled={metricsRefreshing} onClick={() => void handleRefreshMetrics()}>
            {metricsRefreshing ? "Опрос серверов…" : "Обновить состояние"}
          </button>
          <Link to="/servers" className="button-link ghost-link">
            Управление серверами
          </Link>
          <Link to="/terminal" className="button-link ghost-link">
            Терминал
          </Link>
        </div>
      </section>

      <section className="dashboard-kpi-grid">
        <KpiCard label="Всего серверов" value={stats?.total_servers ?? 0} hint={`${stats?.groups_total ?? 0} групп`} tone="sky" />
        <KpiCard label="Онлайн" value={stats?.online_servers ?? 0} hint={`${stats?.offline_servers ?? 0} офлайн`} tone="mint" />
        <KpiCard label="Агенты" value={stats?.agent_online ?? 0} hint="heartbeat < 90с" tone="ice" />
        <KpiCard
          label="Средняя нагрузка"
          value={`${stats?.avg_cpu ?? 0}%`}
          hint={`RAM ${stats?.avg_ram ?? 0}% · Disk ${stats?.avg_disk ?? 0}%`}
          tone="amber"
          raw
        />
        <KpiCard
          label="Расход / мес"
          value={formatMoney(stats?.monthly_spend ?? 0, stats?.monthly_currency ?? "RUB")}
          hint={`${stats?.password_auth_count ?? 0} пароль · ${stats?.key_auth_count ?? 0} ключ`}
          tone="rose"
          raw
        />
        <KpiCard
          label="Оплата"
          value={stats?.expiring_soon ?? 0}
          hint={`${stats?.payment_expired ?? 0} просрочено · ${stats?.expiring_soon ?? 0} < 3д`}
          tone="warning"
        />
      </section>

      <section className="dashboard-toolbar panel">
        <label className="dashboard-search">
          <span>Поиск</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя, IP, логин, группа..." />
        </label>
        <label>
          <span>Группа</span>
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="all">Все группы</option>
            {groups.map((group) => (
              <option key={group.id} value={String(group.id)}>
                {group.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Статус</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Props["statusFilter"])}>
            <option value="all">Все</option>
            <option value="online">Онлайн</option>
            <option value="offline">Офлайн</option>
            <option value="issues">Требуют внимания</option>
          </select>
        </label>
        <label>
          <span>Сортировка</span>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="status">По статусу</option>
            <option value="name">По имени</option>
            <option value="cpu">По CPU</option>
            <option value="payment">По оплате</option>
          </select>
        </label>
        <span className="muted dashboard-toolbar-meta">{loading ? "Обновление..." : `Показано ${filteredServers.length} из ${servers.length}`}</span>
      </section>

      <section className="dashboard-main-grid">
        <article className="panel dashboard-servers-panel">
          <div className="panel-head">
            <h2>Серверы</h2>
            <span className="muted">{canViewAccess ? "Наведите для SSH-доступа" : "Нет прав на просмотр доступа"}</span>
          </div>
          {filteredServers.length === 0 ? <p className="muted">Серверы не найдены по текущим фильтрам.</p> : null}
          <div className="dashboard-server-grid">
            {filteredServers.map((server) => {
              const metric = metricMap.get(server.id);
              const paymentExpired = isPaymentExpired(server.pay_until);
              const paymentExpiring = isPaymentExpiringSoon(server.pay_until);
              const online = resolveServerOnline(server, metric);
              const cardTone = online === true ? "online" : online === false ? "offline" : "unknown";
              const pillTone = online === true ? "online" : online === false ? "offline" : "pending";
              return (
                <article
                  key={server.id}
                  className={`dashboard-server-card ${cardTone} ${activePopoverId === server.id ? "active" : ""}`}
                  onMouseEnter={(event) => {
                    if (pinnedServerId || !canViewAccess) {
                      return;
                    }
                    if (hoverTimerRef.current) {
                      window.clearTimeout(hoverTimerRef.current);
                    }
                    hoverTimerRef.current = window.setTimeout(() => {
                      openPopover(server.id, event.currentTarget.getBoundingClientRect());
                    }, 350);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimerRef.current) {
                      window.clearTimeout(hoverTimerRef.current);
                      hoverTimerRef.current = null;
                    }
                    if (!pinnedServerId) {
                      scheduleClosePopover();
                    }
                  }}
                  onClick={(event) => {
                    if (!canViewAccess) {
                      return;
                    }
                    event.stopPropagation();
                    setPinnedServerId(server.id);
                    setHoveredServerId(server.id);
                    setAnchorRect(event.currentTarget.getBoundingClientRect());
                  }}
                >
                  <div className="dashboard-server-card-head">
                    <div>
                      <strong>{server.name}</strong>
                      <p>
                        {server.ip}:{server.port} · {server.login}
                      </p>
                    </div>
                    <span className={`status-pill ${pillTone}`}>{onlineLabel(online)}</span>
                  </div>

                  <div className="dashboard-server-tags">
                    <span className="server-chip">{server.group_name ?? "Без группы"}</span>
                    <span className="server-chip muted-chip">{authLabel(server.auth_method, server.has_password)}</span>
                    {server.agent_online ? <span className="server-chip online-chip">agent</span> : null}
                    {paymentExpired ? <span className="server-chip danger-chip">оплата</span> : null}
                    {!paymentExpired && paymentExpiring ? <span className="server-chip warning-chip">скоро оплата</span> : null}
                  </div>

                  {metric?.metrics_available !== false && metric ? (
                    <div className="dashboard-server-metrics">
                      <MetricRing label="CPU" value={metric.cpu_percent} tone="sky" compact />
                      <MetricRing label="RAM" value={metric.ram_percent} tone="mint" compact />
                      <MetricRing label="Disk" value={metric.disk_percent} tone="amber" compact />
                    </div>
                  ) : (
                    <p className="muted dashboard-server-empty-metric">{metric?.uptime ?? "Метрики не собраны"}</p>
                  )}

                  <div className="dashboard-server-foot">
                    <span className="muted">{metric?.uptime ?? "—"}</span>
                    {server.monthly_equivalent != null ? (
                      <span>{formatMoney(server.monthly_equivalent, server.currency)} / мес</span>
                    ) : (
                      <span className="muted">без стоимости</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </article>

        <aside className="dashboard-side-stack">
          <article className="panel">
            <div className="panel-head">
              <h2>Алерты</h2>
              <Link to="/alerts" className="muted">
                Все
              </Link>
            </div>
            <div className="list-stack">
              {alerts.slice(0, 6).map((alert, index) => (
                <article className={`mini-card alert-card ${alert.level}`} key={`${alert.category}-${index}`}>
                  <strong>{alert.title}</strong>
                  <p>{alert.message}</p>
                  {alert.server_name ? <span className="muted">{alert.server_name}</span> : null}
                </article>
              ))}
              {alerts.length === 0 ? (
                <article className="mini-card">
                  <strong>Всё спокойно</strong>
                  <p>Критичных алертов нет.</p>
                </article>
              ) : null}
            </div>
          </article>

          <article className="panel">
            <h2>Быстрые действия</h2>
            <div className="dashboard-quick-links">
              <Link to="/commands">Массовые команды</Link>
              <Link to="/automation">Автоматизация</Link>
              <Link to="/pm2">PM2</Link>
              <Link to="/firewall">Firewall</Link>
            </div>
          </article>
        </aside>
      </section>

      {activeServer && anchorRect && canViewAccess ? (
        <SshAccessPopover
          serverId={activeServer.id}
          serverName={activeServer.name}
          anchorRect={anchorRect}
          pinned={pinnedServerId === activeServer.id}
          canConvert={canConvertKey}
          onClose={closePopover}
          onPin={() => setPinnedServerId(activeServer.id)}
          onKeepOpen={() => keepPopoverOpen(activeServer.id)}
          onScheduleClose={scheduleClosePopover}
          onConverted={() => void onReload()}
          onError={onError}
        />
      ) : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  tone,
  raw = false
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: "sky" | "mint" | "amber" | "rose" | "ice" | "warning";
  raw?: boolean;
}) {
  return (
    <article className={`dashboard-kpi-card ${tone}`}>
      <span>{label}</span>
      <strong>{raw ? value : value}</strong>
      <p className="muted">{hint}</p>
    </article>
  );
}

export default DashboardPage;
