import type { Group, Server, ServerMetricSnapshot } from "../../types";
import { isPaymentExpired, isPaymentExpiringSoon } from "./helpers";
import MetricRing from "./MetricRing";
import ServerQuickFields, { type ServerQuickPatch } from "./ServerQuickFields";

type Props = {
  server: Server;
  metric: ServerMetricSnapshot | undefined;
  groups: Group[];
  isEditing: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canEnrollAgent: boolean;
  quickSaving: boolean;
  onEdit: (server: Server) => void;
  onDelete: (id: number) => void;
  onEnrollAgent: (id: number) => void;
  onRefreshMetrics: (id: number) => void;
  onQuickUpdate: (serverId: number, patch: ServerQuickPatch) => Promise<void>;
  metricsRefreshing: boolean;
};

function agentLabel(server: Server): { text: string; tone: "online" | "pending" | "offline" } {
  if (server.agent_online) {
    return { text: "агент онлайн", tone: "online" };
  }
  if (server.agent_enabled) {
    return { text: "агент ждёт связи", tone: "pending" };
  }
  return { text: "агент не установлен", tone: "offline" };
}

function ServerCard({
  server,
  metric,
  groups,
  isEditing,
  canEdit,
  canDelete,
  canEnrollAgent,
  quickSaving,
  onEdit,
  onDelete,
  onEnrollAgent,
  onRefreshMetrics,
  onQuickUpdate,
  metricsRefreshing
}: Props) {
  const agent = agentLabel(server);
  const paymentExpired = isPaymentExpired(server.pay_until);
  const paymentExpiring = isPaymentExpiringSoon(server.pay_until);

  return (
    <article className={`server-card fleet-card ${isEditing ? "is-editing" : ""}`}>
      <div className="fleet-card-head">
        <div className="fleet-card-title">
          <strong>{server.name}</strong>
          <p>
            {server.ip}:{server.port} · {server.login}
          </p>
        </div>
        <div className="badge-row">
          <span className={`status-pill ${metric?.online ? "online" : "offline"}`}>
            SSH {metric?.online ? "онлайн" : "офлайн"}
          </span>
          <span className={`status-pill agent-${agent.tone}`}>{agent.text}</span>
        </div>
      </div>

      <ServerQuickFields
        server={server}
        groups={groups}
        canEdit={canEdit}
        saving={quickSaving}
        onSave={onQuickUpdate}
      />

      <div className="fleet-card-meta">
        {server.provider ? <span className="server-chip muted-chip">{server.provider}</span> : null}
        {server.agent_version ? <span className="server-chip muted-chip">v{server.agent_version}</span> : null}
      </div>

      {server.pay_until ? (
        <p className={`payment-line ${paymentExpired ? "expired" : paymentExpiring ? "expiring" : ""}`}>
          Оплачен до: {new Date(server.pay_until).toLocaleString("ru-RU")}
          {paymentExpired ? " · просрочено" : paymentExpiring ? " · скоро истечёт" : ""}
        </p>
      ) : (
        <p className="muted">Дата оплаты не указана</p>
      )}

      {metric && metric.metrics_available !== false ? (
        <div className="server-metric-visuals">
          <MetricRing label="CPU" value={metric.cpu_percent} tone="sky" compact />
          <MetricRing label="RAM" value={metric.ram_percent} tone="mint" compact />
          <MetricRing label="Disk" value={metric.disk_percent} tone="amber" compact />
          <div className="metric-uptime">
            <span className="muted">Uptime</span>
            <strong>{metric.uptime}</strong>
          </div>
        </div>
      ) : (
        <div className="metric-unavailable">
          <p className="muted">{metric?.uptime ?? "Метрики недоступны — узел офлайн или ещё не опрошен."}</p>
          {server.agent_enabled && !server.agent_online ? (
            <p className="muted">Агент выпущен, но не подключился. Нажми «Выпустить агент» для переустановки или добавь SSH-пароль.</p>
          ) : null}
        </div>
      )}

      {metric?.collected_at ? (
        <p className="metrics-collected-at muted">
          Сохранено: {new Date(metric.collected_at).toLocaleString("ru-RU")}
        </p>
      ) : (
        <p className="metrics-collected-at muted">Состояние ещё не сохранялось</p>
      )}

      <div className="card-actions">
        <button
          type="button"
          className="ghost btn-sm"
          disabled={metricsRefreshing}
          onClick={() => onRefreshMetrics(server.id)}
        >
          {metricsRefreshing ? "Опрос…" : "Обновить метрики"}
        </button>
        {canEdit ? (
          <button className="ghost" type="button" onClick={() => onEdit(server)}>
            {isEditing ? "Редактируется…" : "Редактировать"}
          </button>
        ) : null}
        {canEnrollAgent ? (
          <button className="ghost" type="button" onClick={() => onEnrollAgent(server.id)}>
            Выпустить агент
          </button>
        ) : null}
        {canDelete ? (
          <button className="danger" type="button" onClick={() => onDelete(server.id)}>
            Удалить
          </button>
        ) : null}
      </div>
    </article>
  );
}

export default ServerCard;
