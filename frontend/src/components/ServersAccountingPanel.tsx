import type { ServerAccountingSummary } from "../types";
import { billingPeriodLabel, formatMoney } from "../utils/formatMoney";

type Props = {
  summary: ServerAccountingSummary | null;
  loading?: boolean;
};

function ServersAccountingPanel({ summary, loading }: Props) {
  if (loading && !summary) {
    return (
      <section className="panel accounting-panel">
        <h2>Бухгалтерия</h2>
        <p className="muted">Загружаем сводку расходов…</p>
      </section>
    );
  }

  if (!summary) {
    return null;
  }

  const currency = summary.primary_currency;

  return (
    <section className="panel accounting-panel span-two">
      <div className="panel-head">
        <div>
          <h2>Бухгалтерия</h2>
          <p className="muted">Стоимость серверов, период оплаты и сводка расходов в месяц / год.</p>
        </div>
      </div>

      <div className="stats-grid accounting-stats">
        <article className="stat-card mint">
          <span>Расход в месяц</span>
          <strong>{formatMoney(summary.total_monthly, currency)}</strong>
        </article>
        <article className="stat-card sky">
          <span>Прогноз в год</span>
          <strong>{formatMoney(summary.total_yearly, currency)}</strong>
        </article>
        <article className="stat-card amber">
          <span>Разовые затраты</span>
          <strong>{formatMoney(summary.total_setup_cost, currency)}</strong>
        </article>
        <article className="stat-card ice">
          <span>С ценой / без цены</span>
          <strong>
            {summary.servers_with_cost} / {summary.servers_without_cost}
          </strong>
        </article>
      </div>

      {Object.keys(summary.totals_by_currency).length > 1 ? (
        <div className="accounting-currency-row">
          {Object.entries(summary.totals_by_currency).map(([code, amount]) => (
            <span className="server-chip" key={code}>
              {code}: {formatMoney(amount, code)} / мес.
            </span>
          ))}
        </div>
      ) : null}

      {summary.by_group.length > 0 ? (
        <div className="accounting-groups">
          <h3>По группам</h3>
          <div className="result-stack">
            {summary.by_group.map((row) => (
              <article className="mini-card" key={row.group_name}>
                <div className="server-card-row">
                  <strong>{row.group_name}</strong>
                  <span className="muted">{row.server_count} серв.</span>
                </div>
                <p>{formatMoney(row.monthly_total, row.currency)} / мес.</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="accounting-table-wrap">
        <h3>Детализация по серверам</h3>
        {summary.items.length === 0 ? (
          <p className="muted">Нет серверов для учёта.</p>
        ) : (
          <table className="accounting-table">
            <thead>
              <tr>
                <th>Сервер</th>
                <th>Группа</th>
                <th>Провайдер</th>
                <th>Тариф</th>
                <th>В месяц</th>
                <th>Оплачен до</th>
              </tr>
            </thead>
            <tbody>
              {summary.items.map((row) => (
                <tr key={row.server_id}>
                  <td>
                    <strong>{row.server_name}</strong>
                  </td>
                  <td>{row.group_name}</td>
                  <td>{row.provider || "—"}</td>
                  <td>
                    {row.monthly_cost != null ? (
                      <>
                        {formatMoney(row.monthly_cost, row.currency)}{" "}
                        <span className="muted">{billingPeriodLabel(row.billing_period)}</span>
                      </>
                    ) : (
                      <span className="muted">не указано</span>
                    )}
                  </td>
                  <td>
                    {row.monthly_equivalent != null ? (
                      <strong>{formatMoney(row.monthly_equivalent, row.currency)}</strong>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{row.pay_until ? new Date(row.pay_until).toLocaleDateString("ru-RU") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

export default ServersAccountingPanel;
