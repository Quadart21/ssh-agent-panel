import { useEffect } from "react";

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

  const canConnect = Boolean(selection.selectedServerId && selection.selectedLogin && token);

  function handleConnect() {
    if (!selection.selectedServer || !selection.selectedLogin) {
      return;
    }
    session.connect({
      serverId: selection.selectedServerId,
      login: selection.selectedLogin,
      token,
      serverLabel: `${selection.selectedServer.name} (${selection.selectedServer.ip})`
    });
    window.setTimeout(() => session.focusTerminal(), 30);
  }

  const busy = session.connectionState === "connecting" || session.connectionState === "connected";

  return (
    <PageShell className={`terminal-page ${session.isFullscreen ? "is-fullscreen" : ""}`}>
      {!session.isFullscreen ? (
        <PageHero
          eyebrow="Операции"
          title="Терминал"
          description="Интерактивный SSH прямо в панели. Сессия, пользователь и размер шрифта запоминаются."
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
              onSelect={selection.setSelectedServerId}
              query={selection.serverQuery}
              onQueryChange={selection.setServerQuery}
              disabled={busy}
            />
          ) : null}

          <section className="terminal-stage panel">
            <TerminalToolbar
              availableLogins={selection.availableLogins}
              selectedLogin={selection.selectedLogin}
              onLoginChange={selection.setSelectedLogin}
              loadingLogins={selection.loadingLogins}
              connectionState={session.connectionState}
              connectionLabel={session.connectionLabel}
              statusMessage={session.statusMessage}
              fontSize={session.fontSize}
              onFontSizeChange={session.setFontSize}
              isFullscreen={session.isFullscreen}
              canConnect={canConnect}
              onConnect={handleConnect}
              onDisconnect={() => session.disconnect()}
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
              <p className="muted terminal-hint">Выберите сервер в списке слева.</p>
            ) : null}
          </section>
        </div>
      )}
    </PageShell>
  );
}

export default TerminalPage;
