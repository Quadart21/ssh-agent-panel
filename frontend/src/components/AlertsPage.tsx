import type { Alert } from "../types";

type Props = {
  alerts: Alert[];
  loading: boolean;
};

function AlertsPage({ alerts, loading }: Props) {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Уведомления</p>
          <h1>Критичные события и сроки оплаты</h1>
          <p className="hero-copy">
            Этот раздел собирает офлайн-серверы и оплаты, которые уже просрочены или истекают в ближайшие дни.
          </p>
        </div>
      </section>

      <article className="panel">
        <div className="panel-head">
          <h2>Активные уведомления</h2>
          <span className="muted">{loading ? "Загрузка..." : `Событий: ${alerts.length}`}</span>
        </div>
        <div className="result-stack">
          {alerts.length === 0 ? <p className="muted">Активных уведомлений нет.</p> : null}
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
      </article>
    </div>
  );
}

export default AlertsPage;
