import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api";
import ServerCheckReportView from "./ServerCheckReportView";
import type { Server, ServerCheckGroup, ServerCheckReport, ServerCheckRunSummary } from "../types";

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

function formatDuration(ms: number) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) {
    return `${seconds} сек`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} мин ${rest} сек` : `${minutes} мин`;
}

function runStatusLabel(status: string) {
  if (status === "queued") return "В очереди";
  if (status === "running") return "Выполняется";
  if (status === "completed") return "Готово";
  if (status === "failed") return "Ошибка";
  return status;
}

function ServerChecksPage({ servers, onError }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<ServerCheckGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [selectedCheckId, setSelectedCheckId] = useState("");
  const [runs, setRuns] = useState<ServerCheckRunSummary[]>([]);
  const [report, setReport] = useState<ServerCheckReport | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [status, setStatus] = useState("Выберите сервер и тип проверки.");

  const selectedServerId = searchParams.get("server") ?? "";
  const selectedRunId = searchParams.get("run") ?? "";

  const activeGroup = useMemo(
    () => catalog.find((group) => group.id === activeGroupId) ?? null,
    [catalog, activeGroupId]
  );

  const selectedCheck = useMemo(
    () => activeGroup?.checks.find((check) => check.id === selectedCheckId) ?? null,
    [activeGroup, selectedCheckId]
  );

  const selectedServer = useMemo(
    () => servers.find((server) => String(server.id) === selectedServerId) ?? null,
    [servers, selectedServerId]
  );

  const hasActiveRuns = useMemo(
    () => runs.some((run) => run.status === "queued" || run.status === "running"),
    [runs]
  );

  const loadRuns = useCallback(async () => {
    try {
      const data = await api.listServerCheckRuns(selectedServerId ? Number(selectedServerId) : undefined);
      setRuns(data);
    } catch {
      setRuns([]);
    }
  }, [selectedServerId]);

  const loadRunReport = useCallback(
    async (runId: string) => {
      onError("");
      try {
        const detail = await api.getServerCheckRun(runId);
        if (detail.report) {
          setReport(detail.report);
          setStatus("Отчёт загружен.");
        } else if (detail.status === "failed") {
          setReport(null);
          setStatus(detail.error_message ?? "Проверка завершилась с ошибкой.");
        } else {
          setReport(null);
          setStatus(`Статус: ${runStatusLabel(detail.status)}. Ожидайте уведомление в Telegram.`);
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : "Не удалось загрузить отчёт.");
      }
    },
    [onError]
  );

  useEffect(() => {
    setCatalogLoading(true);
    onError("");
    void api
      .serverChecksCatalog()
      .then((data) => {
        setCatalog(data);
        if (data.length > 0) {
          setActiveGroupId(data[0].id);
          setSelectedCheckId(data[0].checks[0]?.id ?? "");
        }
      })
      .catch((err: unknown) => {
        onError(err instanceof Error ? err.message : "Не удалось загрузить каталог проверок.");
      })
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!hasActiveRuns) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadRuns();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveRuns, loadRuns]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }
    void loadRunReport(selectedRunId);
  }, [selectedRunId, loadRunReport]);

  useEffect(() => {
    if (!selectedRunId) {
      return;
    }
    const current = runs.find((run) => run.id === selectedRunId);
    if (current && (current.status === "completed" || current.status === "failed")) {
      void loadRunReport(selectedRunId);
    }
  }, [runs, selectedRunId, loadRunReport]);

  useEffect(() => {
    if (!activeGroup?.checks.length) {
      setSelectedCheckId("");
      return;
    }
    if (!activeGroup.checks.some((check) => check.id === selectedCheckId)) {
      setSelectedCheckId(activeGroup.checks[0].id);
    }
  }, [activeGroup, selectedCheckId]);

  function handleServerChange(serverId: string) {
    const next = new URLSearchParams(searchParams);
    if (serverId) {
      next.set("server", serverId);
    } else {
      next.delete("server");
    }
    next.delete("run");
    setSearchParams(next);
    setReport(null);
    setStatus("Выберите тип проверки и запустите в фоне.");
  }

  function openRun(run: ServerCheckRunSummary) {
    const next = new URLSearchParams(searchParams);
    next.set("server", String(run.server_id));
    next.set("run", run.id);
    setSearchParams(next);
  }

  async function handleQueueCheck() {
    if (!selectedServerId || !selectedCheckId) {
      onError("Выберите сервер и скрипт проверки.");
      return;
    }
    onError("");
    setQueueing(true);
    setReport(null);
    try {
      const queued = await api.queueServerCheck(Number(selectedServerId), selectedCheckId);
      setStatus(queued.message);
      const next = new URLSearchParams(searchParams);
      next.set("run", queued.run_id);
      setSearchParams(next);
      await loadRuns();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось поставить проверку в очередь.");
      setStatus("Не удалось запустить проверку.");
    } finally {
      setQueueing(false);
    }
  }

  return (
    <div className="page-stack server-checks-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Диагностика</p>
          <h1>Проверка серверов</h1>
          <p className="hero-copy">
            Проверки запускаются в фоне — можно закрыть страницу. Когда GUI-отчёт будет готов, придёт уведомление в
            Telegram со ссылкой на панель.
          </p>
        </div>
      </section>

      <section className="panel server-checks-toolbar">
        <div className="server-checks-toolbar-grid">
          <label>
            Сервер
            <select value={selectedServerId} onChange={(event) => handleServerChange(event.target.value)}>
              <option value="">Выберите сервер</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} · {server.ip}
                </option>
              ))}
            </select>
          </label>
          <div className="server-checks-toolbar-meta">
            {selectedServer ? (
              <>
                <span className="server-chip">{selectedServer.group_name ?? "Без группы"}</span>
                {selectedServer.provider ? <span className="server-chip muted-chip">{selectedServer.provider}</span> : null}
              </>
            ) : (
              <span className="muted">Сначала выберите узел из парка.</span>
            )}
          </div>
        </div>
      </section>

      {catalogLoading ? (
        <section className="panel">
          <p className="muted">Загружаю каталог проверок…</p>
        </section>
      ) : (
        <>
          <nav className="page-tabs server-checks-tabs" aria-label="Типы проверок сервера">
            {catalog.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`page-tab ${activeGroupId === group.id ? "active" : ""}`}
                onClick={() => setActiveGroupId(group.id)}
              >
                <span>
                  {group.icon} {group.label}
                </span>
                <small>{group.hint}</small>
              </button>
            ))}
          </nav>

          <section className="dashboard-grid server-checks-layout">
            <article className="panel">
              <div className="panel-head">
                <h2>{activeGroup ? `${activeGroup.icon} ${activeGroup.label}` : "Проверки"}</h2>
                <span className="muted">{activeGroup?.hint}</span>
              </div>

              <div className="server-checks-variant-grid">
                {activeGroup?.checks.map((check) => (
                  <button
                    key={check.id}
                    type="button"
                    className={`server-check-variant ${selectedCheckId === check.id ? "active" : ""}`}
                    onClick={() => {
                      setSelectedCheckId(check.id);
                      setReport(null);
                      setStatus("Готово к запуску в фоне.");
                    }}
                  >
                    <strong>{check.title}</strong>
                    <p>{check.description}</p>
                    <span className="muted">≈ {Math.ceil(check.estimated_seconds / 60)} мин · timeout {check.timeout} сек</span>
                  </button>
                ))}
              </div>

              <div className="server-checks-actions">
                <button type="button" onClick={() => void handleQueueCheck()} disabled={queueing || !selectedServerId || !selectedCheckId}>
                  {queueing ? "Постановка в очередь…" : "Запустить в фоне"}
                </button>
                <p className="muted">{status}</p>
                <p className="muted server-checks-warning">
                  Страницу можно закрыть — результат сохранится в панели, а Telegram сообщит, когда отчёт готов.
                </p>
              </div>

              <div className="check-runs-list">
                <div className="check-report-block-head">
                  <h4>Последние запуски</h4>
                  {hasActiveRuns ? <span className="status-pill pending">есть активные</span> : null}
                </div>
                {runs.length ? (
                  <div className="check-runs-items">
                    {runs.map((run) => (
                      <button
                        key={run.id}
                        type="button"
                        className={`check-run-item status-${run.status}`}
                        onClick={() => openRun(run)}
                      >
                        <div>
                          <strong>{run.check_title}</strong>
                          <span className="muted">
                            {run.server_name ?? `#${run.server_id}`} · {new Date(run.created_at).toLocaleString("ru-RU")}
                          </span>
                        </div>
                        <span className={`status-pill ${run.status === "completed" && run.ok ? "online" : run.status === "failed" ? "offline" : "pending"}`}>
                          {runStatusLabel(run.status)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Запусков пока нет.</p>
                )}
              </div>
            </article>

            <article className="panel server-checks-report-panel">
              <div className="panel-head">
                <h2>GUI-отчёт</h2>
                {report ? (
                  <span className={`status-pill ${report.ok ? "online" : "offline"}`}>
                    {report.visual.health_label} · код {report.exit_code}
                  </span>
                ) : hasActiveRuns ? (
                  <span className="status-pill pending">выполняется в фоне</span>
                ) : (
                  <span className="muted">Откройте готовый запуск или дождитесь Telegram</span>
                )}
              </div>

              {!report ? (
                <div className="server-checks-empty">
                  <div className="check-empty-visual">
                    <span className="check-empty-visual-icon">{hasActiveRuns ? "⏳" : "📊"}</span>
                    <p>
                      {hasActiveRuns
                        ? "Проверка выполняется на сервере. Можете уйти со страницы — пришлём уведомление в Telegram."
                        : "Выберите готовый запуск слева или запустите новую проверку."}
                    </p>
                  </div>
                </div>
              ) : (
                <ServerCheckReportView report={report} formatDuration={formatDuration} />
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

export default ServerChecksPage;
