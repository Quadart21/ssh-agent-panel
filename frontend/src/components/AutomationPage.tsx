import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api } from "../api";
import type { AutomationPreset, BulkCommandResponse, Group, Server } from "../types";

type FormState = {
  preset_key: string;
  group_id: string;
  server_ids: number[];
  custom_env_raw: string;
};

type Props = {
  servers: Server[];
  groups: Group[];
  token: string;
  onError: (message: string) => void;
};

const emptyForm: FormState = {
  preset_key: "",
  group_id: "",
  server_ids: [],
  custom_env_raw: ""
};

type StreamLogEntry = {
  id: string;
  kind: "info" | "stdout" | "stderr" | "success" | "error";
  text: string;
};

type ServerRunState = {
  serverId: number;
  serverName: string;
  status: "pending" | "running" | "success" | "error";
  currentStep: number;
  completedCommands: number;
  lastCommand: string;
};

type ProgressState = {
  totalServers: number;
  totalCommandsPerServer: number;
  finishedServers: number;
  finishedCommands: number;
  activeServerName: string;
  activeStep: number;
};

const emptyProgress: ProgressState = {
  totalServers: 0,
  totalCommandsPerServer: 0,
  finishedServers: 0,
  finishedCommands: 0,
  activeServerName: "",
  activeStep: 0
};

function AutomationPage({ servers, groups, token, onError }: Props) {
  const [presets, setPresets] = useState<AutomationPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [results, setResults] = useState<BulkCommandResponse | null>(null);
  const [streamLogs, setStreamLogs] = useState<StreamLogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const [serverStates, setServerStates] = useState<ServerRunState[]>([]);
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    onError("");
    void api
      .listAutomationPresets()
      .then((data) => {
        setPresets(data);
        if (!form.preset_key && data.length > 0) {
          setForm((current) => ({ ...current, preset_key: data[0].key }));
        }
      })
      .catch((err: unknown) => {
        onError(err instanceof Error ? err.message : "Не удалось загрузить сценарии автоматизации.");
      })
      .finally(() => setLoading(false));
  }, []);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.key === form.preset_key) ?? null,
    [presets, form.preset_key]
  );

  const totalPlannedCommands = progress.totalServers * progress.totalCommandsPerServer;
  const progressPercent =
    totalPlannedCommands > 0 ? Math.min(100, Math.round((progress.finishedCommands / totalPlannedCommands) * 100)) : 0;

  useEffect(() => {
    if (!streamRef.current) {
      return;
    }
    streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [streamLogs]);

  function toggleServer(serverId: number) {
    setForm((current) => ({
      ...current,
      server_ids: current.server_ids.includes(serverId)
        ? current.server_ids.filter((id) => id !== serverId)
        : [...current.server_ids, serverId]
    }));
  }

  function parseEnvMap(raw: string) {
    const env: Record<string, string> = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.includes("=")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      env[key.trim()] = rest.join("=").trim();
    }
    return env;
  }

  function upsertServerState(serverId: number | null, serverName: string, updater: (current: ServerRunState) => ServerRunState) {
    setServerStates((current) => {
      const resolvedId = serverId ?? current.find((item) => item.serverName === serverName)?.serverId ?? Date.now();
      const existing = current.find((item) => item.serverId === resolvedId || item.serverName === serverName);
      if (existing) {
        return current.map((item) =>
          item.serverId === existing.serverId ? updater(existing) : item
        );
      }
      const created: ServerRunState = {
        serverId: resolvedId,
        serverName,
        status: "pending",
        currentStep: 0,
        completedCommands: 0,
        lastCommand: ""
      };
      return [...current, updater(created)];
    });
  }

  async function handleRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResults(null);
    setStreamLogs([]);
    setProgress(emptyProgress);
    setServerStates([]);
    onError("");
    setRunning(true);

    const base = (import.meta.env.VITE_API_BASE_URL?.trim() || `${window.location.origin}/api/v1`).replace(/\/$/, "");
    const wsBase = base.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    const socket = new WebSocket(`${wsBase}/automation/ws/run?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          preset_key: form.preset_key,
          group_id: form.group_id ? Number(form.group_id) : null,
          server_ids: form.server_ids,
          custom_env: parseEnvMap(form.custom_env_raw)
        })
      );
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data) as Record<string, unknown>;
      const type = String(data.type ?? "");

      if (type === "run_started") {
        const selectedServers = servers.filter((server) => form.server_ids.includes(server.id));
        const initialStates =
          selectedServers.length > 0
            ? selectedServers.map((server) => ({
                serverId: server.id,
                serverName: server.name,
                status: "pending" as const,
                currentStep: 0,
                completedCommands: 0,
                lastCommand: ""
              }))
            : [];
        setServerStates(initialStates);
        setProgress((current) => ({
          ...current,
          totalServers: Number(data.server_count ?? 0),
          totalCommandsPerServer: Number(data.command_count ?? 0),
          finishedServers: 0,
          finishedCommands: 0,
          activeServerName: "",
          activeStep: 0
        }));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "info",
            text: `Старт сценария: ${String(data.preset_name)}. Серверов: ${String(data.server_count)}. Команд: ${String(data.command_count)}.`
          }
        ]);
        return;
      }

      if (type === "server_started") {
        upsertServerState(Number(data.server_id ?? 0) || null, String(data.server_name ?? ""), (item) => ({
          ...item,
          status: "running",
          currentStep: 0
        }));
        setProgress((current) => ({
          ...current,
          activeServerName: String(data.server_name ?? ""),
          activeStep: 0
        }));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "info",
            text: `Начат сервер ${String(data.server_name)}.`
          }
        ]);
        return;
      }

      if (type === "command_started") {
        upsertServerState(Number(data.server_id ?? 0) || null, String(data.server_name ?? ""), (item) => ({
          ...item,
          status: "running",
          currentStep: Number(data.step ?? 0),
          lastCommand: String(data.command ?? "")
        }));
        setProgress((current) => ({
          ...current,
          activeServerName: String(data.server_name ?? ""),
          activeStep: Number(data.step ?? 0)
        }));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "info",
            text: `[${String(data.server_name)}] Шаг ${String(data.step)}: ${String(data.command)}`
          }
        ]);
        return;
      }

      if (type === "command_output") {
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: String(data.stream) === "stderr" ? "stderr" : "stdout",
            text: `[${String(data.server_name)}] ${String(data.chunk)}`
          }
        ]);
        return;
      }

      if (type === "command_finished") {
        upsertServerState(Number(data.server_id ?? 0) || null, String(data.server_name ?? ""), (item) => ({
          ...item,
          status: Boolean(data.ok) ? "running" : "error",
          completedCommands: item.completedCommands + 1,
          lastCommand: String(data.command ?? item.lastCommand)
        }));
        setProgress((current) => ({
          ...current,
          finishedCommands: current.finishedCommands + 1
        }));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: Boolean(data.ok) ? "success" : "error",
            text: `[${String(data.server_name)}] ${Boolean(data.ok) ? "Команда завершена успешно" : "Команда завершилась с ошибкой"}: ${String(data.command)}`
          }
        ]);
        return;
      }

      if (type === "server_finished") {
        upsertServerState(Number(data.server_id ?? 0) || null, String(data.server_name ?? ""), (item) => ({
          ...item,
          status: Boolean(data.ok) ? "success" : "error",
          currentStep: 0
        }));
        setProgress((current) => ({
          ...current,
          finishedServers: current.finishedServers + 1,
          activeServerName: Boolean(data.ok) ? current.activeServerName : String(data.server_name ?? current.activeServerName),
          activeStep: Boolean(data.ok) ? 0 : current.activeStep
        }));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: Boolean(data.ok) ? "success" : "error",
            text: `Сервер ${String(data.server_name)} ${Boolean(data.ok) ? "завершил сценарий" : "завершил сценарий с ошибкой"}.`
          }
        ]);
        return;
      }

      if (type === "run_finished") {
        const payloadResults = Array.isArray(data.results) ? data.results : [];
        setResults({ results: payloadResults as BulkCommandResponse["results"] });
        setProgress((current) => ({
          ...current,
          finishedServers: current.totalServers,
          finishedCommands:
            current.totalServers * current.totalCommandsPerServer > 0
              ? current.totalServers * current.totalCommandsPerServer
              : current.finishedCommands,
          activeServerName: "",
          activeStep: 0
        }));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "success",
            text: "Сценарий завершён."
          }
        ]);
        setRunning(false);
        socket.close();
        return;
      }

      if (type === "error") {
        onError(String(data.message ?? "Ошибка автоматизации."));
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "error",
            text: String(data.message ?? "Ошибка автоматизации.")
          }
        ]);
        setRunning(false);
        socket.close();
      }
    };

    socket.onerror = () => {
      onError("Соединение журнала автоматизации было прервано.");
      setRunning(false);
    };

    socket.onclose = () => {
      setRunning(false);
    };
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Автоматизация</p>
          <h1>Сценарии автоматизации для серверов</h1>
          <p className="hero-copy">
            Запускайте типовые установщики и сервисные сценарии по выбранным серверам или сразу по группе.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Запуск сценария</h2>
            <span className="muted">{loading ? "Загрузка..." : `Сценариев: ${presets.length}`}</span>
          </div>
          <form className="command-grid" onSubmit={handleRun}>
            <label>
              Сценарий
              <select value={form.preset_key} onChange={(event) => setForm({ ...form, preset_key: event.target.value })}>
                <option value="">Выберите сценарий</option>
                {presets.map((preset) => (
                  <option key={preset.key} value={preset.key}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Группа серверов
              <select value={form.group_id} onChange={(event) => setForm({ ...form, group_id: event.target.value })}>
                <option value="">Не выбрана</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Переменные окружения
              <textarea
                rows={5}
                value={form.custom_env_raw}
                onChange={(event) => setForm({ ...form, custom_env_raw: event.target.value })}
                placeholder={"DOMAIN=ssh.norenvpn.com\nEMAIL=ops@norenvpn.com"}
              />
            </label>
            <div className="full-width">
              <span className="label-title">Отдельные серверы</span>
              <div className="chip-grid">
                {servers.map((server) => (
                  <label className="server-chip" key={server.id}>
                    <input
                      type="checkbox"
                      checked={form.server_ids.includes(server.id)}
                      onChange={() => toggleServer(server.id)}
                    />
                    <span>{server.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={running}>
              {running ? "Сценарий выполняется..." : "Запустить сценарий"}
            </button>
          </form>
        </article>

        <article className="panel">
          <h2>Описание сценария</h2>
          {selectedPreset ? (
            <div className="automation-details">
              <div className="server-card-row">
                <strong>{selectedPreset.name}</strong>
                <span className="status-pill online">{selectedPreset.category}</span>
              </div>
              <p>{selectedPreset.description}</p>
              <pre>{selectedPreset.commands.join("\n")}</pre>
            </div>
          ) : (
            <p className="muted">Выберите сценарий, чтобы увидеть команды и описание.</p>
          )}
        </article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <h2>Живой процесс выполнения</h2>
          <span className="muted">{running ? "Идёт выполнение" : "Ожидание запуска"}</span>
        </div>
        <div className="automation-progress">
          <div className="automation-progress-head">
            <strong>{running ? `${progressPercent}% выполнено` : "Прогресс появится после запуска"}</strong>
            <span className="muted">
              Серверы: {progress.finishedServers}/{progress.totalServers || 0} · Шаги: {progress.finishedCommands}/
              {totalPlannedCommands || 0}
            </span>
          </div>
          <div className="automation-progress-bar">
            <div className="automation-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          {progress.activeServerName ? (
            <p className="muted">
              Сейчас: {progress.activeServerName}
              {progress.activeStep > 0 ? ` · шаг ${progress.activeStep}` : ""}
            </p>
          ) : null}
        </div>
        <div className="automation-server-grid">
          {serverStates.length === 0 ? <p className="muted">После запуска здесь появится состояние серверов.</p> : null}
          {serverStates.map((serverState) => (
            <article className="mini-card" key={serverState.serverId}>
              <div className="server-card-row">
                <strong>{serverState.serverName}</strong>
                <span className={`status-pill ${serverState.status === "error" ? "offline" : "online"}`}>
                  {serverState.status === "pending" ? "ожидание" : null}
                  {serverState.status === "running" ? "в процессе" : null}
                  {serverState.status === "success" ? "успешно" : null}
                  {serverState.status === "error" ? "ошибка" : null}
                </span>
              </div>
              <p className="muted">
                Выполнено шагов: {serverState.completedCommands}
                {serverState.currentStep > 0 ? ` · текущий шаг ${serverState.currentStep}` : ""}
              </p>
              {serverState.lastCommand ? <code>{serverState.lastCommand}</code> : null}
            </article>
          ))}
        </div>
        <div className="automation-stream" ref={streamRef}>
          {streamLogs.length === 0 ? <p className="muted">После запуска здесь появится ход выполнения по шагам.</p> : null}
          {streamLogs.map((entry) => (
            <div key={entry.id} className={`automation-log ${entry.kind}`}>
              {entry.text}
            </div>
          ))}
        </div>
      </article>

      {results ? (
        <article className="panel">
          <h2>Результаты выполнения</h2>
          <div className="result-stack">
            {results.results.map((result, index) => (
              <article className="result-card" key={`${result.server_id}-${index}-${result.command}`}>
                <div className="server-card-row">
                  <strong>{result.server_name}</strong>
                  <span className={`status-pill ${result.ok ? "online" : "offline"}`}>
                    {result.ok ? "успешно" : "ошибка"}
                  </span>
                </div>
                <code>{result.command}</code>
                {result.stdout ? <pre>{result.stdout}</pre> : null}
                {result.stderr ? <pre className="stderr">{result.stderr}</pre> : null}
              </article>
            ))}
          </div>
        </article>
      ) : null}
    </div>
  );
}

export default AutomationPage;
