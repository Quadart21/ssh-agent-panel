import type { AuditLog } from "../types";

type Props = {
  logs: AuditLog[];
  loading: boolean;
  onExport: () => void;
};

function AuditPage({ logs, loading, onExport }: Props) {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Аудит</p>
          <h1>Журнал действий пользователей</h1>
          <p className="hero-copy">
            Здесь видно, кто входил в систему, создавал серверы, запускал команды, открывал терминал и управлял PM2.
          </p>
        </div>
      </section>

      <article className="panel">
        <div className="panel-head">
          <h2>Последние события</h2>
          <div className="panel-actions">
            <span className="muted">{loading ? "Загрузка..." : `Записей: ${logs.length}`}</span>
            <button type="button" className="ghost" onClick={onExport}>
              Экспорт CSV
            </button>
          </div>
        </div>
        <div className="result-stack">
          {logs.length === 0 ? <p className="muted">Журнал пока пуст.</p> : null}
          {logs.map((log) => (
            <article className="result-card" key={log.id}>
              <div className="server-card-row">
                <strong>{log.action}</strong>
                <span className="muted">{formatDate(log.created_at)}</span>
              </div>
              <p className="muted">Пользователь: {log.user_email}</p>
              <p className="muted">
                Цель: {log.target_type ?? "n/a"} {log.target_id ? `#${log.target_id}` : ""}
              </p>
              {log.details ? <pre>{log.details}</pre> : null}
            </article>
          ))}
        </div>
      </article>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

export default AuditPage;
