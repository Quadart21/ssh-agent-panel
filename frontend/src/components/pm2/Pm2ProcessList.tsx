import type { Pm2Process } from "../../types";
import { formatBytes, formatUptime, statusTone } from "./helpers";

type Props = {
  apps: Pm2Process[];
  busyApp: string | null;
  activeLogApp: string | null;
  onLogs: (appName: string) => void;
  onStop: (appName: string) => void;
  onRestart: (appName: string) => void;
  onDelete: (appName: string) => void;
};

function Pm2ProcessList({ apps, busyApp, activeLogApp, onLogs, onStop, onRestart, onDelete }: Props) {
  if (apps.length === 0) {
    return <p className="muted pm2-empty">Процессы не найдены.</p>;
  }

  return (
    <div className="pm2-list">
      {apps.map((app) => {
        const tone = statusTone(app.status);
        const busy = busyApp === app.name;
        return (
          <article
            key={`${app.name}-${app.pm_id}`}
            className={`pm2-row ${tone === "online" ? "is-online" : tone === "offline" ? "is-offline" : ""} ${
              activeLogApp === app.name ? "is-active" : ""
            }`}
          >
            <div className="pm2-row-main">
              <div className="pm2-row-identity">
                <span className={`fleet-row-dot ${tone}`} aria-hidden />
                <div>
                  <div className="pm2-row-name-line">
                    <strong>{app.name}</strong>
                    <span className="muted">#{app.pm_id}</span>
                    <span className={`status-pill ${tone}`}>{app.status}</span>
                  </div>
                  <p className="pm2-row-meta">
                    <span>{app.mode}</span>
                    {app.pid != null ? <span>pid {app.pid}</span> : null}
                    {app.instances != null && app.instances > 1 ? <span>×{app.instances}</span> : null}
                    <span>рестартов {app.restarts}</span>
                    <span>uptime {formatUptime(app.uptime_ms)}</span>
                  </p>
                </div>
              </div>

              <div className="pm2-row-metrics">
                <div className="metric-bar metric-bar--cpu">
                  <div className="metric-bar-head">
                    <span>CPU</span>
                    <strong>{app.cpu.toFixed(1)}%</strong>
                  </div>
                  <div className="metric-bar-track" aria-hidden>
                    <span className="metric-bar-fill" style={{ width: `${Math.min(100, Math.max(0, app.cpu))}%` }} />
                  </div>
                </div>
                <div className="metric-bar metric-bar--ram">
                  <div className="metric-bar-head">
                    <span>RAM</span>
                    <strong>{formatBytes(app.memory)}</strong>
                  </div>
                  <div className="metric-bar-track" aria-hidden>
                    <span
                      className="metric-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(4, app.memory / (256 * 1024 * 1024) * 100))}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pm2-row-actions">
                <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => onLogs(app.name)}>
                  Логи
                </button>
                <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => onStop(app.name)}>
                  Стоп
                </button>
                <button type="button" className="btn-sm" disabled={busy} onClick={() => onRestart(app.name)}>
                  Рестарт
                </button>
                <button type="button" className="danger btn-sm" disabled={busy} onClick={() => onDelete(app.name)}>
                  Удалить
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default Pm2ProcessList;
