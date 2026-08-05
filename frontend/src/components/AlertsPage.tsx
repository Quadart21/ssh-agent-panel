import type { Alert } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type Props = {
  alerts: Alert[];
  loading: boolean;
};

function AlertsPage({ alerts, loading }: Props) {
  return (
    <PageShell>
      <PageHero eyebrow="Уведомления" title="Уведомления" description="Офлайн-серверы и просроченные или скорые оплаты." />

      <Panel title="Активные уведомления" description={loading ? "Загрузка..." : `Событий: ${alerts.length}`}>
        <div className="result-stack">
          {alerts.length === 0 ? (
            <EmptyState title="Всё спокойно" description="Активных уведомлений нет." />
          ) : null}
          {alerts.map((alert, index) => (
            <article className={`result-card alert-card ${alert.level}`} key={`${alert.category}-${index}`}>
              <div className="server-card-row">
                <strong>{alert.title}</strong>
                <span className="muted">{alert.server_name ?? "Система"}</span>
              </div>
              <p>{alert.message}</p>
              {alert.pay_until ? <pre>Срок оплаты: {new Date(alert.pay_until).toLocaleString("ru-RU")}</pre> : null}
            </article>
          ))}
        </div>
      </Panel>
    </PageShell>
  );
}

export default AlertsPage;
