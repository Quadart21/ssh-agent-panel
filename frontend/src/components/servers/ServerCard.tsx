import { useEffect, useRef, useState } from "react";

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
  onConvertToKey?: (serverId: number) => Promise<void>;
  convertingToKey?: boolean;
  metricsRefreshing: boolean;
};

function agentLabel(server: Server): { text: string; tone: "online" | "pending" | "offline" } {
  if (server.agent_online) {
    return { text: "агент онлайн", tone: "online" };
  }
  if (server.agent_enabled) {
    return { text: "агент ждёт", tone: "pending" };
  }
  return { text: "нет агента", tone: "offline" };
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
  onConvertToKey,
  convertingToKey,
  metricsRefreshing
}: Props) {
  const agent = agentLabel(server);
  const paymentExpired = isPaymentExpired(server.pay_until);
  const paymentExpiring = isPaymentExpiringSoon(server.pay_until);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  const canConvert = Boolean(canEdit && onConvertToKey && (server.auth_method === "password" || server.has_password));
  const hasMore = canConvert || canDelete;

  return (
    <article className={`server-card fleet-card ${isEditing ? "is-editing" : ""}`}>
      <div className="fleet-card-zone">
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
          <span className="server-chip muted-chip">
            {server.auth_method === "key"
              ? "ключ"
              : server.auth_method === "password" || server.has_password
                ? "пароль"
                : "нет SSH"}
          </span>
          {server.provider ? <span className="server-chip muted-chip">{server.provider}</span> : null}
          {server.agent_version ? <span className="server-chip muted-chip">v{server.agent_version}</span> : null}
        </div>

        <ServerQuickFields
          server={server}
          groups={groups}
          canEdit={canEdit}
          saving={quickSaving}
          onSave={onQuickUpdate}
        />
      </div>

      <div className="fleet-card-zone">
        {server.pay_until ? (
          <p className={`payment-line ${paymentExpired ? "expired" : paymentExpiring ? "expiring" : ""}`}>
            Оплата до {new Date(server.pay_until).toLocaleDateString("ru-RU")}
            {paymentExpired ? " · просрочено" : paymentExpiring ? " · скоро" : ""}
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
            <p className="muted">{metric?.uptime ?? "Метрики недоступны"}</p>
          </div>
        )}
      </div>

      <div className="fleet-card-zone">
        <div className="fleet-card-actions-row">
          {canEdit ? (
            <button className="ghost btn-sm" type="button" onClick={() => onEdit(server)}>
              {isEditing ? "Редактируется…" : "Изменить"}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost btn-sm"
            disabled={metricsRefreshing}
            onClick={() => onRefreshMetrics(server.id)}
          >
            {metricsRefreshing ? "Опрос…" : "Метрики"}
          </button>
          {canEnrollAgent ? (
            <button className="ghost btn-sm" type="button" onClick={() => onEnrollAgent(server.id)}>
              Агент
            </button>
          ) : null}
          {hasMore ? (
            <div className="fleet-more-menu" ref={moreRef}>
              <button type="button" className="ghost btn-sm" onClick={() => setMoreOpen((open) => !open)}>
                Ещё
              </button>
              {moreOpen ? (
                <div className="fleet-more-dropdown">
                  {canConvert && onConvertToKey ? (
                    <button
                      className="ghost btn-sm"
                      type="button"
                      disabled={convertingToKey}
                      onClick={() => {
                        setMoreOpen(false);
                        void onConvertToKey(server.id);
                      }}
                    >
                      {convertingToKey ? "Ключ…" : "Перевести на ключ"}
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      className="danger btn-sm"
                      type="button"
                      onClick={() => {
                        setMoreOpen(false);
                        onDelete(server.id);
                      }}
                    >
                      Удалить
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default ServerCard;
