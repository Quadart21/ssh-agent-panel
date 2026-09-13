import { FormEvent, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { LinuxUser, Pm2LogsResponse, Pm2Process, Server } from "../types";
import { EmptyState, PageHero, PageShell, PageToolbar, Panel } from "./ui";
import Pm2LogViewer from "./pm2/Pm2LogViewer";
import Pm2ProcessList from "./pm2/Pm2ProcessList";
import Pm2StartForm from "./pm2/Pm2StartForm";
import {
  PM2_LOG_LINES_PER_PAGE,
  PM2_LOG_PAGES,
  computePm2Stats,
  filterPm2Apps
} from "./pm2/helpers";

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

const emptyStartForm = {
  appName: "",
  script: "",
  instances: "1",
  cwd: "",
  interpreter: "",
  scriptArgs: ""
};

function Pm2Panel({ servers, onError }: Props) {
  const [serverId, setServerId] = useState("");
  const [runAsUser, setRunAsUser] = useState("");
  const [linuxUsers, setLinuxUsers] = useState<LinuxUser[]>([]);
  const [apps, setApps] = useState<Pm2Process[]>([]);
  const [logs, setLogs] = useState<Pm2LogsResponse | null>(null);
  const [status, setStatus] = useState("Выберите сервер.");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadingApps, setLoadingApps] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [startForm, setStartForm] = useState(emptyStartForm);
  const [showStart, setShowStart] = useState(false);

  const selectedServerId = serverId ? Number(serverId) : null;
  const stats = useMemo(() => computePm2Stats(apps), [apps]);
  const filteredApps = useMemo(() => filterPm2Apps(apps, query, statusFilter), [apps, query, statusFilter]);

  async function loadApps(id: number, user = runAsUser) {
    setLoadingApps(true);
    try {
      const data = await api.listPm2Apps(id, user || undefined);
      setApps(data);
      setStatus(data.length ? `Процессов: ${data.length}` : "В PM2 нет приложений.");
    } catch (err) {
      setApps([]);
      onError(err instanceof Error ? err.message : "Не удалось загрузить список PM2.");
    } finally {
      setLoadingApps(false);
    }
  }

  useEffect(() => {
    setLogs(null);
    setQuery("");
    setStatusFilter("all");
    setShowStart(false);
    if (!selectedServerId) {
      setApps([]);
      setLinuxUsers([]);
      setRunAsUser("");
      setStatus("Выберите сервер.");
      return;
    }
    const selectedServer = servers.find((server) => server.id === selectedServerId);
    const defaultLogin = selectedServer?.login ?? "";
    setRunAsUser(defaultLogin);
    void api
      .listLinuxUsers(selectedServerId)
      .then((users) => {
        const seen = new Set<string>();
        const normalized: LinuxUser[] = [];
        const seed = defaultLogin ? [{ username: defaultLogin, shell: null }, ...users] : users;
        seed.forEach((user) => {
          if (!seen.has(user.username)) {
            seen.add(user.username);
            normalized.push(user);
          }
        });
        setLinuxUsers(normalized);
      })
      .catch(() => {
        setLinuxUsers(defaultLogin ? [{ username: defaultLogin, shell: null }] : []);
      });
  }, [selectedServerId, servers]);

  useEffect(() => {
    if (selectedServerId && runAsUser) {
      void loadApps(selectedServerId, runAsUser);
    }
  }, [selectedServerId, runAsUser]);

  async function handleStartApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServerId || !runAsUser) {
      onError("Сначала выберите сервер и пользователя.");
      return;
    }
    const instances = Math.min(64, Math.max(1, Number.parseInt(startForm.instances, 10) || 1));
    setStarting(true);
    try {
      const response = await api.startPm2App(selectedServerId, {
        name: startForm.appName,
        script: startForm.script,
        instances,
        cwd: startForm.cwd.trim() || null,
        interpreter: startForm.interpreter.trim() || null,
        script_args: startForm.scriptArgs.trim() || null,
        run_as_user: runAsUser
      });
      setStatus(response.message);
      setStartForm(emptyStartForm);
      setShowStart(false);
      await loadApps(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось запустить приложение через PM2.");
    } finally {
      setStarting(false);
    }
  }

  async function handleLogs(appName: string) {
    if (!selectedServerId) {
      return;
    }
    setLoadingLogs(true);
    try {
      const data = await api.getPm2Logs(selectedServerId, appName, {
        pages: PM2_LOG_PAGES,
        linesPerPage: PM2_LOG_LINES_PER_PAGE,
        runAsUser: runAsUser || undefined
      });
      setLogs(data);
      setStatus(`Логи: ${appName} · последние ${PM2_LOG_PAGES} стр.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось получить логи PM2.");
    } finally {
      setLoadingLogs(false);
    }
  }

  async function runAppAction(appName: string, action: "stop" | "restart" | "delete") {
    if (!selectedServerId) {
      return;
    }
    setBusyApp(appName);
    try {
      const response =
        action === "stop"
          ? await api.stopPm2App(selectedServerId, appName, runAsUser || undefined)
          : action === "restart"
            ? await api.restartPm2App(selectedServerId, appName, runAsUser || undefined)
            : await api.deletePm2App(selectedServerId, appName, runAsUser || undefined);
      setStatus(response.message);
      if (action === "delete" && logs?.app_name === appName) {
        setLogs(null);
      }
      await loadApps(selectedServerId);
    } catch (err) {
      const fallback =
        action === "stop"
          ? "Не удалось остановить приложение."
          : action === "restart"
            ? "Не удалось перезапустить приложение."
            : "Не удалось удалить приложение из PM2.";
      onError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusyApp(null);
    }
  }

  return (
    <PageShell className="pm2-page">
      <PageHero
        eyebrow="Операции"
        title="PM2"
        description="Процессы Node/Python: статус, метрики, логи (последние 50 страниц) и управление."
        actions={
          selectedServerId ? (
            <>
              <button
                type="button"
                className="ghost"
                disabled={loadingApps || !runAsUser}
                onClick={() => void loadApps(selectedServerId)}
              >
                {loadingApps ? "Обновление…" : "Обновить"}
              </button>
              <button type="button" onClick={() => setShowStart((open) => !open)} disabled={!runAsUser}>
                {showStart ? "Скрыть запуск" : "Запустить"}
              </button>
            </>
          ) : null
        }
      />

      <section className="panel pm2-selector">
        <div className="pm2-selector-grid">
          <label>
            Сервер
            <select
              value={serverId}
              onChange={(event) => {
                setServerId(event.target.value);
                setRunAsUser("");
              }}
            >
              <option value="">Выберите сервер</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.ip})
                </option>
              ))}
            </select>
          </label>
          <label>
            Пользователь
            <select
              value={runAsUser}
              onChange={(event) => setRunAsUser(event.target.value)}
              disabled={!selectedServerId}
            >
              <option value="">Выполнять как</option>
              {linuxUsers.map((user) => (
                <option key={user.username} value={user.username}>
                  {user.username}
                </option>
              ))}
            </select>
          </label>
          <div className="pm2-selector-status">
            <span className="muted">{status}</span>
          </div>
        </div>
      </section>

      {selectedServerId && runAsUser ? (
        <>
          <section className="fleet-stats pm2-stats" aria-label="Сводка PM2">
            <button
              type="button"
              className={`fleet-stat neutral ${statusFilter === "all" ? "is-active" : ""} is-clickable`}
              onClick={() => setStatusFilter("all")}
            >
              <span>Всего</span>
              <strong>{stats.total}</strong>
            </button>
            <button
              type="button"
              className={`fleet-stat mint ${statusFilter === "online" ? "is-active" : ""} is-clickable`}
              onClick={() => setStatusFilter((current) => (current === "online" ? "all" : "online"))}
            >
              <span>Online</span>
              <strong>{stats.online}</strong>
            </button>
            <button
              type="button"
              className={`fleet-stat amber ${statusFilter === "stopped" ? "is-active" : ""} is-clickable`}
              onClick={() => setStatusFilter((current) => (current === "stopped" ? "all" : "stopped"))}
            >
              <span>Stopped</span>
              <strong>{stats.stopped}</strong>
            </button>
            <button
              type="button"
              className={`fleet-stat rose ${statusFilter === "errored" ? "is-active" : ""} is-clickable`}
              onClick={() => setStatusFilter((current) => (current === "errored" ? "all" : "errored"))}
            >
              <span>Errored</span>
              <strong>{stats.errored}</strong>
            </button>
          </section>

          {showStart ? (
            <Pm2StartForm
              form={startForm}
              setForm={setStartForm}
              disabled={!selectedServerId || !runAsUser}
              busy={starting}
              onSubmit={handleStartApp}
            />
          ) : null}

          <PageToolbar meta={`${filteredApps.length} из ${apps.length}`}>
            <label className="toolbar-search">
              Поиск
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Имя, id, режим…"
              />
            </label>
            <label>
              Статус
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Любой</option>
                <option value="online">online</option>
                <option value="stopped">stopped</option>
                <option value="errored">errored</option>
              </select>
            </label>
          </PageToolbar>

          <Panel
            className="pm2-panel"
            title="Процессы"
            description={loadingApps ? "Загрузка…" : `Пользователь ${runAsUser}`}
          >
            {apps.length === 0 && !loadingApps ? (
              <EmptyState
                title="Нет процессов"
                description="Запустите приложение через форму выше или проверьте пользователя."
                actions={
                  <button type="button" onClick={() => setShowStart(true)}>
                    Запустить
                  </button>
                }
              />
            ) : (
              <Pm2ProcessList
                apps={filteredApps}
                busyApp={busyApp}
                activeLogApp={logs?.app_name ?? null}
                onLogs={(name) => void handleLogs(name)}
                onStop={(name) => void runAppAction(name, "stop")}
                onRestart={(name) => void runAppAction(name, "restart")}
                onDelete={(name) => void runAppAction(name, "delete")}
              />
            )}
          </Panel>

          {logs ? (
            <Pm2LogViewer
              logs={logs}
              loading={loadingLogs}
              onRefresh={() => void handleLogs(logs.app_name)}
              onClose={() => setLogs(null)}
            />
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Выберите сервер и пользователя"
          description="PM2 работает в контексте выбранного Linux-пользователя на сервере."
        />
      )}
    </PageShell>
  );
}

export default Pm2Panel;
