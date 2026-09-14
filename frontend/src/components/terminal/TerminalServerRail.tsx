import type { Server } from "../../types";

type Props = {
  servers: Server[];
  filteredServers: Server[];
  selectedServerId: string;
  onSelect: (serverId: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  disabled?: boolean;
};

function TerminalServerRail({
  servers,
  filteredServers,
  selectedServerId,
  onSelect,
  query,
  onQueryChange,
  disabled = false
}: Props) {
  return (
    <aside className="terminal-server-rail panel">
      <div className="panel-head">
        <div>
          <h2>Серверы</h2>
          <p className="muted">
            {filteredServers.length}
            {filteredServers.length !== servers.length ? ` из ${servers.length}` : ""}
          </p>
        </div>
      </div>

      <label className="terminal-server-search">
        <span className="sr-only">Поиск сервера</span>
        <input
          type="search"
          placeholder="Имя или IP…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      {filteredServers.length === 0 ? (
        <p className="muted terminal-server-empty">Ничего не найдено.</p>
      ) : (
        <div className="terminal-server-list" role="listbox" aria-label="Серверы для терминала">
          {filteredServers.map((server) => {
            const active = String(server.id) === selectedServerId;
            return (
              <button
                key={server.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`terminal-server-item ${active ? "is-active" : ""}`}
                onClick={() => onSelect(String(server.id))}
                disabled={disabled}
              >
                <span className="terminal-server-name">{server.name}</span>
                <span className="terminal-server-ip">{server.ip}:{server.port}</span>
                <span className="terminal-server-login">{server.login}</span>
              </button>
            );
          })}
        </div>
      )}
    </aside>
  );
}

export default TerminalServerRail;
