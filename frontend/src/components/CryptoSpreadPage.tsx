import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { CryptoSpreadReport, Server, User } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type Props = {
  currentUser: User;
  servers: Server[];
  onError: (message: string) => void;
};

const DEFAULT_SPREAD_SERVER_ID = 27;

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

function CryptoSpreadPage({ servers, onError }: Props) {
  const [dateFrom, setDateFrom] = useState(monthStartInput());
  const [dateTo, setDateTo] = useState(todayInput());
  const [serverId, setServerId] = useState(String(DEFAULT_SPREAD_SERVER_ID));
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<CryptoSpreadReport | null>(null);

  const exchangerServers = useMemo(() => {
    const matched = servers.filter((server) => {
      const hay = `${server.name} ${server.ip} ${server.notes || ""}`.toLowerCase();
      return hay.includes("iex") || hay.includes("kubex") || hay.includes("exchange") || hay.includes("103.68.110");
    });
    const preferred = servers.find((server) => server.id === DEFAULT_SPREAD_SERVER_ID);
    const base = matched.length ? matched : servers;
    if (preferred && !base.some((server) => server.id === preferred.id)) {
      return [preferred, ...base];
    }
    return base;
  }, [servers]);

  async function loadReport(from = dateFrom, to = dateTo, selectedServerId = serverId) {
    setLoading(true);
    try {
      const data = await api.cryptoSpreadReport({
        from: `${from}T00:00:00`,
        to: `${to}T23:59:59`,
        server_id: Number(selectedServerId) || DEFAULT_SPREAD_SERVER_ID,
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
    void loadReport(monthStartInput(), todayInput(), String(DEFAULT_SPREAD_SERVER_ID));
  }, []);

  return (
    <PageShell className="crypto-spread-page">
      <PageHero
        eyebrow="Обменник"
        title="Спред крипта → крипта"
        description="Сколько клиент отдал, сколько забрала платёжка, сколько выплатили и что осталось системе."
        actions={
          <button type="button" className="btn primary" disabled={loading} onClick={() => void loadReport()}>
            {loading ? "Считаю…" : "Обновить"}
          </button>
        }
      />

      <Panel title="Период и источник">
        <div className="spread-filters">
          <label>
            С даты
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            По дату
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label className="spread-filters-server">
            Сервер обменника
            <select value={serverId} onChange={(e) => setServerId(e.target.value)}>
              {exchangerServers.length === 0 ? (
                <option value={DEFAULT_SPREAD_SERVER_ID}>Сервер #{DEFAULT_SPREAD_SERVER_ID}</option>
              ) : null}
              {exchangerServers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.ip})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted spread-hint">Только выполненные заявки (status=4), обе стороны — крипта. Суммы в USDT.</p>
      </Panel>

      {loading && !report ? <p className="muted">Загружаю отчёт…</p> : null}

      {!report && !loading ? (
        <EmptyState title="Нет данных" description="Измените период и нажмите «Обновить»." />
      ) : null}

      {report ? (
        <div className="page-stack">
          <div className="stats-grid spread-stats">
            <article className="stat-card sky">
              <span>Клиент отдал</span>
              <strong>{money(report.client_gave_usdt)}</strong>
              <em>USDT</em>
            </article>
            <article className="stat-card amber">
              <span>Платёжка</span>
              <strong>{money(report.ps_fee_usdt)}</strong>
              <em>USDT</em>
            </article>
            <article className="stat-card ice">
              <span>Выплатили</span>
              <strong>{money(report.paid_out_usdt)}</strong>
              <em>USDT</em>
            </article>
            <article className={`stat-card spread-earn ${toneClass(report.system_earned_usdt)}`}>
              <span>Система</span>
              <strong>{signedMoney(report.system_earned_usdt)}</strong>
              <em>USDT</em>
            </article>
          </div>

          <div className="spread-meta">
            <span>
              Заявок: <strong>{report.orders_count}</strong>
              <span className="muted"> из {report.scanned_count}</span>
            </span>
            <span className="spread-meta-source" title={report.source}>
              Источник: <code>{report.source}</code>
            </span>
          </div>

          <Panel title="По парам">
            {report.pairs.length === 0 ? (
              <EmptyState title="Нет крипто-пар" description="За период не нашлось завершённых crypto↔crypto заявок." />
            ) : (
              <div className="spread-table-wrap">
                <table className="spread-table">
                  <thead>
                    <tr>
                      <th>Пара</th>
                      <th className="num">Заявок</th>
                      <th className="num">Клиент отдал</th>
                      <th className="num">Платёжка</th>
                      <th className="num">Выплата</th>
                      <th className="num">Система</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pairs.map((pair) => (
                      <tr key={pair.pair}>
                        <td>
                          <span className="spread-pair">{formatPair(pair.pair)}</span>
                        </td>
                        <td className="num">{pair.orders_count}</td>
                        <td className="num mono">{money(pair.client_gave_usdt)}</td>
                        <td className="num mono">{money(pair.ps_fee_usdt)}</td>
                        <td className="num mono">{money(pair.paid_out_usdt)}</td>
                        <td className={`num mono ${toneClass(pair.system_earned_usdt)}`}>
                          {signedMoney(pair.system_earned_usdt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Заявки">
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
                      <th>Платёжка</th>
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
      ) : null}
    </PageShell>
  );
}

export default CryptoSpreadPage;
