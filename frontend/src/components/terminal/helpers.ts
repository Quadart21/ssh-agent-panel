export const TERMINAL_STORAGE_KEYS = {
  serverId: "terminal.selectedServerId",
  login: "terminal.selectedLogin",
  fontSize: "terminal.fontSize",
} as const;

export const DEFAULT_FONT_SIZE = 14;
export const MIN_FONT_SIZE = 11;
export const MAX_FONT_SIZE = 22;

export type ConnectionState = "idle" | "connecting" | "connected" | "error" | "closed";

export const CONNECTION_LABELS: Record<ConnectionState, string> = {
  idle: "не подключено",
  connecting: "подключение…",
  connected: "онлайн",
  error: "ошибка",
  closed: "сессия закрыта",
};

export const XTERM_THEME = {
  background: "#08111c",
  foreground: "#e8f3ff",
  cursor: "#6df7c1",
  cursorAccent: "#08111c",
  selectionBackground: "rgba(124, 200, 255, 0.28)",
  black: "#09111d",
  brightBlack: "#51647a",
  red: "#ff7f8f",
  brightRed: "#ff9daa",
  green: "#6df7c1",
  brightGreen: "#98ffd9",
  yellow: "#ffc56a",
  brightYellow: "#ffdd99",
  blue: "#7cc8ff",
  brightBlue: "#b8e5ff",
  magenta: "#c4b5fd",
  brightMagenta: "#ddd6fe",
  cyan: "#67e8f9",
  brightCyan: "#a5f3fc",
  white: "#e8f3ff",
  brightWhite: "#ffffff",
} as const;

export function readStored(key: string, fallback = ""): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

export function clampFontSize(value: number): number {
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(value)));
}

export function buildTerminalWsUrl(params: {
  baseUrl: string;
  serverId: string | number;
  token: string;
  asUser?: string;
  cols?: number;
  rows?: number;
}): string {
  const query = new URLSearchParams();
  query.set("token", params.token);
  if (params.asUser) {
    query.set("as_user", params.asUser);
  }
  if (params.cols) {
    query.set("cols", String(params.cols));
  }
  if (params.rows) {
    query.set("rows", String(params.rows));
  }
  return `${params.baseUrl}/${params.serverId}?${query.toString()}`;
}

export function filterServers<T extends { name: string; ip: string; notes?: string | null }>(
  servers: T[],
  query: string
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return servers;
  }
  return servers.filter((server) => {
    return (
      server.name.toLowerCase().includes(needle) ||
      server.ip.toLowerCase().includes(needle) ||
      (server.notes ?? "").toLowerCase().includes(needle)
    );
  });
}
