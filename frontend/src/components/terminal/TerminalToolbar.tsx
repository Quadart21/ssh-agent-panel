import type { ConnectionState } from "./helpers";
import { MAX_FONT_SIZE, MIN_FONT_SIZE } from "./helpers";

type Props = {
  availableLogins: string[];
  selectedLogin: string;
  onLoginChange: (login: string) => void;
  loadingLogins: boolean;
  connectionState: ConnectionState;
  connectionLabel: string;
  statusMessage: string;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  isFullscreen: boolean;
  canConnect: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onClear: () => void;
  onToggleFullscreen: () => void;
};

function TerminalToolbar({
  availableLogins,
  selectedLogin,
  onLoginChange,
  loadingLogins,
  connectionState,
  connectionLabel,
  statusMessage,
  fontSize,
  onFontSizeChange,
  isFullscreen,
  canConnect,
  onConnect,
  onDisconnect,
  onClear,
  onToggleFullscreen
}: Props) {
  const connected = connectionState === "connected";
  const connecting = connectionState === "connecting";

  return (
    <div className="terminal-toolbar-bar">
      <div className="terminal-toolbar-status">
        <span className={`status-pill terminal-state-pill terminal-state-${connectionState}`}>
          {connectionLabel}
        </span>
        <p className="muted terminal-status">{statusMessage}</p>
      </div>

      <div className="terminal-toolbar-controls">
        <label className="terminal-login-select">
          <span className="sr-only">Пользователь</span>
          <select
            value={selectedLogin}
            onChange={(event) => onLoginChange(event.target.value)}
            disabled={availableLogins.length === 0 || connecting || connected}
          >
            <option value="">{loadingLogins ? "Загрузка…" : "Войти как"}</option>
            {availableLogins.map((login) => (
              <option key={login} value={login}>
                {login}
              </option>
            ))}
          </select>
        </label>

        <div className="terminal-font-controls" aria-label="Размер шрифта">
          <button
            type="button"
            className="ghost"
            onClick={() => onFontSizeChange(fontSize - 1)}
            disabled={fontSize <= MIN_FONT_SIZE}
            title="Мельче"
          >
            A−
          </button>
          <span className="terminal-font-size">{fontSize}</span>
          <button
            type="button"
            className="ghost"
            onClick={() => onFontSizeChange(fontSize + 1)}
            disabled={fontSize >= MAX_FONT_SIZE}
            title="Крупнее"
          >
            A+
          </button>
        </div>

        <button type="button" className="ghost" onClick={onClear} title="Очистить экран">
          Clear
        </button>
        <button type="button" className="ghost" onClick={onToggleFullscreen}>
          {isFullscreen ? "Свернуть" : "Fullscreen"}
        </button>

        {connected || connecting ? (
          <button type="button" className="danger" onClick={onDisconnect} disabled={connecting}>
            Отключить
          </button>
        ) : (
          <button type="button" onClick={onConnect} disabled={!canConnect}>
            Подключиться
          </button>
        )}
      </div>
    </div>
  );
}

export default TerminalToolbar;
