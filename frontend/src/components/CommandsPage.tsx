import type { FormEvent } from "react";

import type { BulkCommandResponse, Group, Pattern, Server } from "../types";
import { PageHero, PageShell, Panel } from "./ui";

type CommandForm = {
  server_ids: number[];
  group_id: string;
  pattern_id: string;
  commands: string;
};

type Props = {
  servers: Server[];
  groups: Group[];
  patterns: Pattern[];
  form: CommandForm;
  setForm: (form: CommandForm) => void;
  results: BulkCommandResponse | null;
  running: boolean;
  statusMessage: string;
  streamLogs: Array<{ id: string; kind: "info" | "stdout" | "stderr" | "success" | "error"; text: string }>;
  serverStates: Array<{
    serverId: number;
    serverName: string;
    status: "pending" | "running" | "success" | "error";
    currentStep: number;
    completedCommands: number;
    lastCommand: string;
  }>;
  progress: {
    totalServers: number;
    totalCommandsPerServer: number;
    finishedServers: number;
    finishedCommands: number;
    activeServerName: string;
    activeStep: number;
  };
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleServer: (id: number) => void;
};

function CommandsPage({
  servers,
  groups,
  patterns,
  form,
  setForm,
  results,
  running,
  statusMessage,
  streamLogs,
  serverStates,
  progress,
  onSubmit,
  onToggleServer
}: Props) {
  const targetCount = form.server_ids.length + (form.group_id ? 1 : 0);
  const successfulCount = results?.results.filter((result) => result.ok).length ?? 0;
  const failedCount = (results?.results.length ?? 0) - successfulCount;
  const totalPlannedCommands = progress.totalServers * progress.totalCommandsPerServer;
  const progressPercent =
    totalPlannedCommands > 0 ? Math.min(100, Math.round((progress.finishedCommands / totalPlannedCommands) * 100)) : 0;

  return (
    <PageShell>
      <PageHero eyebrow="Операции" title="Команды" description="Массовый запуск команд по серверам или группе." />

      <section className="page-stack">
        <Panel title="Запуск команд" description={running ? "Идёт выполнение" : `Целей выбрано: ${targetCount}`}>
          <p className="muted">{statusMessage}</p>
          <form className="command-grid" onSubmit={onSubmit}>
            <label>
              Группа серверов
              <select value={form.group_id} onChange={(event) => setForm({ ...form, group_id: event.target.value })} disabled={running}>
                <option value="">Не выбрана</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Шаблон команд
              <select value={form.pattern_id} onChange={(event) => setForm({ ...form, pattern_id: event.target.value })} disabled={running}>
                <option value="">Без шаблона</option>
                {patterns.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {pattern.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-width">
              Команды
              <textarea
                rows={6}
                placeholder="По одной команде на строку"
                value={form.commands}
                onChange={(event) => setForm({ ...form, commands: event.target.value })}
                disabled={Boolean(form.pattern_id) || running}
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
                      disabled={running}
                      onChange={() => onToggleServer(server.id)}
                    />
                    <span>{server.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <button type="submit" disabled={running || (!form.group_id && form.server_ids.length === 0)}>
              {running ? "Выполняем команды..." : "Выполнить команды"}
            </button>
          </form>
        </Panel>

        <Panel title="Живой ход выполнения" description={running ? "Поток активен" : "Ожидание запуска"}>
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
          <div className="automation-stream">
            {streamLogs.length === 0 ? <p className="muted">После запуска здесь появится поток команд и вывода.</p> : null}
            {streamLogs.map((entry) => (
              <div key={entry.id} className={`automation-log ${entry.kind}`}>
                {entry.text}
              </div>
            ))}
          </div>
        </Panel>

        {results ? (
          <Panel title="Результаты выполнения" description={`Успешно: ${successfulCount} · Ошибок: ${failedCount}`}>
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
          </Panel>
        ) : null}
      </section>
    </PageShell>
  );
}

export default CommandsPage;
