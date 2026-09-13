import { useEffect, useRef, useState } from "react";

import type { Group, Server, ServerMetricSnapshot } from "../../types";
import { formatMoney, billingPeriodLabel } from "../../utils/formatMoney";
import { isPaymentExpired, isPaymentExpiringSoon } from "./helpers";
import MetricBar from "./MetricBar";
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
    return { text: "агент", tone: "online" };
  }
  if (server.agent_enabled) {
    return { text: "агент…", tone: "pending" };
  }
  return { text: "без агента", tone: "offline" };
}

function authLabel(server: Server): string {
  if (server.auth_method === "key") {
    return "ключ";
  }
  if (server.auth_method === "password" || server.has_password) {
    return "пароль";
  }
  return "нет SSH";
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
  const sshOnline = metric?.online === true;
  const sshKnown = metric?.collected_at != null || metric?.online != null;
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const payTone = paymentExpired ? "expired" : paymentExpiring ? "expiring" : "";

  return (
    <article className={`fleet-row ${isEditing ? "is-editing" : ""} ${sshOnline ? "is-online" : sshKnown ? "is-offline" : ""}`}>
      <div className="fleet-row-main">
        <div className="fleet-row-identity">
          <span
            className={`fleet-row-dot ${sshOnline ? "online" : sshKnown ? "offline" : "pending"}`}
            aria-hidden
          />
          <div className="fleet-row-title">
            <div className="fleet-row-name-line">
              <strong>{server.name}</strong>
              {server.group_name ? <span className="fleet-row-group">{server.group_name}</span> : null}
            </div>
            <p className="fleet-row-host">
              <span className="mono">
                {server.ip}:{server.port}
              </span>
              <span>·</span>
              <span>{server.login}</span>
              <span>·</span>
              <span>{authLabel(server)}</span>
              {server.provider ? (
                <>
                  <span>·</span>
                  <span>{server.provider}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        <div className="fleet-row-status">
          <span className={`status-pill ${sshOnline ? "online" : "offline"}`}>
            {sshOnline ? "SSH" : sshKnown ? "офлайн" : "SSH ?"}
          </span>
          <span className={`status-pill agent-${agent.tone}`}>{agent.text}</span>
        </div>

        <div className="fleet-row-metrics">
          {metric && metric.metrics_available !== false ? (
            <>
              <MetricBar label="CPU" value={metric.cpu_percent} tone="cpu" />
              <MetricBar label="RAM" value={metric.ram_percent} tone="ram" />
              <MetricBar label="Disk" value={metric.disk_percent} tone="disk" />
            </>
          ) : (
            <p className="fleet-row-metrics-empty muted">{metric?.uptime ?? "Нет метрик"}</p>
          )}
        </div>

        <div className={`fleet-row-pay ${payTone}`}>
          {server.pay_until ? (
            <>
              <span className="fleet-row-pay-label">
                {paymentExpired ? "Просрочено" : paymentExpiring ? "Скоро" : "Оплата"}
              </span>
              <strong>{new Date(server.pay_until).toLocaleDateString("ru-RU")}</strong>
            </>
          ) : (
            <>
              <span className="fleet-row-pay-label">Оплата</span>
              <strong className="muted">—</strong>
            </>
          )}
          {server.monthly_cost != null ? (
            <span className="fleet-row-cost muted">
              {formatMoney(server.monthly_cost, server.currency)} {billingPeriodLabel(server.billing_period)}
            </span>
          ) : null}
        </div>

        <div className="fleet-row-actions">
          {canEdit ? (
            <button className="ghost btn-sm" type="button" onClick={() => onEdit(server)}>
              {isEditing ? "…" : "Изменить"}
            </button>
          ) : null}
          <button
            type="button"
            className="ghost btn-sm"
            disabled={metricsRefreshing}
            onClick={() => onRefreshMetrics(server.id)}
          >
            {metricsRefreshing ? "…" : "Метрики"}
          </button>
          <button
            type="button"
            className={`ghost btn-sm ${detailsOpen ? "is-active" : ""}`}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Ещё
          </button>
        </div>
      </div>

      {detailsOpen ? (
        <div className="fleet-row-details">
          <div className="fleet-row-details-meta">
            {metric?.uptime ? (
              <div className="fleet-detail-chip">
                <span>Uptime</span>
                <strong>{metric.uptime}</strong>
              </div>
            ) : null}
            {server.agent_version ? (
              <div className="fleet-detail-chip">
                <span>Агент</span>
                <strong>v{server.agent_version}</strong>
              </div>
            ) : null}
            {server.monthly_equivalent != null && server.billing_period !== "monthly" ? (
              <div className="fleet-detail-chip">
                <span>≈ / мес</span>
                <strong>{formatMoney(server.monthly_equivalent, server.currency)}</strong>
              </div>
            ) : null}
          </div>

          <ServerQuickFields
            server={server}
            groups={groups}
            canEdit={canEdit}
            saving={quickSaving}
            onSave={onQuickUpdate}
          />

          <div className="fleet-row-details-actions">
            {canEnrollAgent ? (
              <button className="ghost btn-sm" type="button" onClick={() => onEnrollAgent(server.id)}>
                Установить агент
              </button>
            ) : null}
            {hasMore ? (
              <div className="fleet-more-menu" ref={moreRef}>
                <button type="button" className="ghost btn-sm" onClick={() => setMoreOpen((open) => !open)}>
                  Действия
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
      ) : null}
    </article>
  );
}

export default ServerCard;
