export const METRIC_EMBED_THEMES = [
  { id: "dark", label: "Тёмная", defaultAccent: "#7cc8ff" },
  { id: "light", label: "Светлая", defaultAccent: "#2563eb" },
  { id: "midnight", label: "Полночь", defaultAccent: "#8b9cff" },
  { id: "slate", label: "Slate", defaultAccent: "#94a3b8" },
  { id: "ocean", label: "Океан", defaultAccent: "#22d3ee" }
] as const;

export type MetricEmbedThemeId = (typeof METRIC_EMBED_THEMES)[number]["id"];

export function isMetricEmbedTheme(value: string): value is MetricEmbedThemeId {
  return METRIC_EMBED_THEMES.some((theme) => theme.id === value);
}

export function metricEmbedThemeLabel(theme: string) {
  return METRIC_EMBED_THEMES.find((item) => item.id === theme)?.label ?? theme;
}

export function metricEmbedDefaultAccent(theme: string) {
  return METRIC_EMBED_THEMES.find((item) => item.id === theme)?.defaultAccent ?? "#7cc8ff";
}

export function normalizeAccentColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : "";
}
