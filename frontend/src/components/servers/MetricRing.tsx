import type { CSSProperties } from "react";

type Props = {
  label: string;
  value: number;
  tone: "sky" | "mint" | "amber";
  compact?: boolean;
};

function MetricRing({ label, value, tone, compact = false }: Props) {
  const normalized = Math.max(0, Math.min(100, value));
  const style = {
    "--metric-value": normalized,
    "--metric-accent":
      tone === "sky" ? "#7cc8ff" : tone === "mint" ? "#6df7c1" : "#ffc56a"
  } as CSSProperties;

  return (
    <div className={`metric-ring ${compact ? "compact" : ""}`} style={style}>
      <div className="metric-ring-graphic">
        <div className="metric-ring-inner">
          <strong>{normalized}%</strong>
        </div>
      </div>
      <span>{label}</span>
    </div>
  );
}

export default MetricRing;
