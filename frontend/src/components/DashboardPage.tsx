import type { CSSProperties } from "react";

import type { Alert, DashboardStats, Server, ServerMetricSnapshot } from "../types";

type Props = {
  stats: DashboardStats | null;
  metrics: ServerMetricSnapshot[];
  servers: Server[];
  alerts: Alert[];
  loading: boolean;
};

function DashboardPage({ stats, metrics, servers, alerts, loading }: Props) {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Дашборд</p>
          <h1>Общая картина по всем серверам</h1>
          <p className="hero-copy">
            Главная страница показывает состояние парка серверов: сколько узлов онлайн, где скоро
            истекает оплата и какие машины требуют внимания прямо сейчас.
          </p>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard label="Серверы" value={stats?.total_servers ?? 0} accent="mint" />
        <StatCard label="Онлайн" value={stats?.online_servers ?? 0} accent="sky" />
        <StatCard label="Истекают < 3д" value={stats?.expiring_soon ?? 0} accent="amber" />
        <StatCard label="Группы" value={stats?.groups_total ?? 0} accent="rose" />
        <StatCard label="Шаблоны" value={stats?.patterns_total ?? 0} accent="ice" />
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Состояние серверов</h2>
            <span className="muted">{loading ? "Обновление..." : `Всего: ${servers.length}`}</span>
          </div>
          <div className="server-list">
            {servers.length === 0 ? <p className="muted">Серверов пока нет.</p> : null}
            {servers.map((server) => {
              const metric = metrics.find((item) => item.server_id === server.id);
              return (
                <article className="server-card" key={server.id}>
                  <div className="server-card-row">
                    <div>
                      <strong>{server.name}</strong>
                      <p>
                        {server.ip}:{server.port} · {server.login}
                      </p>
                    </div>
                    <span className={`status-pill ${metric?.online ? "online" : "offline"}`}>
                      {metric?.online ? "онлайн" : "офлайн"}
                    </span>
                  </div>
                  <p className="muted">{server.group_name ?? "Группа не назначена"}</p>
                  {metric ? (
                    <div className="server-metric-visuals">
                      <MetricRing label="CPU" value={metric.cpu_percent} tone="sky" compact />
                      <MetricRing label="RAM" value={metric.ram_percent} tone="mint" compact />
                      <MetricRing label="Disk" value={metric.disk_percent} tone="amber" compact />
                      <div className="metric-uptime">
                        <span className="muted">Uptime</span>
                        <strong>{metric.uptime}</strong>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <h2>Приоритеты</h2>
          <div className="list-stack">
            {alerts.slice(0, 4).map((alert, index) => (
              <article className={`mini-card alert-card ${alert.level}`} key={`${alert.category}-${index}`}>
                <strong>{alert.title}</strong>
                <p>{alert.message}</p>
                {alert.pay_until ? <span>До: {formatDate(alert.pay_until)}</span> : null}
              </article>
            ))}
            {alerts.length === 0 ? (
              <article className="mini-card">
                <strong>Уведомления под контролем</strong>
                <p>Критичных событий нет. Все серверы и оплаты выглядят спокойно.</p>
              </article>
            ) : null}
            <article className="mini-card">
              <strong>Онлайн-контроль</strong>
              <p>Следите за серверами со статусом офлайн и сразу переходите в терминал или PM2.</p>
            </article>
            <article className="mini-card">
              <strong>Платежи</strong>
              <p>Блок истекающих серверов помогает не пропустить оплату в ближайшие 3 дня.</p>
            </article>
            <article className="mini-card">
              <strong>Операции</strong>
              <p>Массовые команды, SSH-терминал и PM2 вынесены в отдельные разделы без перегрузки главной.</p>
            </article>
          </div>
        </article>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

function StatCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <article className={`stat-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function MetricRing({
  label,
  value,
  tone,
  compact = false
}: {
  label: string;
  value: number;
  tone: "sky" | "mint" | "amber";
  compact?: boolean;
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const style = {
    "--metric-value": normalized,
    "--metric-accent":
      tone === "sky" ? "#7cc8ff" : tone === "mint" ? "#6df7c1" : "#ffc56a"
  } as CSSProperties;

  return (
    <div className={`metric-ring ${compact ? "compact" : ""}`} style={style}>
      <div className="metric-ring-graphic">
        <div className="metric-ring-inner">
          <strong>{normalized}%</strong>
        </div>
      </div>
      <span>{label}</span>
    </div>
  );
}

export default DashboardPage;
