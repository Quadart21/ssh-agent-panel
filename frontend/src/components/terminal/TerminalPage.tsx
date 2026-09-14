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
  const autoConnectKeyRef = useRef<string>("");

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

  function connectTo(serverId: string, login: string, server?: Server | null) {
    const target = server ?? servers.find((item) => String(item.id) === serverId) ?? null;
    if (!serverId || !login || !token || !target) {
      return;
    }
    const key = `${serverId}:${login}`;
    autoConnectKeyRef.current = key;
    session.connect({
      serverId,
      login,
      token,
      serverLabel: `${target.name} (${target.ip})`
    });
    window.setTimeout(() => session.focusTerminal(), 30);
  }

  // Auto-connect when server+login become ready (selection, deep-link, refresh).
  useEffect(() => {
    const serverId = selection.selectedServerId;
    const login = selection.selectedLogin || selection.selectedServer?.login || "";
    if (!serverId || !login || !token || !selection.selectedServer) {
      return;
    }
    const key = `${serverId}:${login}`;
    if (autoConnectKeyRef.current === key) {
      return;
    }
    if (session.connectionState === "connecting" || session.connectionState === "connected") {
      return;
    }
    connectTo(serverId, login, selection.selectedServer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- connect on selection readiness only
  }, [selection.selectedServerId, selection.selectedLogin, selection.selectedServer, token]);

  function handleSelectServer(serverId: string) {
    if (serverId === selection.selectedServerId && session.connectionState === "connected") {
      session.focusTerminal();
      return;
    }
    const server = servers.find((item) => String(item.id) === serverId) ?? null;
    selection.setSelectedServerId(serverId);
    const login = server?.login ?? "";
    if (server && login && token) {
      // Bypass the effect guard so a re-click / switch always reconnects.
      autoConnectKeyRef.current = "";
      connectTo(serverId, login, server);
    }
  }

  const canConnect = Boolean(
    selection.selectedServerId && (selection.selectedLogin || selection.selectedServer?.login) && token
  );

  function handleConnect() {
    const login = selection.selectedLogin || selection.selectedServer?.login || "";
    autoConnectKeyRef.current = "";
    connectTo(selection.selectedServerId, login, selection.selectedServer);
  }

  return (
    <PageShell className={`terminal-page ${session.isFullscreen ? "is-fullscreen" : ""}`}>
      {!session.isFullscreen ? (
        <PageHero
          eyebrow="Операции"
          title="Терминал"
          description="Клик по серверу сразу открывает SSH-сессию. Пользователя и размер шрифта можно менять в панели."
          actions={
            selection.selectedServer ? (
              <div className="terminal-hero-meta">
                <span className="server-chip">{selection.selectedServer.name}</span>
                <span className="server-chip muted-chip">{selection.selectedServer.ip}</span>
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
              availableLogins={selection.availableLogins}
              selectedLogin={selection.selectedLogin || selection.selectedServer?.login || ""}
              onLoginChange={(login) => {
                selection.setSelectedLogin(login);
                if (login && selection.selectedServerId && token) {
                  autoConnectKeyRef.current = "";
                  connectTo(selection.selectedServerId, login, selection.selectedServer);
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
              onConnect={handleConnect}
              onDisconnect={() => {
                autoConnectKeyRef.current = `${selection.selectedServerId}:__disconnected__`;
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
