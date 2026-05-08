import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

import { api, getTerminalWsBaseUrl } from "../api";
import type { Server } from "../types";

const TERMINAL_WS_BASE = getTerminalWsBaseUrl();

type Props = {
  servers: Server[];
  token: string;
};

function TerminalPanel({ servers, token }: Props) {
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<string>("");
  const [selectedLogin, setSelectedLogin] = useState<string>("");
  const [availableLogins, setAvailableLogins] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("Выберите сервер, чтобы открыть SSH-сеанс.");

  useEffect(() => {
    if (!selectedServerId) {
      setSelectedLogin("");
      setAvailableLogins([]);
      return;
    }

    const server = servers.find((item) => String(item.id) === selectedServerId);
    const baseLogin = server?.login ?? "";
    setSelectedLogin(baseLogin);
    setAvailableLogins(baseLogin ? [baseLogin] : []);

    void api
      .listLinuxUsers(Number(selectedServerId))
      .then((users) => {
        const logins = Array.from(new Set([baseLogin, ...users.map((user) => user.username)].filter(Boolean)));
        setAvailableLogins(logins);
      })
      .catch(() => {
        setAvailableLogins(baseLogin ? [baseLogin] : []);
      });
  }, [selectedServerId, servers]);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 14,
      convertEol: true,
      theme: {
        background: "#081728",
        foreground: "#eff8ff",
        cursor: "#6df7c1",
        black: "#09111d",
        brightBlack: "#51647a",
        green: "#6df7c1",
        brightGreen: "#98ffd9",
        blue: "#7cc8ff",
        brightBlue: "#b8e5ff",
        red: "#ff7f8f",
        brightRed: "#ff9daa",
        yellow: "#ffc56a",
        brightYellow: "#ffdd99"
      }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();
    terminal.writeln("Терминал панели готов к работе.");
    terminal.writeln("Выберите сервер и нажмите «Подключиться».");

    terminal.onData((data) => {
      socketRef.current?.send(JSON.stringify({ type: "input", data }));
    });

    const handleResize = () => {
      fitAddon.fit();
      socketRef.current?.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows
        })
      );
    };

    window.addEventListener("resize", handleResize);
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      window.removeEventListener("resize", handleResize);
      socketRef.current?.close();
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  function connect() {
    const terminal = xtermRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon || !selectedServerId) {
      return;
    }

    socketRef.current?.close();
    terminal.clear();
    terminal.writeln("Открываем SSH-сессию...");

    const loginQuery = selectedLogin ? `&as_user=${encodeURIComponent(selectedLogin)}` : "";
    const socket = new WebSocket(`${TERMINAL_WS_BASE}/${selectedServerId}?token=${encodeURIComponent(token)}${loginQuery}`);
    socketRef.current = socket;

    socket.onopen = () => {
      fitAddon.fit();
      socket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows
        })
      );
      setStatus(`Подключено. Интерактивная сессия активна${selectedLogin ? ` как ${selectedLogin}` : ""}.`);
    };

    socket.onmessage = (event) => {
      terminal.write(event.data);
    };

    socket.onerror = () => {
      setStatus("Не удалось подключить терминал.");
    };

    socket.onclose = () => {
      terminal.writeln("\r\n[сессия завершена]");
      setStatus("Сессия завершена.");
    };
  }

  function disconnect() {
    socketRef.current?.close();
    socketRef.current = null;
    setStatus("Сессия завершена.");
  }

  return (
    <section className="panel span-two">
      <div className="panel-head">
        <div>
          <h2>SSH-терминал</h2>
          <p className="muted terminal-status">{status}</p>
        </div>
        <div className="terminal-toolbar">
          <select value={selectedServerId} onChange={(event) => setSelectedServerId(event.target.value)}>
            <option value="">Выберите сервер</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name} ({server.ip})
              </option>
            ))}
          </select>
          <select
            value={selectedLogin}
            onChange={(event) => setSelectedLogin(event.target.value)}
            disabled={!selectedServerId || availableLogins.length === 0}
          >
            <option value="">Войти как</option>
            {availableLogins.map((login) => (
              <option key={login} value={login}>
                {login}
              </option>
            ))}
          </select>
          <button type="button" onClick={connect} disabled={!selectedServerId || !selectedLogin}>
            Подключиться
          </button>
          <button type="button" className="ghost" onClick={disconnect}>
            Отключиться
          </button>
        </div>
      </div>
      <div className="terminal-frame" ref={terminalRef} />
    </section>
  );
}

export default TerminalPanel;
