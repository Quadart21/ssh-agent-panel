import type { NavGroup } from "./types";

export type DockGroupMeta = {
  key: NavGroup;
  shortLabel: string;
};

export const dockGroups: DockGroupMeta[] = [
  { key: "overview", shortLabel: "Обзор" },
  { key: "infrastructure", shortLabel: "Инфра" },
  { key: "operations", shortLabel: "Ops" },
  { key: "security", shortLabel: "Sec" },
  { key: "administration", shortLabel: "Admin" }
];
