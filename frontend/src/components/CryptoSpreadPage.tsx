import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { CryptoSpreadReport, User } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type Props = {
  currentUser: User;
  onError: (message: string) => void;
};

function monthStartInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function money(value: number, digits = 4) {
  return value.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits
  });
}

function signedMoney(value: number) {
  const abs = money(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function toneClass(value: number) {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "is-neutral";
}

function formatAsset(code: string) {
  const raw = code.trim().toUpperCase();
  if (!raw) return "—";
  const networks = ["TRC20", "ERC20", "BEP20", "BEP2", "POLYGON", "SOL", "TON", "ARBITRUM", "OPTIMISM", "BASE"];
  for (const net of networks) {
    if (raw.endsWith(net) && raw.length > net.length) {
      return `${raw.slice(0, -net.length)} ${net}`;
    }
  }
  return raw;
}

function formatPair(pair: string) {
  const [give, get] = pair.split("->").map((part) => part.trim());
  if (!get) return formatAsset(pair);
  return `${formatAsset(give)} → ${formatAsset(get)}`;
}

function formatWhen(value: string | null) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function AmountCell({ amount, asset, usdt }: { amount: number; asset: string; usdt: number }) {
  return (
    <div className="spread-amount">
      <span className="spread-amount-main">
        {money(amount)} <span className="spread-asset">{formatAsset(asset)}</span>
      </span>
      <span className="spread-amount-sub">{money(usdt)} USDT</span>
    </div>
  );
}

function CryptoSpreadPage({ onError }: Props) {
  const [dateFrom, setDateFrom] = useState(monthStartInput());
  const [dateTo, setDateTo] = useState(todayInput());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CryptoSpreadReport | null>(null);

  const maxPairAbs = useMemo(() => {
    if (!report?.pairs.length) return 1;
    return Math.max(...report.pairs.map((p) => Math.abs(p.system_earned_usdt)), 1);
  }, [report]);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await api.cryptoSpreadReport({
        from: `${dateFrom}T00:00:00`,
        to: `${dateTo}T23:59:59`,
        limit: 2000
      });
      setReport(data);
    } catch (err: unknown) {
      setReport(null);
      onError(err instanceof Error ? err.message : "Не удалось посчитать спред.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadReport();
  }, []);

  return (
    <PageShell className="crypto-spread-page">
      <PageHero
        eyebrow="CryptoCash · SSH"
        title="Спред"
        description="Прибыль по кассе: fee входящего и себестоимость выплаты по свапу CryptoCash."
        actions={
          <div className="spread-hero-actions">
            <label className="spread-date">
              <span>С</span>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="spread-date">
              <span>По</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <button type="button" className="btn primary" disabled={loading} onClick={() => void loadReport()}>
              {loading ? "Считаю…" : "Обновить"}
            </button>
          </div>
        }
      />

      {loading && !report ? (
        <div className="spread-loading" aria-busy="true">
          <div className="spread-loading-pulse" />
          <p>Тяну заявки по SSH…</p>
        </div>
      ) : null}

      {!loading && !report ? (
        <EmptyState title="Нет данных" description="Не удалось получить отчёт. Проверьте IEX_SSH_* и нажмите «Обновить»." />
      ) : null}

      {report ? (
        <div className="spread-layout">
          <section className={`spread-pnl ${toneClass(report.system_earned_usdt)}`}>
            <div className="spread-pnl-main">
              <p className="spread-pnl-label">Система за период</p>
              <p className="spread-pnl-value">{signedMoney(report.system_earned_usdt)}</p>
              <p className="spread-pnl-unit">USDT</p>
            </div>
            <div className="spread-pnl-meta">
              <span>
                <strong>{report.orders_count}</strong> заявок
              </span>
              <span className="spread-dot" />
              <span className="muted">crypto ↔ crypto · status 4</span>
            </div>
          </section>

          <div className="spread-flow">
            <article className="spread-flow-card">
              <span>Клиент отдал</span>
              <strong>{money(report.client_gave_usdt)}</strong>
            </article>
            <span className="spread-flow-op" aria-hidden>
              −
            </span>
            <article className="spread-flow-card">
              <span>Fee платёжки</span>
              <strong>{money(report.ps_fee_usdt)}</strong>
            </article>
            <span className="spread-flow-op" aria-hidden>
              −
            </span>
            <article className="spread-flow-card">
              <span>Выплата (свап)</span>
              <strong>{money(report.paid_out_usdt)}</strong>
            </article>
            <span className="spread-flow-op" aria-hidden>
              =
            </span>
            <article className={`spread-flow-card spread-flow-result ${toneClass(report.system_earned_usdt)}`}>
              <span>Система</span>
              <strong>{signedMoney(report.system_earned_usdt)}</strong>
            </article>
          </div>

          <div className="spread-grid">
            <Panel title="По парам" className="spread-panel">
              {report.pairs.length === 0 ? (
                <EmptyState title="Нет пар" description="За период нет завершённых crypto↔crypto заявок." />
              ) : (
                <ul className="spread-pair-list">
                  {report.pairs.map((pair) => {
                    const width = `${Math.max(4, (Math.abs(pair.system_earned_usdt) / maxPairAbs) * 100)}%`;
                    return (
                      <li key={pair.pair} className="spread-pair-row">
                        <div className="spread-pair-head">
                          <span className="spread-pair">{formatPair(pair.pair)}</span>
                          <span className="spread-pair-count">{pair.orders_count}</span>
                          <span className={`spread-pair-earn mono ${toneClass(pair.system_earned_usdt)}`}>
                            {signedMoney(pair.system_earned_usdt)}
                          </span>
                        </div>
                        <div className="spread-pair-bar" aria-hidden>
                          <i className={toneClass(pair.system_earned_usdt)} style={{ width }} />
                        </div>
                        <div className="spread-pair-foot muted">
                          <span>отдал {money(pair.client_gave_usdt)}</span>
                          <span>fee {money(pair.ps_fee_usdt)}</span>
                          <span>выплата {money(pair.paid_out_usdt)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>

            <Panel title="Заявки" className="spread-panel spread-panel-orders">
              {report.orders.length === 0 ? (
                <EmptyState title="Нет заявок" description="В выборке нет завершённых crypto↔crypto заявок." />
              ) : (
                <div className="spread-table-wrap">
                  <table className="spread-table spread-table-orders">
                    <thead>
                      <tr>
                        <th className="num">№</th>
                        <th>Пара</th>
                        <th>Когда</th>
                        <th>Отдал</th>
                        <th>Fee</th>
                        <th>Выплата</th>
                        <th className="num">Система</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.orders.map((order) => (
                        <tr key={order.task_id}>
                          <td className="num mono">{order.task_id}</td>
                          <td>
                            <span className="spread-pair">{formatPair(order.pair)}</span>
                          </td>
                          <td className="spread-when">{formatWhen(order.completed_at)}</td>
                          <td>
                            <AmountCell amount={order.client_gave} asset={order.give_xml} usdt={order.client_gave_usdt} />
                          </td>
                          <td>
                            <AmountCell amount={order.ps_fee} asset={order.give_xml} usdt={order.ps_fee_usdt} />
                          </td>
                          <td>
                            <AmountCell amount={order.paid_out} asset={order.get_xml} usdt={order.paid_out_usdt} />
                          </td>
                          <td className={`num mono ${toneClass(order.system_earned_usdt)}`}>
                            {signedMoney(order.system_earned_usdt)}
                            <span className="spread-amount-sub">USDT</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}

export default CryptoSpreadPage;
