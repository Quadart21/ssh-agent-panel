import { useEffect, useRef } from "react";

import type { Server } from "../../types";
import { EmptyState, PageHero, PageShell } from "../ui";
import TerminalServerRail from "./TerminalServerRail";
import TerminalToolbar from "./TerminalToolbar";
import { useTerminalSelection } from "./useTerminalSelection";
import { useTerminalSession } from "./useTerminalSession";

type Props = {
  servers: Server[];
  token: string;
};

function TerminalPage({ servers, token }: Props) {
  const selection = useTerminalSelection(servers);
  const session = useTerminalSession();
  const lastAttemptRef = useRef<string>("");

  useEffect(() => {
    if (session.isFullscreen) {
      document.body.classList.add("terminal-fullscreen-active");
    } else {
      document.body.classList.remove("terminal-fullscreen-active");
    }
    return () => {
      document.body.classList.remove("terminal-fullscreen-active");
    };
  }, [session.isFullscreen]);

  useEffect(() => {
    if (!session.isFullscreen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        session.toggleFullscreen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session.isFullscreen, session.toggleFullscreen]);

  function connectTo(serverId: string, login: string, server?: Server | null, force = false) {
    const target = server ?? servers.find((item) => String(item.id) === serverId) ?? null;
    if (!serverId || !login || !token || !target) {
      return;
    }
    const key = `${serverId}:${login}`;
    if (!force && lastAttemptRef.current === key && session.connectionState === "connected") {
      session.focusTerminal();
      return;
    }
    lastAttemptRef.current = key;
    const started = session.connect({
      serverId,
      login,
      token,
      serverLabel: `${target.name} (${target.ip})`
    });
    if (!started) {
      // Terminal not ready yet — keep key so pending queue can finish, but allow retry.
      lastAttemptRef.current = `${key}:pending`;
    }
    window.setTimeout(() => session.focusTerminal(), 40);
  }

  // When xterm becomes ready, connect selected server if idle.
  useEffect(() => {
    if (!session.terminalReady) {
      return;
    }
    const serverId = selection.selectedServerId;
    const login = selection.selectedLogin || selection.selectedServer?.login || "";
    if (!serverId || !login || !token || !selection.selectedServer) {
      return;
    }
    if (session.connectionState === "connecting" || session.connectionState === "connected") {
      return;
    }
    connectTo(serverId, login, selection.selectedServer, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.terminalReady]);

  function handleSelectServer(serverId: string) {
    const server = servers.find((item) => String(item.id) === serverId) ?? null;
    const login = server?.login || selection.selectedLogin || "";
    selection.setSelectedServerId(serverId);
    if (server && login && token) {
      connectTo(serverId, login, server, true);
    }
  }

  const effectiveLogin = selection.selectedLogin || selection.selectedServer?.login || "";
  const canConnect = Boolean(selection.selectedServerId && effectiveLogin && token);

  return (
    <PageShell className={`terminal-page ${session.isFullscreen ? "is-fullscreen" : ""}`}>
      {!session.isFullscreen ? (
        <PageHero
          eyebrow="Операции"
          title="Терминал"
          description="Клик по серверу сразу открывает SSH-сессию."
          actions={
            selection.selectedServer ? (
              <div className="terminal-hero-meta">
                <span className="server-chip">{selection.selectedServer.name}</span>
                <span className="server-chip muted-chip">{selection.selectedServer.ip}</span>
                {!session.terminalReady ? <span className="server-chip muted-chip">init…</span> : null}
              </div>
            ) : null
          }
        />
      ) : null}

      {servers.length === 0 ? (
        <EmptyState title="Нет серверов" description="Добавьте сервер в парке, чтобы открыть SSH-сессию." />
      ) : (
        <div className="terminal-workspace">
          {!session.isFullscreen ? (
            <TerminalServerRail
              servers={servers}
              filteredServers={selection.filteredServers}
              selectedServerId={selection.selectedServerId}
              onSelect={handleSelectServer}
              query={selection.serverQuery}
              onQueryChange={selection.setServerQuery}
              disabled={session.connectionState === "connecting"}
            />
          ) : null}

          <section className="terminal-stage panel">
            <TerminalToolbar
              availableLogins={
                selection.availableLogins.length > 0
                  ? selection.availableLogins
                  : effectiveLogin
                    ? [effectiveLogin]
                    : []
              }
              selectedLogin={effectiveLogin}
              onLoginChange={(login) => {
                selection.setSelectedLogin(login);
                if (login && selection.selectedServerId && token) {
                  connectTo(selection.selectedServerId, login, selection.selectedServer, true);
                }
              }}
              loadingLogins={selection.loadingLogins}
              connectionState={session.connectionState}
              connectionLabel={session.connectionLabel}
              statusMessage={session.statusMessage}
              fontSize={session.fontSize}
              onFontSizeChange={session.setFontSize}
              isFullscreen={session.isFullscreen}
              canConnect={canConnect}
              onConnect={() =>
                connectTo(selection.selectedServerId, effectiveLogin, selection.selectedServer, true)
              }
              onDisconnect={() => {
                lastAttemptRef.current = `${selection.selectedServerId}:__disconnected__`;
                session.disconnect();
              }}
              onClear={session.clearTerminal}
              onToggleFullscreen={session.toggleFullscreen}
            />

            <div
              className="terminal-frame"
              ref={session.containerRef}
              onClick={() => session.focusTerminal()}
              role="presentation"
            />

            {!selection.selectedServerId ? (
              <p className="muted terminal-hint">Выберите сервер слева — сессия откроется автоматически.</p>
            ) : null}
          </section>
        </div>
      )}
    </PageShell>
  );
}

export default TerminalPage;
