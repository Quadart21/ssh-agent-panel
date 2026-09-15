import { useMemo, useState } from "react";

import { api } from "../api";
import type { CryptoSpreadReport, Server, User } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type Props = {
  currentUser: User;
  servers: Server[];
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

function money(value: number) {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function CryptoSpreadPage({ servers, onError }: Props) {
  const [dateFrom, setDateFrom] = useState(monthStartInput());
  const [dateTo, setDateTo] = useState(todayInput());
  const [serverId, setServerId] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<CryptoSpreadReport | null>(null);

  const exchangerServers = useMemo(
    () =>
      servers.filter((server) => {
        const hay = `${server.name} ${server.ip} ${server.notes || ""}`.toLowerCase();
        return hay.includes("iex") || hay.includes("kubex") || hay.includes("exchange") || hay.includes("103.68.110");
      }),
    [servers]
  );

  async function loadReport() {
    setLoading(true);
    try {
      const data = await api.cryptoSpreadReport({
        from: `${dateFrom}T00:00:00`,
        to: `${dateTo}T23:59:59`,
        server_id: serverId ? Number(serverId) : undefined,
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

  return (
    <PageShell>
      <PageHero
        eyebrow="Обменник"
        title="Спред крипта → крипта"
        description="Считаем, сколько клиент отдал, сколько забрала платёжка, сколько выплатили и что осталось системе по завершённым заявкам."
        actions={
          <button type="button" className="btn primary" disabled={loading} onClick={() => void loadReport()}>
            {loading ? "Считаю…" : "Посчитать"}
          </button>
        }
      />

      <Panel title="Период и источник">
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label>
            С даты
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            По дату
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <label>
            Сервер обменника (опционально)
            <select value={serverId} onChange={(e) => setServerId(e.target.value)}>
              <option value="">Из .env (IEX_SSH_* / IEX_DATABASE_URL)</option>
              {(exchangerServers.length ? exchangerServers : servers).map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name} ({server.ip})
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Берутся только выполненные заявки (`status=4`), где обе стороны — крипта (не фиат). Суммы сводятся в USDT.
        </p>
      </Panel>

      {!report && !loading ? (
        <EmptyState title="Отчёта ещё нет" description="Выберите период и нажмите «Посчитать»." />
      ) : null}

      {report ? (
        <>
          <div className="stats-grid" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <Panel title="Клиент отдал">
              <div className="stat-value">{money(report.client_gave_usdt)} USDT</div>
            </Panel>
            <Panel title="Забрала платёжка">
              <div className="stat-value">{money(report.ps_fee_usdt)} USDT</div>
            </Panel>
            <Panel title="Выплатили">
              <div className="stat-value">{money(report.paid_out_usdt)} USDT</div>
            </Panel>
            <Panel title="Заработала система">
              <div className="stat-value" style={{ color: "var(--success)" }}>
                {money(report.system_earned_usdt)} USDT
              </div>
            </Panel>
          </div>

          <Panel title="Сводка">
            <p className="muted">
              Заявок: <strong>{report.orders_count}</strong> из просмотренных {report.scanned_count}. Источник:{" "}
              <code>{report.source}</code>
            </p>
          </Panel>

          <Panel title="По парам">
            {report.pairs.length === 0 ? (
              <EmptyState title="Нет крипто-пар" description="За период не нашлось завершённых crypto↔crypto заявок." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Пара</th>
                      <th>Заявок</th>
                      <th>Клиент отдал</th>
                      <th>Платёжка</th>
                      <th>Выплата</th>
                      <th>Система</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pairs.map((pair) => (
                      <tr key={pair.pair}>
                        <td>{pair.pair}</td>
                        <td>{pair.orders_count}</td>
                        <td>{money(pair.client_gave_usdt)}</td>
                        <td>{money(pair.ps_fee_usdt)}</td>
                        <td>{money(pair.paid_out_usdt)}</td>
                        <td>{money(pair.system_earned_usdt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Заявки">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>№</th>
                    <th>Пара</th>
                    <th>Когда</th>
                    <th>Отдал</th>
                    <th>ПС</th>
                    <th>Выплата</th>
                    <th>Система (USDT)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.orders.map((order) => (
                    <tr key={order.task_id}>
                      <td>{order.task_id}</td>
                      <td>{order.pair}</td>
                      <td>{order.completed_at || "—"}</td>
                      <td>
                        {money(order.client_gave)} {order.give_xml}
                        <div className="muted">{money(order.client_gave_usdt)} USDT</div>
                      </td>
                      <td>
                        {money(order.ps_fee)} {order.give_xml}
                        <div className="muted">{money(order.ps_fee_usdt)} USDT</div>
                      </td>
                      <td>
                        {money(order.paid_out)} {order.get_xml}
                        <div className="muted">{money(order.paid_out_usdt)} USDT</div>
                      </td>
                      <td>{money(order.system_earned_usdt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : null}
    </PageShell>
  );
}

export default CryptoSpreadPage;
