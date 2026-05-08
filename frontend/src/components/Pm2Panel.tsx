import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import type { LinuxUser, Pm2LogsResponse, Pm2Process, Server } from "../types";

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

const emptyForm = {
  serverId: "",
  runAsUser: "",
  appName: "",
  script: "",
  instances: "1",
  cwd: "",
  scriptArgs: ""
};

function formatBytes(n: number) {
  if (!n) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function Pm2Panel({ servers, onError }: Props) {
  const [form, setForm] = useState(emptyForm);
  const [apps, setApps] = useState<Pm2Process[]>([]);
  const [logs, setLogs] = useState<Pm2LogsResponse | null>(null);
  const [status, setStatus] = useState("Выберите сервер для работы с PM2.");
  const [linuxUsers, setLinuxUsers] = useState<LinuxUser[]>([]);
  const selectedServerId = form.serverId ? Number(form.serverId) : null;

  async function loadApps(serverId: number) {
    try {
      const data = await api.listPm2Apps(serverId, form.runAsUser || undefined);
      setApps(data);
      setStatus(data.length ? "Процессы PM2 загружены." : "В PM2 нет зарегистрированных приложений.");
    } catch (err) {
      setApps([]);
      onError(err instanceof Error ? err.message : "Не удалось загрузить список PM2.");
    }
  }

  useEffect(() => {
    setLogs(null);
    if (!selectedServerId) {
      setApps([]);
      setLinuxUsers([]);
      return;
    }
    const selectedServer = servers.find((server) => server.id === selectedServerId);
    const defaultLogin = selectedServer?.login ?? "";
    setForm((current) => ({
      ...current,
      runAsUser: current.runAsUser || defaultLogin
    }));
    void api
      .listLinuxUsers(selectedServerId)
      .then((users) => {
        const seen = new Set<string>();
        const normalizedUsers: LinuxUser[] = [];
        const seed = defaultLogin ? [{ username: defaultLogin, shell: null }, ...users] : users;
        seed.forEach((user) => {
          if (!seen.has(user.username)) {
            seen.add(user.username);
            normalizedUsers.push(user);
          }
        });
        setLinuxUsers(normalizedUsers);
      })
      .catch(() => {
        setLinuxUsers(defaultLogin ? [{ username: defaultLogin, shell: null }] : []);
      });
    void loadApps(selectedServerId);
  }, [selectedServerId, servers]);

  useEffect(() => {
    if (selectedServerId) {
      void loadApps(selectedServerId);
    }
  }, [form.runAsUser]);

  async function handleStartApp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServerId) {
      onError("Сначала выберите сервер для PM2.");
      return;
    }
    const instances = Math.min(64, Math.max(1, Number.parseInt(form.instances, 10) || 1));
    try {
      const response = await api.startPm2App(selectedServerId, {
        name: form.appName,
        script: form.script,
        instances,
        cwd: form.cwd.trim() || null,
        script_args: form.scriptArgs.trim() || null,
        run_as_user: form.runAsUser || null
      });
      setStatus(response.message);
      setForm((current) => ({ ...current, appName: "", script: "", cwd: "", scriptArgs: "", instances: "1" }));
      await loadApps(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось запустить приложение через PM2.");
    }
  }

  async function handleLogs(appName: string) {
    if (!selectedServerId) {
      return;
    }
    try {
      const data = await api.getPm2Logs(selectedServerId, appName, 100, form.runAsUser || undefined);
      setLogs(data);
      setStatus(`Загружены логи: ${appName}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось получить логи PM2.");
    }
  }

  async function handleStop(appName: string) {
    if (!selectedServerId) {
      return;
    }
    try {
      const response = await api.stopPm2App(selectedServerId, appName, form.runAsUser || undefined);
      setStatus(response.message);
      await loadApps(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось остановить приложение.");
    }
  }

  async function handleRestart(appName: string) {
    if (!selectedServerId) {
      return;
    }
    try {
      const response = await api.restartPm2App(selectedServerId, appName, form.runAsUser || undefined);
      setStatus(response.message);
      await loadApps(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось перезапустить приложение.");
    }
  }

  async function handleDelete(appName: string) {
    if (!selectedServerId) {
      return;
    }
    try {
      const response = await api.deletePm2App(selectedServerId, appName, form.runAsUser || undefined);
      setStatus(response.message);
      if (logs?.app_name === appName) {
        setLogs(null);
      }
      await loadApps(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить приложение из PM2.");
    }
  }

  return (
    <section className="panel span-two">
      <div className="panel-head">
        <div>
          <h2>PM2</h2>
          <p className="muted terminal-status">{status}</p>
        </div>
        <div className="terminal-toolbar">
          <select
            value={form.serverId}
            onChange={(event) =>
              setForm({
                ...form,
                serverId: event.target.value,
                runAsUser: ""
              })
            }
          >
            <option value="">Выберите сервер</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.ip})
              </option>
            ))}
          </select>
          <select
            value={form.runAsUser}
            onChange={(event) => setForm({ ...form, runAsUser: event.target.value })}
            disabled={!selectedServerId}
          >
            <option value="">Выполнять как</option>
            {linuxUsers.map((user) => (
              <option key={user.username} value={user.username}>
                {user.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (selectedServerId) {
                void loadApps(selectedServerId);
              }
            }}
            disabled={!selectedServerId}
          >
            Обновить
          </button>
        </div>
      </div>

      <form className="command-grid" onSubmit={handleStartApp}>
        <label>
          Имя в PM2
          <input
            value={form.appName}
            onChange={(event) => setForm({ ...form, appName: event.target.value })}
            placeholder="api-worker"
            required
          />
        </label>
        <label>
          Скрипт / бинарник
          <input
            value={form.script}
            onChange={(event) => setForm({ ...form, script: event.target.value })}
            placeholder="/var/app/dist/main.js или npm"
            required
          />
        </label>
        <label>
          Инстансы (cluster)
          <input
            type="number"
            min={1}
            max={64}
            value={form.instances}
            onChange={(event) => setForm({ ...form, instances: event.target.value })}
          />
        </label>
        <label>
          Рабочая директория (опц.)
          <input
            value={form.cwd}
            onChange={(event) => setForm({ ...form, cwd: event.target.value })}
            placeholder="/var/www/app"
          />
        </label>
        <label className="full-width">
          Аргументы после <code>--</code> (опц., для npm: <code>start</code>)
          <input
            value={form.scriptArgs}
            onChange={(event) => setForm({ ...form, scriptArgs: event.target.value })}
            placeholder="start"
          />
        </label>
        <button type="submit" disabled={!selectedServerId || !form.runAsUser}>
          Запустить через PM2
        </button>
      </form>

      <div className="result-stack">
        {apps.length === 0 ? <p className="muted">Процессы не найдены.</p> : null}
        {apps.map((app) => (
          <article className="result-card" key={`${app.name}-${app.pm_id}`}>
            <div className="server-card-row">
              <div>
                <strong>
                  {app.name} <span className="muted">#{app.pm_id}</span>
                </strong>
                <p className="muted">
                  {app.status} · {app.mode}
                  {app.pid != null ? ` · pid ${app.pid}` : ""}
                  {app.instances != null && app.instances > 1 ? ` · целевых инстансов ${app.instances}` : ""}
                </p>
                <p className="muted">
                  CPU {app.cpu.toFixed(1)}% · RAM {formatBytes(app.memory)} · рестартов {app.restarts}
                  {app.uptime_ms != null ? ` · uptime ${Math.round(app.uptime_ms / 1000)}s` : ""}
                </p>
              </div>
              <div className="action-row">
                <button type="button" className="ghost" onClick={() => void handleLogs(app.name)}>
                  Логи
                </button>
                <button type="button" className="ghost" onClick={() => void handleStop(app.name)}>
                  Стоп
                </button>
                <button type="button" onClick={() => void handleRestart(app.name)}>
                  Рестарт
                </button>
                <button type="button" className="danger" onClick={() => void handleDelete(app.name)}>
                  Удалить
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {logs ? (
        <article className="result-card">
          <div className="server-card-row">
            <strong>Логи: {logs.app_name}</strong>
          </div>
          <pre>{logs.content || "Логи пусты."}</pre>
        </article>
      ) : null}
    </section>
  );
}

export default Pm2Panel;
