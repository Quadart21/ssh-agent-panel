type Props = {
  label: string;
  value: number | null | undefined;
  tone?: "cpu" | "ram" | "disk";
};

function MetricBar({ label, value, tone = "cpu" }: Props) {
  const hasValue = value != null && Number.isFinite(value);
  const normalized = hasValue ? Math.max(0, Math.min(100, Math.round(value))) : null;

  return (
    <div className={`metric-bar metric-bar--${tone}`}>
      <div className="metric-bar-head">
        <span>{label}</span>
        <strong>{normalized == null ? "—" : `${normalized}%`}</strong>
      </div>
      <div className="metric-bar-track" aria-hidden>
        <span className="metric-bar-fill" style={{ width: `${normalized ?? 0}%` }} />
      </div>
    </div>
  );
}

export default MetricBar;
