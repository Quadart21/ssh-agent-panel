import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { api } from "../api";
import MetricRing from "./servers/MetricRing";
import type { PublicEmbedMetrics } from "../types";

function MetricsEmbedWidget() {
  const { token = "" } = useParams();
  const [data, setData] = useState<PublicEmbedMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      setError("Токен виджета не указан.");
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const payload = await api.getPublicEmbedMetrics(token);
        if (!cancelled) {
          setData(payload);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "Не удалось загрузить метрики.");
        }
      }
    }

    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  const theme = data?.theme ?? "dark";

  return (
    <div className={`metrics-embed-widget theme-${theme}`}>
      <header className="metrics-embed-head">
        <div>
          <p className="eyebrow">Server metrics</p>
          <h1>{data?.title ?? "Метрики серверов"}</h1>
        </div>
        {data ? <span className="muted">Обновлено {new Date(data.updated_at).toLocaleTimeString("ru-RU")}</span> : null}
      </header>

      {error ? <div className="metrics-embed-banner error">{error}</div> : null}

      {!data && !error ? <p className="muted metrics-embed-loading">Загружаю метрики…</p> : null}

      {data ? (
        <div className="metrics-embed-grid">
          {data.servers.map((server) => (
            <article key={server.name} className="metrics-embed-card">
              <div className="metrics-embed-card-head">
                <strong>{server.name}</strong>
                <span className={`status-pill ${server.online ? "online" : "offline"}`}>
                  {server.online ? "online" : "offline"}
                </span>
              </div>
              {server.metrics_available !== false ? (
                <div className="server-metric-visuals">
                  <MetricRing label="CPU" value={server.cpu_percent} tone="sky" compact />
                  <MetricRing label="RAM" value={server.ram_percent} tone="mint" compact />
                  <MetricRing label="Disk" value={server.disk_percent} tone="amber" compact />
                  <div className="metric-uptime">
                    <span className="muted">Uptime</span>
                    <strong>{server.uptime}</strong>
                  </div>
                </div>
              ) : (
                <p className="muted">{server.uptime}</p>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default MetricsEmbedWidget;
