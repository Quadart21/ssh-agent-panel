import type { Pm2Process } from "../../types";

export const PM2_LOG_PAGES = 50;
export const PM2_LOG_LINES_PER_PAGE = 50;

export function formatBytes(n: number) {
  if (!n) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(ms: number | null) {
  if (ms == null || ms < 0) {
    return "—";
  }
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  if (days > 0) {
    return `${days}д ${hours}ч`;
  }
  if (hours > 0) {
    return `${hours}ч ${mins}м`;
  }
  if (mins > 0) {
    return `${mins}м`;
  }
  return `${totalSec}с`;
}

export function statusTone(status: string): "online" | "offline" | "pending" {
  const normalized = status.toLowerCase();
  if (normalized === "online") {
    return "online";
  }
  if (normalized === "stopped" || normalized === "errored" || normalized === "stopping") {
    return "offline";
  }
  return "pending";
}

export type Pm2Stats = {
  total: number;
  online: number;
  stopped: number;
  errored: number;
};

export function computePm2Stats(apps: Pm2Process[]): Pm2Stats {
  return {
    total: apps.length,
    online: apps.filter((app) => app.status.toLowerCase() === "online").length,
    stopped: apps.filter((app) => app.status.toLowerCase() === "stopped").length,
    errored: apps.filter((app) => app.status.toLowerCase() === "errored").length
  };
}

export function filterPm2Apps(apps: Pm2Process[], query: string, status: string): Pm2Process[] {
  const q = query.trim().toLowerCase();
  return apps.filter((app) => {
    if (status !== "all" && app.status.toLowerCase() !== status) {
      return false;
    }
    if (!q) {
      return true;
    }
    return [app.name, String(app.pm_id), app.mode, app.status].join(" ").toLowerCase().includes(q);
  });
}
