import { useEffect, useRef } from "react";

import type { Pm2LogsResponse } from "../../types";
import { PM2_LOG_LINES } from "./helpers";

type Props = {
  logs: Pm2LogsResponse;
  loading: boolean;
  onRefresh: () => void;
  onClose: () => void;
};

function Pm2LogViewer({ logs, loading, onRefresh, onClose }: Props) {
  const preRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    const node = preRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs.content]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(logs.content || "");
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <section className="pm2-logs panel">
      <div className="panel-head">
        <div>
          <h2>Логи · {logs.app_name}</h2>
          <p className="muted">
            Последние {logs.lines_per_page || PM2_LOG_LINES} строк · получено {logs.lines}
            {logs.truncated ? " · обрезано" : ""}
          </p>
        </div>
        <div className="panel-actions">
          <button type="button" className="ghost btn-sm" disabled={loading} onClick={onRefresh}>
            {loading ? "Загрузка…" : "Обновить"}
          </button>
          <button type="button" className="ghost btn-sm" onClick={() => void handleCopy()}>
            Копировать
          </button>
          <button type="button" className="ghost btn-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
      <pre ref={preRef} className="pm2-logs-view">
        {logs.content || "Логи пусты."}
      </pre>
    </section>
  );
}

export default Pm2LogViewer;
