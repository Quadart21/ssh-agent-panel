import { FormEvent, useRef, useState } from "react";

import { api } from "../api";
import type { BulkCommandResponse, Group, Pattern, Server } from "../types";
import CommandsPage from "./CommandsPage";

type Props = {
  servers: Server[];
  groups: Group[];
  patterns: Pattern[];
  token: string;
  onError: (message: string) => void;
};

const emptyCommandForm = {
  server_ids: [] as number[],
  group_id: "",
  pattern_id: "",
  commands: ""
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

function CommandsRoute({ servers, groups, patterns, token, onError }: Props) {
  const [form, setForm] = useState(emptyCommandForm);
  const [results, setResults] = useState<BulkCommandResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Выберите серверы или группу и запустите команды.");
  const [streamLogs, setStreamLogs] = useState<StreamLogEntry[]>([]);
  const [serverStates, setServerStates] = useState<ServerRunState[]>([]);
  const [progress, setProgress] = useState<ProgressState>(emptyProgress);
  const socketRef = useRef<WebSocket | null>(null);

  function toggleServer(serverId: number) {
    setForm((current) => ({
      ...current,
      server_ids: current.server_ids.includes(serverId)
        ? current.server_ids.filter((id) => id !== serverId)
        : [...current.server_ids, serverId]
    }));
  }

  async function handleRunCommands(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onError("");
    setResults(null);
    setRunning(true);
    setStatusMessage("Подключаем поток выполнения и отправляем команды на серверы.");
    setStreamLogs([]);
    setServerStates([]);
    setProgress(emptyProgress);
    socketRef.current?.close();

    const wsBase = api.getCommandsWsBaseUrl();
    const socket = new WebSocket(`${wsBase}?token=${encodeURIComponent(token)}`);
    socketRef.current = socket;

    function upsertServerState(serverId: number | null, serverName: string, updater: (current: ServerRunState) => ServerRunState) {
      setServerStates((current) => {
        const resolvedId = serverId ?? current.find((item) => item.serverName === serverName)?.serverId ?? Date.now();
        const existing = current.find((item) => item.serverId === resolvedId || item.serverName === serverName);
        if (existing) {
          return current.map((item) => (item.serverId === existing.serverId ? updater(existing) : item));
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

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          server_ids: form.server_ids,
          group_id: form.group_id ? Number(form.group_id) : null,
          pattern_id: form.pattern_id ? Number(form.pattern_id) : null,
          commands: form.pattern_id ? [] : form.commands.split("\n")
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
        setProgress({
          totalServers: Number(data.server_count ?? 0),
          totalCommandsPerServer: Number(data.command_count ?? 0),
          finishedServers: 0,
          finishedCommands: 0,
          activeServerName: "",
          activeStep: 0
        });
        setStatusMessage(`Выполнение запущено. Серверов: ${String(data.server_count)}, команд на сервер: ${String(data.command_count)}.`);
        setStreamLogs([
          {
            id: crypto.randomUUID(),
            kind: "info",
            text: `Старт выполнения. Серверов: ${String(data.server_count)}. Команд: ${String(data.command_count)}.`
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
        return;
      }

      if (type === "run_finished") {
        const payloadResults = Array.isArray(data.results) ? data.results : [];
        const result = { results: payloadResults as BulkCommandResponse["results"] };
        setResults(result);
        const successful = result.results.filter((item) => item.ok).length;
        setStatusMessage(`Выполнение завершено. Успешно: ${successful}, с ошибкой: ${result.results.length - successful}.`);
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
            text: "Массовое выполнение завершено."
          }
        ]);
        setRunning(false);
        socket.close();
        return;
      }

      if (type === "error") {
        const message = String(data.message ?? "Не удалось выполнить команды.");
        setStatusMessage("Команды завершились с ошибкой. Проверьте поток выполнения и сообщения ниже.");
        setStreamLogs((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            kind: "error",
            text: message
          }
        ]);
        onError(message);
        setRunning(false);
        socket.close();
      }
    };

    socket.onerror = () => {
      setStatusMessage("Соединение для живого выполнения было прервано.");
      onError("Соединение для живого выполнения было прервано.");
      setRunning(false);
    };

    socket.onclose = () => {
      setRunning(false);
    };
  }

  return (
    <CommandsPage
      servers={servers}
      groups={groups}
      patterns={patterns}
      form={form}
      setForm={setForm}
      results={results}
      running={running}
      statusMessage={statusMessage}
      streamLogs={streamLogs}
      serverStates={serverStates}
      progress={progress}
      onSubmit={handleRunCommands}
      onToggleServer={toggleServer}
    />
  );
}

export default CommandsRoute;
