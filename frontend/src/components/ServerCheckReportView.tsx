import type { ServerCheckReport } from "../types";

type Props = {
  report: ServerCheckReport;
  formatDuration: (ms: number) => string;
};

function healthClass(health: string) {
  if (health === "good") return "good";
  if (health === "fair") return "fair";
  if (health === "poor") return "poor";
  return "unknown";
}

function toneClass(tone: string) {
  if (tone === "success") return "success";
  if (tone === "error") return "error";
  if (tone === "warning") return "warning";
  if (tone === "info") return "info";
  return "neutral";
}

function tileIcon(status: string) {
  if (status === "success") return "✓";
  if (status === "error") return "✕";
  if (status === "warning") return "!";
  return "•";
}

function ServerCheckReportView({ report, formatDuration }: Props) {
  const { visual } = report;
  const healthScore =
    visual.passed + visual.failed + visual.warnings > 0
      ? Math.round((visual.passed / Math.max(visual.passed + visual.failed + visual.warnings, 1)) * 100)
      : report.ok
        ? 100
        : 0;

  return (
    <div className="server-checks-report">
      <div className={`check-report-hero health-${healthClass(visual.health)}`}>
        <div className="check-health-ring" style={{ ["--score" as string]: `${healthScore}` }}>
          <div className="check-health-ring-inner">
            <strong>{healthScore}%</strong>
            <span>{visual.health_label}</span>
          </div>
        </div>
        <div className="check-report-hero-copy">
          <p className="eyebrow">{report.check_title}</p>
          <h3>{report.server_name}</h3>
          <p className="hero-copy">{report.summary}</p>
          <div className="check-report-stat-row">
            <span className="check-stat success">✓ {visual.passed}</span>
            <span className="check-stat error">✕ {visual.failed}</span>
            <span className="check-stat warning">! {visual.warnings}</span>
            <span className="check-stat neutral">⏱ {formatDuration(report.duration_ms)}</span>
          </div>
        </div>
        <div className="check-report-status-badge">
          <span className={`status-pill ${report.ok ? "online" : "offline"}`}>{report.ok ? "OK" : "FAIL"}</span>
          <span className="muted">код {report.exit_code}</span>
        </div>
      </div>

      {visual.highlights.length ? (
        <div className="check-highlights">
          {visual.highlights.map((item) => (
            <article className={`check-highlight tone-${toneClass(item.tone)}`} key={`${item.icon}-${item.text}`}>
              <span className="check-highlight-icon">{item.icon}</span>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      ) : null}

      {visual.scorecards.length ? (
        <section className="check-report-block">
          <div className="check-report-block-head">
            <h4>Ключевые показатели</h4>
          </div>
          <div className="check-scorecards">
            {visual.scorecards.map((card) => (
              <article className={`check-scorecard tone-${toneClass(card.tone)}`} key={`${card.label}-${card.value}`}>
                <span className="check-scorecard-icon">{card.icon}</span>
                <div>
                  <span className="muted">{card.label}</span>
                  <strong>{card.value}</strong>
                  {card.hint ? <small>{card.hint}</small> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {visual.bars.length ? (
        <section className="check-report-block">
          <div className="check-report-block-head">
            <h4>Скорость и нагрузка</h4>
          </div>
          <div className="check-bars">
            {visual.bars.map((bar) => {
              const percent = Math.max(4, Math.min(100, Math.round((bar.value / Math.max(bar.max_value, 1)) * 100)));
              return (
                <article className="check-bar-row" key={`${bar.label}-${bar.unit}`}>
                  <div className="check-bar-head">
                    <strong>{bar.label}</strong>
                    <span>
                      {bar.value} {bar.unit}
                    </span>
                  </div>
                  <div className="check-bar-track">
                    <span className={`check-bar-fill tone-${toneClass(bar.tone)}`} style={{ width: `${percent}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {visual.tiles.length ? (
        <section className="check-report-block">
          <div className="check-report-block-head">
            <h4>Результаты проверок</h4>
            <span className="muted">{visual.tiles.length} элементов</span>
          </div>
          <div className="check-tile-grid">
            {visual.tiles.map((tile) => (
              <article className={`check-tile status-${tile.status}`} key={`${tile.title}-${tile.detail ?? ""}`}>
                <div className="check-tile-icon">{tileIcon(tile.status)}</div>
                <div className="check-tile-body">
                  <strong>{tile.title}</strong>
                  {tile.detail ? <span>{tile.detail}</span> : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!visual.scorecards.length && !visual.bars.length && !visual.tiles.length ? (
        <section className="check-report-block">
          <div className="check-empty-visual">
            <span className="check-empty-visual-icon">📋</span>
            <p>Скрипт завершился, но визуальные метрики не распознаны.</p>
            <span className="muted">Откройте технический лог ниже для деталей.</span>
          </div>
        </section>
      ) : null}

      {report.raw_excerpt ? (
        <details className="server-check-raw">
          <summary>Технический лог (для администратора)</summary>
          <pre>{report.raw_excerpt}</pre>
        </details>
      ) : null}
    </div>
  );
}

export default ServerCheckReportView;
