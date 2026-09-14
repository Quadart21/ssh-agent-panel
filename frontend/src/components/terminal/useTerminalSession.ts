import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";

import { getTerminalWsBaseUrl } from "../../api";
import {
  CONNECTION_LABELS,
  DEFAULT_FONT_SIZE,
  TERMINAL_STORAGE_KEYS,
  XTERM_THEME,
  buildTerminalWsUrl,
  clampFontSize,
  readStored,
  type ConnectionState,
  writeStored
} from "./helpers";

const WS_BASE = getTerminalWsBaseUrl();

function decodeBinary(data: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(data));
}

type ConnectArgs = {
  serverId: string;
  login: string;
  token: string;
  serverLabel?: string;
};

function writeWelcome(terminal: Terminal) {
  terminal.writeln("\x1b[38;2;109;247;193m╭─ SSH Panel Terminal\x1b[0m");
  terminal.writeln("\x1b[38;2;124;200;255m│\x1b[0m  Выберите сервер слева и нажмите «Подключиться».");
  terminal.writeln("\x1b[38;2;124;200;255m│\x1b[0m  Поддерживаются resize, смена пользователя и fullscreen.");
  terminal.writeln("\x1b[38;2;109;247;193m╰─\x1b[0m");
}

function parseControlMessage(raw: string): { type: string; message?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as { type?: string; message?: string };
    if (parsed && typeof parsed.type === "string") {
      return { type: parsed.type, message: parsed.message };
    }
  } catch {
    return null;
  }
  return null;
}

export function useTerminalSession() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusMessage, setStatusMessage] = useState("Выберите сервер, чтобы открыть SSH-сеанс.");
  const [fontSize, setFontSizeState] = useState(() => {
    const stored = Number(readStored(TERMINAL_STORAGE_KEYS.fontSize, String(DEFAULT_FONT_SIZE)));
    return clampFontSize(Number.isFinite(stored) ? stored : DEFAULT_FONT_SIZE);
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const clearPing = useCallback(() => {
    if (pingTimerRef.current != null) {
      window.clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const sendResize = useCallback(() => {
    const terminal = terminalRef.current;
    const socket = socketRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }
    try {
      fitAddon.fit();
    } catch {
      /* container may be hidden */
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows
        })
      );
    }
  }, []);

  const scheduleResize = useCallback(() => {
    if (resizeTimerRef.current != null) {
      window.clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = window.setTimeout(() => {
      sendResize();
    }, 80);
  }, [sendResize]);

  const disconnect = useCallback(
    (message = "Сессия завершена.") => {
      clearPing();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close();
      }
      setConnectionState((prev) => (prev === "idle" ? prev : "closed"));
      setStatusMessage(message);
    },
    [clearPing]
  );

  const applyFontSize = useCallback(
    (next: number) => {
      const size = clampFontSize(next);
      setFontSizeState(size);
      writeStored(TERMINAL_STORAGE_KEYS.fontSize, String(size));
      const terminal = terminalRef.current;
      if (terminal) {
        terminal.options.fontSize = size;
        scheduleResize();
      }
    },
    [scheduleResize]
  );

  useEffect(() => {
    if (!containerRef.current || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
      fontSize,
      lineHeight: 1.25,
      convertEol: true,
      scrollback: 5000,
      allowProposedApi: true,
      theme: { ...XTERM_THEME }
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerRef.current);
    try {
      fitAddon.fit();
    } catch {
      /* ignore */
    }
    writeWelcome(terminal);

    dataDisposableRef.current = terminal.onData((data) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "input", data }));
      }
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const observer = new ResizeObserver(() => scheduleResize());
    observer.observe(containerRef.current);
    window.addEventListener("resize", scheduleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleResize);
      if (resizeTimerRef.current != null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      clearPing();
      socketRef.current?.close();
      dataDisposableRef.current?.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const connect = useCallback(
    ({ serverId, login, token, serverLabel }: ConnectArgs) => {
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      if (!terminal || !fitAddon || !serverId || !login || !token) {
        return;
      }

      clearPing();
      const previous = socketRef.current;
      socketRef.current = null;
      if (previous) {
        previous.onopen = null;
        previous.onmessage = null;
        previous.onerror = null;
        previous.onclose = null;
        if (previous.readyState === WebSocket.OPEN || previous.readyState === WebSocket.CONNECTING) {
          previous.close();
        }
      }

      try {
        fitAddon.fit();
      } catch {
        /* ignore */
      }

      terminal.clear();
      terminal.writeln(`\x1b[38;2;124;200;255m→\x1b[0m Подключение к ${serverLabel || serverId} как ${login}…`);
      setConnectionState("connecting");
      setStatusMessage(`Подключаемся к ${serverLabel || serverId}…`);

      const url = buildTerminalWsUrl({
        baseUrl: WS_BASE,
        serverId,
        token,
        asUser: login,
        cols: terminal.cols,
        rows: terminal.rows
      });

      const socket = new WebSocket(url);
      socket.binaryType = "arraybuffer";
      socketRef.current = socket;

      socket.onopen = () => {
        sendResize();
        setConnectionState("connected");
        setStatusMessage(`Подключено${serverLabel ? `: ${serverLabel}` : ""} · ${login}`);
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (typeof event.data === "string") {
          const control = parseControlMessage(event.data);
          if (control?.type === "pong") {
            return;
          }
          if (control?.type === "status" && control.message) {
            setStatusMessage(control.message);
            return;
          }
          terminal.write(event.data);
          return;
        }

        if (event.data instanceof ArrayBuffer) {
          terminal.write(decodeBinary(event.data));
          return;
        }

        if (event.data instanceof Blob) {
          void event.data.arrayBuffer().then((buffer) => {
            terminal.write(decodeBinary(buffer));
          });
        }
      };

      socket.onerror = () => {
        setConnectionState("error");
        setStatusMessage("Не удалось подключить терминал.");
      };

      socket.onclose = () => {
        clearPing();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        terminal.writeln("\r\n\x1b[38;2;255;127;143m[сессия завершена]\x1b[0m");
        setConnectionState((prev) => (prev === "error" ? prev : "closed"));
        setStatusMessage("Сессия завершена.");
      };
    },
    [clearPing, sendResize]
  );

  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear();
    if (connectionState === "idle" || connectionState === "closed") {
      if (terminalRef.current) {
        writeWelcome(terminalRef.current);
      }
    }
  }, [connectionState]);

  const focusTerminal = useCallback(() => {
    terminalRef.current?.focus();
  }, []);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((value) => !value);
    window.setTimeout(() => scheduleResize(), 50);
  }, [scheduleResize]);

  return {
    containerRef,
    connectionState,
    connectionLabel: CONNECTION_LABELS[connectionState],
    statusMessage,
    fontSize,
    setFontSize: applyFontSize,
    isFullscreen,
    toggleFullscreen,
    connect,
    disconnect,
    clearTerminal,
    focusTerminal,
    scheduleResize
  };
}
