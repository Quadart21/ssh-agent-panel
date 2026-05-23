import type { Server, ServerMetricSnapshot } from "../../types";
import { billingPeriodLabel, formatMoney } from "../../utils/formatMoney";
import { isPaymentExpired, isPaymentExpiringSoon } from "./helpers";
import MetricRing from "./MetricRing";

type Props = {
  server: Server;
  metric: ServerMetricSnapshot | undefined;
  isEditing: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canEnrollAgent: boolean;
  onEdit: (server: Server) => void;
  onDelete: (id: number) => void;
  onEnrollAgent: (id: number) => void;
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
  isEditing,
  canEdit,
  canDelete,
  canEnrollAgent,
  onEdit,
  onDelete,
  onEnrollAgent
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

      <div className="fleet-card-meta">
        <span className="server-chip">{server.group_name ?? "Без группы"}</span>
        {server.provider ? <span className="server-chip muted-chip">{server.provider}</span> : null}
        {server.agent_version ? <span className="server-chip muted-chip">v{server.agent_version}</span> : null}
      </div>

      {server.monthly_cost != null ? (
        <p className="accounting-line">
          {formatMoney(server.monthly_cost, server.currency)}{" "}
          <span className="muted">{billingPeriodLabel(server.billing_period)}</span>
          {server.monthly_equivalent != null && server.billing_period !== "monthly" ? (
            <> · ≈ {formatMoney(server.monthly_equivalent, server.currency)} / мес.</>
          ) : null}
        </p>
      ) : (
        <p className="muted">Стоимость не указана</p>
      )}

      {server.pay_until ? (
        <p className={`payment-line ${paymentExpired ? "expired" : paymentExpiring ? "expiring" : ""}`}>
          Оплачен до: {new Date(server.pay_until).toLocaleString("ru-RU")}
          {paymentExpired ? " · просрочено" : paymentExpiring ? " · скоро истечёт" : ""}
        </p>
      ) : (
        <p className="muted">Дата оплаты не указана</p>
      )}

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
      ) : (
        <p className="muted">Метрики недоступны — узел офлайн или ещё не опрошен.</p>
      )}

      <div className="card-actions">
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
