import type { AuditLog } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type Props = {
  logs: AuditLog[];
  loading: boolean;
  onExport: () => void;
};

function AuditPage({ logs, loading, onExport }: Props) {
  return (
    <PageShell>
      <PageHero eyebrow="Администрирование" title="Аудит" description="Журнал действий в панели." />

      <Panel
        title="Последние события"
        description={loading ? "Загрузка…" : `Записей: ${logs.length}`}
        actions={
          <button type="button" className="ghost" onClick={onExport}>
            Экспорт CSV
          </button>
        }
      >
        <div className="result-stack">
          {logs.length === 0 ? <EmptyState title="Журнал пуст" description="Действий пока нет." /> : null}
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
      </Panel>
    </PageShell>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

export default AuditPage;
