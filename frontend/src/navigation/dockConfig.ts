import type { NavGroup } from "./types";

export type DockGroupMeta = {
  key: NavGroup;
  icon: string;
  shortLabel: string;
};

export const dockGroups: DockGroupMeta[] = [
  { key: "overview", icon: "📊", shortLabel: "Обзор" },
  { key: "infrastructure", icon: "🖥", shortLabel: "Инфра" },
  { key: "operations", icon: "⚡", shortLabel: "Ops" },
  { key: "security", icon: "🔒", shortLabel: "Sec" },
  { key: "administration", icon: "⚙", shortLabel: "Admin" }
];
