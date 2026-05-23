import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api";
import ServerCheckReportView from "./ServerCheckReportView";
import type { Server, ServerCheckGroup, ServerCheckReport } from "../types";

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

function ServerChecksPage({ servers, onError }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState<ServerCheckGroup[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [activeGroupId, setActiveGroupId] = useState("");
  const [selectedCheckId, setSelectedCheckId] = useState("");
  const [report, setReport] = useState<ServerCheckReport | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("Выберите сервер и тип проверки.");

  const selectedServerId = searchParams.get("server") ?? "";

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
    setSearchParams(next);
    setReport(null);
    setStatus("Выберите тип проверки и нажмите «Запустить».");
  }

  async function handleRunCheck() {
    if (!selectedServerId || !selectedCheckId) {
      onError("Выберите сервер и скрипт проверки.");
      return;
    }
    onError("");
    setRunning(true);
    setReport(null);
    setStatus(`Запуск «${selectedCheck?.title ?? selectedCheckId}» на ${selectedServer?.name ?? "сервере"}…`);
    try {
      const result = await api.runServerCheck(Number(selectedServerId), selectedCheckId);
      setReport(result);
      setStatus(result.ok ? "Проверка завершена успешно." : "Проверка завершена с ошибками.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось выполнить проверку.");
      setStatus("Проверка не выполнена.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="page-stack server-checks-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Диагностика</p>
          <h1>Проверка серверов</h1>
          <p className="hero-copy">
            Сеть, бенчмарки, регион IP, DPI, геоблокировки и CPU — результаты в виде наглядного GUI-отчёта: карточки,
            шкалы, статусы сервисов и health-score.
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
                      setStatus("Готово к запуску.");
                    }}
                  >
                    <strong>{check.title}</strong>
                    <p>{check.description}</p>
                    <span className="muted">≈ {Math.ceil(check.estimated_seconds / 60)} мин · timeout {check.timeout} сек</span>
                  </button>
                ))}
              </div>

              <div className="server-checks-actions">
                <button type="button" onClick={() => void handleRunCheck()} disabled={running || !selectedServerId || !selectedCheckId}>
                  {running ? "Выполняется…" : "Запустить проверку"}
                </button>
                <p className="muted">{status}</p>
                {selectedCheck ? (
                  <p className="muted server-checks-warning">
                    Бенчмарки и YABS могут выполняться несколько минут. Не закрывайте вкладку до завершения.
                  </p>
                ) : null}
              </div>
            </article>

            <article className="panel server-checks-report-panel">
              <div className="panel-head">
                <h2>GUI-отчёт</h2>
                {report ? (
                  <span className={`status-pill ${report.ok ? "online" : "offline"}`}>
                    {report.visual.health_label} · код {report.exit_code}
                  </span>
                ) : (
                  <span className="muted">{running ? "Сбор данных…" : "Ожидает запуск"}</span>
                )}
              </div>

              {!report ? (
                <div className="server-checks-empty">
                  <div className="check-empty-visual">
                    <span className="check-empty-visual-icon">{running ? "⏳" : "📊"}</span>
                    <p>{running ? "Скрипт выполняется на удалённом сервере…" : "Запустите проверку — здесь появится визуальный отчёт."}</p>
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
