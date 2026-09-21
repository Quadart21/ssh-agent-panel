import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { CryptoSpreadOrder, CryptoSpreadReport, User } from "../types";
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

function AmountBlock({
  label,
  amount,
  asset,
  usdt
}: {
  label: string;
  amount: number;
  asset: string;
  usdt: number;
}) {
  return (
    <div className="spread-detail-metric">
      <span className="spread-order-label">{label}</span>
      <strong>
        {money(amount)} <span className="spread-asset">{formatAsset(asset)}</span>
      </strong>
      <em>{money(usdt)} USDT</em>
    </div>
  );
}

function OrderDetail({ order, onBack }: { order: CryptoSpreadOrder; onBack: () => void }) {
  return (
    <div className="spread-detail">
      <div className="spread-detail-toolbar">
        <button type="button" className="ghost" onClick={onBack}>
          ← К списку
        </button>
        <div className="spread-detail-title">
          <span className="mono">#{order.task_id}</span>
          <h2>{formatPair(order.pair)}</h2>
          <p className="muted">{formatWhen(order.completed_at)}</p>
        </div>
      </div>

      <section className={`spread-detail-pnl ${toneClass(order.system_earned_usdt)}`}>
        <span>Система по заявке</span>
        <strong className="mono">{signedMoney(order.system_earned_usdt)} USDT</strong>
      </section>

      <div className="spread-detail-metrics">
        <AmountBlock label="Клиент отдал" amount={order.client_gave} asset={order.give_xml} usdt={order.client_gave_usdt} />
        <AmountBlock label="Fee платёжки" amount={order.ps_fee} asset={order.give_xml} usdt={order.ps_fee_usdt} />
        <AmountBlock label="Выплата" amount={order.paid_out} asset={order.get_xml} usdt={order.paid_out_usdt} />
      </div>

      {(order.course_display || order.merchant_provider) && (
        <div className="spread-detail-meta muted">
          {order.merchant_provider ? <span>Мерчант: {order.merchant_provider}</span> : null}
          {order.course_display ? <span>{order.course_display}</span> : null}
        </div>
      )}

      <section className="spread-detail-callbacks">
        <h3>Колбеки CryptoCash</h3>
        {order.callbacks?.length ? (
          <div className="spread-callbacks">
            {order.callbacks.map((cb) => (
              <article key={`${order.task_id}-${cb.side}`} className={`spread-callback is-${cb.side}`}>
                <div className="spread-callback-head">
                  <strong>{cb.title}</strong>
                  {cb.tx_hash ? (
                    <code className="spread-callback-hash" title={cb.tx_hash}>
                      {cb.tx_hash}
                    </code>
                  ) : null}
                </div>
                <ul>
                  {cb.lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="Нет колбеков" description="По этой заявке Paid-колбеки CryptoCash не найдены." />
        )}
      </section>
    </div>
  );
}

function CryptoSpreadPage({ onError }: Props) {
  const [dateFrom, setDateFrom] = useState(monthStartInput());
  const [dateTo, setDateTo] = useState(todayInput());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CryptoSpreadReport | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const maxPairAbs = useMemo(() => {
    if (!report?.pairs.length) return 1;
    return Math.max(...report.pairs.map((p) => Math.abs(p.system_earned_usdt)), 1);
  }, [report]);

  const selectedOrder = useMemo(
    () => report?.orders.find((order) => order.task_id === selectedId) ?? null,
    [report, selectedId]
  );

  async function loadReport() {
    setLoading(true);
    try {
      const data = await api.cryptoSpreadReport({
        from: `${dateFrom}T00:00:00`,
        to: `${dateTo}T23:59:59`,
        limit: 2000
      });
      setReport(data);
      setSelectedId(null);
    } catch (err: unknown) {
      setReport(null);
      setSelectedId(null);
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
        eyebrow="CryptoCash · SSH #27"
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
        <EmptyState title="Нет данных" description="Не удалось получить отчёт. Нажмите «Обновить»." />
      ) : null}

      {report && selectedOrder ? (
        <OrderDetail order={selectedOrder} onBack={() => setSelectedId(null)} />
      ) : null}

      {report && !selectedOrder ? (
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

            <Panel title="Заявки" className="spread-panel spread-panel-orders" description="Нажмите строку, чтобы открыть детали и колбеки.">
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
                        <th className="num">Система</th>
                        <th className="num">Колбеки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.orders.map((order) => (
                        <tr
                          key={order.task_id}
                          className="spread-row-link"
                          tabIndex={0}
                          onClick={() => setSelectedId(order.task_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedId(order.task_id);
                            }
                          }}
                        >
                          <td className="num mono">{order.task_id}</td>
                          <td>
                            <span className="spread-pair">{formatPair(order.pair)}</span>
                          </td>
                          <td className="spread-when">{formatWhen(order.completed_at)}</td>
                          <td className={`num mono ${toneClass(order.system_earned_usdt)}`}>
                            {signedMoney(order.system_earned_usdt)}
                          </td>
                          <td className="num muted">
                            {order.callbacks?.length ? (
                              <span className="spread-cb-badge">{order.callbacks.length}</span>
                            ) : (
                              "—"
                            )}
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
