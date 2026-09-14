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

type ConnectArgs = {
  serverId: string;
  login: string;
  token: string;
  serverLabel?: string;
};

function writeWelcome(terminal: Terminal) {
  terminal.writeln("\x1b[38;2;109;247;193m╭─ SSH Panel Terminal\x1b[0m");
  terminal.writeln("\x1b[38;2;124;200;255m│\x1b[0m  Кликните сервер слева — сессия откроется сразу.");
  terminal.writeln("\x1b[38;2;124;200;255m│\x1b[0m  Fullscreen, размер шрифта и смена пользователя — в панели сверху.");
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
  const containerNodeRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pingTimerRef = useRef<number | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const pendingConnectRef = useRef<ConnectArgs | null>(null);
  const fontSizeRef = useRef(DEFAULT_FONT_SIZE);

  const [terminalReady, setTerminalReady] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [statusMessage, setStatusMessage] = useState("Выберите сервер, чтобы открыть SSH-сеанс.");
  const [fontSize, setFontSizeState] = useState(() => {
    const stored = Number(readStored(TERMINAL_STORAGE_KEYS.fontSize, String(DEFAULT_FONT_SIZE)));
    const size = clampFontSize(Number.isFinite(stored) ? stored : DEFAULT_FONT_SIZE);
    fontSizeRef.current = size;
    return size;
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

  const destroyTerminal = useCallback(() => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    if (resizeTimerRef.current != null) {
      window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }
    clearPing();
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }
    dataDisposableRef.current?.dispose();
    dataDisposableRef.current = null;
    terminalRef.current?.dispose();
    terminalRef.current = null;
    fitAddonRef.current = null;
    setTerminalReady(false);
  }, [clearPing]);

  const openSocket = useCallback(
    (args: ConnectArgs) => {
      const terminal = terminalRef.current;
      const fitAddon = fitAddonRef.current;
      if (!terminal || !fitAddon) {
        pendingConnectRef.current = args;
        setStatusMessage("Терминал ещё загружается…");
        return false;
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
      terminal.writeln(
        `\x1b[38;2;124;200;255m→\x1b[0m Подключение к ${args.serverLabel || args.serverId} как ${args.login}…`
      );
      setConnectionState("connecting");
      setStatusMessage(`Подключаемся к ${args.serverLabel || args.serverId}…`);

      const url = buildTerminalWsUrl({
        baseUrl: WS_BASE,
        serverId: args.serverId,
        token: args.token,
        asUser: args.login,
        cols: terminal.cols,
        rows: terminal.rows
      });

      let socket: WebSocket;
      try {
        socket = new WebSocket(url);
      } catch (err) {
        setConnectionState("error");
        setStatusMessage(err instanceof Error ? err.message : "Не удалось открыть WebSocket.");
        terminal.writeln(`\r\n\x1b[38;2;255;127;143m[ошибка] ${String(err)}\x1b[0m`);
        return false;
      }

      socketRef.current = socket;

      socket.onopen = () => {
        sendResize();
        setConnectionState("connected");
        setStatusMessage(`Подключено${args.serverLabel ? `: ${args.serverLabel}` : ""} · ${args.login}`);
        pingTimerRef.current = window.setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") {
          return;
        }
        const control = parseControlMessage(event.data);
        if (control?.type === "pong") {
          return;
        }
        if (control?.type === "status" && control.message) {
          setStatusMessage(control.message);
          return;
        }
        terminal.write(event.data);
      };

      socket.onerror = () => {
        setConnectionState("error");
        setStatusMessage("Не удалось подключить терминал (WebSocket error).");
      };

      socket.onclose = (event) => {
        clearPing();
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        terminal.writeln(
          `\r\n\x1b[38;2;255;127;143m[сессия завершена${event.code ? ` · code ${event.code}` : ""}]\x1b[0m`
        );
        setConnectionState((prev) => (prev === "error" ? prev : "closed"));
        setStatusMessage(event.reason ? `Сессия завершена: ${event.reason}` : "Сессия завершена.");
      };

      return true;
    },
    [clearPing, sendResize]
  );

  const ensureTerminal = useCallback(
    (node: HTMLDivElement) => {
      if (terminalRef.current) {
        return;
      }

      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: "bar",
        fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
        fontSize: fontSizeRef.current,
        lineHeight: 1.25,
        convertEol: true,
        scrollback: 5000,
        theme: { ...XTERM_THEME }
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(node);
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
      observer.observe(node);
      resizeObserverRef.current = observer;
      window.addEventListener("resize", scheduleResize);
      setTerminalReady(true);

      const pending = pendingConnectRef.current;
      if (pending) {
        pendingConnectRef.current = null;
        window.setTimeout(() => openSocket(pending), 0);
      }
    },
    [openSocket, scheduleResize]
  );

  const containerRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node === containerNodeRef.current) {
        return;
      }

      if (!node) {
        window.removeEventListener("resize", scheduleResize);
        destroyTerminal();
        containerNodeRef.current = null;
        return;
      }

      containerNodeRef.current = node;
      ensureTerminal(node);
    },
    [destroyTerminal, ensureTerminal, scheduleResize]
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("resize", scheduleResize);
      destroyTerminal();
    };
  }, [destroyTerminal, scheduleResize]);

  const disconnect = useCallback(
    (message = "Сессия завершена.") => {
      pendingConnectRef.current = null;
      clearPing();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
      setConnectionState((prev) => (prev === "idle" ? prev : "closed"));
      setStatusMessage(message);
    },
    [clearPing]
  );

  const applyFontSize = useCallback(
    (next: number) => {
      const size = clampFontSize(next);
      fontSizeRef.current = size;
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

  const connect = useCallback(
    (args: ConnectArgs) => {
      if (!args.serverId || !args.login || !args.token) {
        setConnectionState("error");
        setStatusMessage("Не выбран сервер, пользователь или нет токена авторизации.");
        return false;
      }
      return openSocket(args);
    },
    [openSocket]
  );

  const clearTerminal = useCallback(() => {
    terminalRef.current?.clear();
    if (connectionState === "idle" || connectionState === "closed" || connectionState === "error") {
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
    terminalReady,
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
