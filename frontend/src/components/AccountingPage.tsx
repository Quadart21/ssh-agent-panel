import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";
import type {
  AccountingBudget,
  AccountingCalendarEvent,
  AccountingOverview,
  AccountingPayment,
  AccountingPlan,
  AccountingReport,
  InfraAsset,
  Server,
  ServerAccountingSummary,
  User
} from "../types";
import { billingPeriodLabel, formatMoney } from "../utils/formatMoney";
import { userHasActionAccess } from "../navigation";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";
import {
  ASSET_CATEGORIES,
  BILLING_PERIODS,
  categoryLabel,
  eventStatusLabel,
  formatDateRu,
  monthEndInput,
  monthStartInput,
  toDateInput,
  todayInput
} from "./accounting/helpers";

type TabId = "overview" | "calendar" | "assets" | "payments" | "plans" | "budgets" | "reports";

type Props = {
  currentUser: User;
  servers: Server[];
  onError: (message: string) => void;
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "calendar", label: "Календарь" },
  { id: "assets", label: "Активы" },
  { id: "payments", label: "Платежи" },
  { id: "plans", label: "Планы" },
  { id: "budgets", label: "Бюджеты" },
  { id: "reports", label: "Отчёты" }
];

const emptyAssetForm = {
  name: "",
  category: "domain",
  provider: "",
  cost: "",
  billing_period: "yearly",
  currency: "RUB",
  pay_until: "",
  notes: ""
};

const emptyPaymentForm = {
  title: "",
  amount: "",
  currency: "RUB",
  category: "other",
  paid_at: todayInput(),
  server_id: "",
  asset_id: "",
  notes: ""
};

const emptyPlanForm = {
  title: "",
  amount: "",
  currency: "RUB",
  category: "other",
  due_date: todayInput(),
  server_id: "",
  asset_id: "",
  notes: ""
};

const emptyBudgetForm = {
  year: String(new Date().getFullYear()),
  month: String(new Date().getMonth() + 1),
  currency: "RUB",
  planned_amount: "",
  category: ""
};

function AccountingPage({ currentUser, servers, onError }: Props) {
  const canManage = userHasActionAccess(currentUser, "accounting_manage") || currentUser.role === "admin";
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [overview, setOverview] = useState<AccountingOverview | null>(null);
  const [calendar, setCalendar] = useState<AccountingCalendarEvent[]>([]);
  const [assets, setAssets] = useState<InfraAsset[]>([]);
  const [payments, setPayments] = useState<AccountingPayment[]>([]);
  const [plans, setPlans] = useState<AccountingPlan[]>([]);
  const [budgets, setBudgets] = useState<AccountingBudget[]>([]);
  const [serverSummary, setServerSummary] = useState<ServerAccountingSummary | null>(null);
  const [report, setReport] = useState<AccountingReport | null>(null);
  const [reportFrom, setReportFrom] = useState(monthStartInput());
  const [reportTo, setReportTo] = useState(monthEndInput());

  const [assetForm, setAssetForm] = useState(emptyAssetForm);
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [budgetForm, setBudgetForm] = useState(emptyBudgetForm);

  const plannedPlans = useMemo(() => plans.filter((plan) => plan.status === "planned"), [plans]);

  async function reloadAll() {
    setLoading(true);
    try {
      const [ov, cal, as, pay, pl, bud, serversAcc, rep] = await Promise.all([
        api.accountingOverview(),
        api.accountingCalendar(),
        api.listInfraAssets(),
        api.listAccountingPayments(),
        api.listAccountingPlans(),
        api.listAccountingBudgets(new Date().getFullYear()),
        api.serversAccounting(),
        api.accountingReports({ from: reportFrom, to: reportTo })
      ]);
      setOverview(ov);
      setCalendar(cal);
      setAssets(as);
      setPayments(pay);
      setPlans(pl);
      setBudgets(bud);
      setServerSummary(serversAcc);
      setReport(rep);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить бухгалтерию.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function withBusy(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await reloadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Операция не выполнена.");
    } finally {
      setBusy(false);
    }
  }

  async function loadReport() {
    setBusy(true);
    try {
      setReport(await api.accountingReports({ from: reportFrom, to: reportTo }));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить отчёт.");
    } finally {
      setBusy(false);
    }
  }

  function onAssetSubmit(event: FormEvent) {
    event.preventDefault();
    void withBusy(async () => {
      const payload = {
        name: assetForm.name.trim(),
        category: assetForm.category,
        provider: assetForm.provider.trim() || null,
        cost: assetForm.cost ? Number(assetForm.cost) : null,
        billing_period: assetForm.billing_period,
        currency: assetForm.currency.trim().toUpperCase() || "RUB",
        pay_until: assetForm.pay_until || null,
        notes: assetForm.notes.trim() || null
      };
      if (editingAssetId) {
        await api.updateInfraAsset(editingAssetId, payload);
      } else {
        await api.createInfraAsset(payload);
      }
      setAssetForm(emptyAssetForm);
      setEditingAssetId(null);
    });
  }

  function onPaymentSubmit(event: FormEvent) {
    event.preventDefault();
    void withBusy(async () => {
      const payload = {
        title: paymentForm.title.trim(),
        amount: Number(paymentForm.amount),
        currency: paymentForm.currency.trim().toUpperCase() || "RUB",
        category: paymentForm.category,
        paid_at: paymentForm.paid_at,
        server_id: paymentForm.server_id ? Number(paymentForm.server_id) : null,
        asset_id: paymentForm.asset_id ? Number(paymentForm.asset_id) : null,
        notes: paymentForm.notes.trim() || null
      };
      if (editingPaymentId) {
        await api.updateAccountingPayment(editingPaymentId, payload);
      } else {
        await api.createAccountingPayment(payload);
      }
      setPaymentForm({ ...emptyPaymentForm, paid_at: todayInput() });
      setEditingPaymentId(null);
    });
  }

  function onPlanSubmit(event: FormEvent) {
    event.preventDefault();
    void withBusy(async () => {
      const payload = {
        title: planForm.title.trim(),
        amount: Number(planForm.amount),
        currency: planForm.currency.trim().toUpperCase() || "RUB",
        category: planForm.category,
        due_date: planForm.due_date,
        server_id: planForm.server_id ? Number(planForm.server_id) : null,
        asset_id: planForm.asset_id ? Number(planForm.asset_id) : null,
        status: "planned",
        notes: planForm.notes.trim() || null
      };
      if (editingPlanId) {
        await api.updateAccountingPlan(editingPlanId, payload);
      } else {
        await api.createAccountingPlan(payload);
      }
      setPlanForm({ ...emptyPlanForm, due_date: todayInput() });
      setEditingPlanId(null);
    });
  }

  function onBudgetSubmit(event: FormEvent) {
    event.preventDefault();
    void withBusy(async () => {
      await api.createAccountingBudget({
        year: Number(budgetForm.year),
        month: Number(budgetForm.month),
        currency: budgetForm.currency.trim().toUpperCase() || "RUB",
        planned_amount: Number(budgetForm.planned_amount),
        category: budgetForm.category || null
      });
      setBudgetForm(emptyBudgetForm);
    });
  }

  const currency = overview?.primary_currency ?? "RUB";
  const maxTop = Math.max(...(overview?.top_expenses.map((row) => row.amount) ?? [1]), 1);
  const maxReport = Math.max(
    ...(report?.by_category.map((row) => row.amount) ?? [0]),
    ...(report?.by_month.map((row) => row.amount) ?? [0]),
    1
  );

  return (
    <PageShell className="accounting-page">
      <PageHero
        eyebrow="Обзор"
        title="Бухгалтерия"
        description="Расходы инфраструктуры: серверы, домены, календарь оплат, бюджеты и отчёты."
      />

      <nav className="page-tabs page-tabs--compact" aria-label="Разделы бухгалтерии">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`page-tab ${tab === item.id ? "active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {loading && !overview ? <p className="muted">Загружаем данные…</p> : null}

      {tab === "overview" && overview ? (
        <section className="page-stack">
          <div className="stats-grid accounting-stats">
            <article className="stat-card mint">
              <span>Расход в месяц</span>
              <strong>{formatMoney(overview.monthly_recurring, currency)}</strong>
            </article>
            <article className="stat-card sky">
              <span>Прогноз в год</span>
              <strong>{formatMoney(overview.yearly_forecast, currency)}</strong>
            </article>
            <article className="stat-card amber">
              <span>Серверы / активы</span>
              <strong>
                {formatMoney(overview.servers_monthly, currency)} / {formatMoney(overview.assets_monthly, currency)}
              </strong>
            </article>
            <article className="stat-card ice">
              <span>Бюджет месяца</span>
              <strong>
                {overview.budget_planned != null
                  ? `${formatMoney(overview.budget_actual, currency)} / ${formatMoney(overview.budget_planned, currency)}`
                  : formatMoney(overview.budget_actual, currency)}
              </strong>
            </article>
          </div>

          <div className="dashboard-grid">
            <Panel title="План vs факт">
              {overview.budget_planned == null ? (
                <p className="muted">Бюджет на текущий месяц не задан. Создайте его во вкладке «Бюджеты».</p>
              ) : (
                <>
                  <div className="accounting-progress">
                    <div
                      className="accounting-progress-fill"
                      style={{
                        width: `${Math.min(100, (overview.budget_actual / Math.max(overview.budget_planned, 1)) * 100)}%`
                      }}
                    />
                  </div>
                  <p>
                    Остаток:{" "}
                    <strong>
                      {formatMoney(overview.budget_remaining, currency)}
                    </strong>
                  </p>
                </>
              )}
            </Panel>

            <Panel title="Топ расходов (в месяц)">
              {overview.top_expenses.length === 0 ? (
                <EmptyState title="Нет данных" description="Укажите стоимость серверов или активов." />
              ) : (
                <div className="accounting-bars">
                  {overview.top_expenses.map((row) => (
                    <div className="accounting-bar-row" key={row.label}>
                      <div className="accounting-bar-meta">
                        <strong>{row.label}</strong>
                        <span>{formatMoney(row.amount, row.currency)}</span>
                      </div>
                      <div className="accounting-progress">
                        <div className="accounting-progress-fill" style={{ width: `${(row.amount / maxTop) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>

          <div className="dashboard-grid">
            <Panel title="Просрочено">
              {overview.overdue.length === 0 ? (
                <p className="muted">Просроченных оплат нет.</p>
              ) : (
                <div className="list-stack">
                  {overview.overdue.map((event) => (
                    <article className="mini-card" key={`${event.source}-${event.source_id}`}>
                      <div className="server-card-row">
                        <strong>{event.title}</strong>
                        <span className="tone-error">{eventStatusLabel(event.status)}</span>
                      </div>
                      <p>
                        {formatDateRu(event.due_date)} · {formatMoney(event.amount, event.currency)}
                      </p>
                      {canManage && event.source !== "plan" ? (
                        <button
                          type="button"
                          className="ghost"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await api.accountingMarkPaid({
                                target_type: event.source === "server" ? "server" : "asset",
                                target_id: event.source_id
                              });
                            })
                          }
                        >
                          Оплатил
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </Panel>

            <Panel title="Ближайший месяц">
              <div className="stats-grid accounting-stats" style={{ marginBottom: "0.85rem" }}>
                <article className="stat-card amber">
                  <span>К оплате за 30 дней</span>
                  <strong>{formatMoney(overview.upcoming_month_total, currency)}</strong>
                </article>
                <article className="stat-card mint">
                  <span>Recurring / мес</span>
                  <strong>{formatMoney(overview.monthly_recurring, currency)}</strong>
                </article>
              </div>
              {(overview.upcoming_month?.length ?? 0) === 0 ? (
                <p className="muted">Нет дат оплаты в ближайшие 30 дней — прогноз выше по recurring-тарифам.</p>
              ) : (
                <div className="list-stack">
                  {(overview.upcoming_month ?? []).map((event) => (
                    <article className="mini-card" key={`${event.source}-${event.source_id}`}>
                      <div className="server-card-row">
                        <strong>{event.title}</strong>
                        <span className="muted">{formatDateRu(event.due_date)}</span>
                      </div>
                      <p>
                        {categoryLabel(event.category)} · {formatMoney(event.amount, event.currency)}
                        {event.status === "today" ? " · сегодня" : ""}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </section>
      ) : null}

      {tab === "calendar" ? (
        <Panel title="Календарь оплат">
          {calendar.length === 0 ? (
            <EmptyState title="Пусто" description="Нет дат оплаты у серверов, активов или планов." />
          ) : (
            <div className="accounting-table-wrap">
              <table className="accounting-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Название</th>
                    <th>Тип</th>
                    <th>Категория</th>
                    <th>Сумма</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {calendar.map((event) => (
                    <tr key={`${event.source}-${event.source_id}-${event.due_date}`}>
                      <td>{formatDateRu(event.due_date)}</td>
                      <td>
                        <strong>{event.title}</strong>
                        {event.provider ? <div className="muted">{event.provider}</div> : null}
                      </td>
                      <td>{event.source === "server" ? "Сервер" : event.source === "asset" ? "Актив" : "План"}</td>
                      <td>{categoryLabel(event.category)}</td>
                      <td>{formatMoney(event.amount, event.currency)}</td>
                      <td>
                        <span className={event.status === "overdue" ? "tone-error" : event.status === "today" ? "tone-warning" : ""}>
                          {eventStatusLabel(event.status)}
                        </span>
                      </td>
                      <td>
                        {canManage && (event.source === "server" || event.source === "asset") ? (
                          <button
                            type="button"
                            className="ghost"
                            disabled={busy}
                            onClick={() =>
                              void withBusy(async () => {
                                await api.accountingMarkPaid({
                                  target_type: event.source === "server" ? "server" : "asset",
                                  target_id: event.source_id
                                });
                              })
                            }
                          >
                            Оплатил
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === "assets" ? (
        <section className="dashboard-grid">
          <Panel title={editingAssetId ? "Редактировать актив" : "Новый актив"}>
            {canManage ? (
              <form className="compact-form" onSubmit={onAssetSubmit}>
                <input
                  placeholder="Название"
                  value={assetForm.name}
                  onChange={(event) => setAssetForm({ ...assetForm, name: event.target.value })}
                  required
                />
                <select
                  value={assetForm.category}
                  onChange={(event) => setAssetForm({ ...assetForm, category: event.target.value })}
                >
                  {ASSET_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Провайдер"
                  value={assetForm.provider}
                  onChange={(event) => setAssetForm({ ...assetForm, provider: event.target.value })}
                />
                <div className="form-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Стоимость"
                    value={assetForm.cost}
                    onChange={(event) => setAssetForm({ ...assetForm, cost: event.target.value })}
                  />
                  <select
                    value={assetForm.billing_period}
                    onChange={(event) => setAssetForm({ ...assetForm, billing_period: event.target.value })}
                  >
                    {BILLING_PERIODS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="Валюта"
                    value={assetForm.currency}
                    onChange={(event) => setAssetForm({ ...assetForm, currency: event.target.value })}
                  />
                </div>
                <input
                  type="date"
                  value={assetForm.pay_until}
                  onChange={(event) => setAssetForm({ ...assetForm, pay_until: event.target.value })}
                />
                <textarea
                  rows={2}
                  placeholder="Заметки"
                  value={assetForm.notes}
                  onChange={(event) => setAssetForm({ ...assetForm, notes: event.target.value })}
                />
                <div className="card-actions">
                  <button type="submit" disabled={busy}>
                    {editingAssetId ? "Сохранить" : "Добавить"}
                  </button>
                  {editingAssetId ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingAssetId(null);
                        setAssetForm(emptyAssetForm);
                      }}
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="muted">Нет прав на изменение активов.</p>
            )}
          </Panel>

          <Panel title="Инфра-активы">
            {assets.length === 0 ? (
              <EmptyState title="Активов нет" description="Добавьте домены, CDN или лицензии." />
            ) : (
              <div className="list-stack">
                {assets.map((asset) => (
                  <article className="mini-card" key={asset.id}>
                    <div className="server-card-row">
                      <strong>{asset.name}</strong>
                      <span className="muted">{categoryLabel(asset.category)}</span>
                    </div>
                    <p>
                      {asset.cost != null
                        ? `${formatMoney(asset.cost, asset.currency)} ${billingPeriodLabel(asset.billing_period)}`
                        : "без цены"}
                      {" · "}
                      до {formatDateRu(asset.pay_until)}
                    </p>
                    {canManage ? (
                      <div className="card-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setEditingAssetId(asset.id);
                            setAssetForm({
                              name: asset.name,
                              category: asset.category,
                              provider: asset.provider || "",
                              cost: asset.cost != null ? String(asset.cost) : "",
                              billing_period: asset.billing_period,
                              currency: asset.currency,
                              pay_until: toDateInput(asset.pay_until),
                              notes: asset.notes || ""
                            });
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await api.accountingMarkPaid({ target_type: "asset", target_id: asset.id });
                            })
                          }
                        >
                          Оплатил
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await api.deleteInfraAsset(asset.id);
                            })
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Серверные тарифы" className="span-two">
            <p className="muted">
              Стоимость серверов задаётся в карточке сервера. Полная сводка также на{" "}
              <Link to="/servers">странице серверов</Link>.
            </p>
            {serverSummary && serverSummary.items.length > 0 ? (
              <div className="accounting-table-wrap">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>Сервер</th>
                      <th>Группа</th>
                      <th>Провайдер</th>
                      <th>В месяц</th>
                      <th>Оплачен до</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {serverSummary.items.map((row) => (
                      <tr key={row.server_id}>
                        <td>
                          <strong>{row.server_name}</strong>
                        </td>
                        <td>{row.group_name}</td>
                        <td>{row.provider || "—"}</td>
                        <td>
                          {row.monthly_equivalent != null
                            ? formatMoney(row.monthly_equivalent, row.currency)
                            : "—"}
                        </td>
                        <td>{formatDateRu(row.pay_until)}</td>
                        <td>
                          {canManage ? (
                            <button
                              type="button"
                              className="ghost"
                              disabled={busy}
                              onClick={() =>
                                void withBusy(async () => {
                                  await api.accountingMarkPaid({ target_type: "server", target_id: row.server_id });
                                })
                              }
                            >
                              Оплатил
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Нет серверов с тарифами.</p>
            )}
          </Panel>
        </section>
      ) : null}

      {tab === "payments" ? (
        <section className="dashboard-grid">
          <Panel title={editingPaymentId ? "Редактировать платёж" : "Новый платёж"}>
            {canManage ? (
              <form className="compact-form" onSubmit={onPaymentSubmit}>
                <input
                  placeholder="Название"
                  value={paymentForm.title}
                  onChange={(event) => setPaymentForm({ ...paymentForm, title: event.target.value })}
                  required
                />
                <div className="form-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Сумма"
                    value={paymentForm.amount}
                    onChange={(event) => setPaymentForm({ ...paymentForm, amount: event.target.value })}
                    required
                  />
                  <input
                    placeholder="Валюта"
                    value={paymentForm.currency}
                    onChange={(event) => setPaymentForm({ ...paymentForm, currency: event.target.value })}
                  />
                </div>
                <input
                  type="date"
                  value={paymentForm.paid_at}
                  onChange={(event) => setPaymentForm({ ...paymentForm, paid_at: event.target.value })}
                  required
                />
                <select
                  value={paymentForm.category}
                  onChange={(event) => setPaymentForm({ ...paymentForm, category: event.target.value })}
                >
                  {ASSET_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentForm.server_id}
                  onChange={(event) => setPaymentForm({ ...paymentForm, server_id: event.target.value })}
                >
                  <option value="">Без сервера</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
                <select
                  value={paymentForm.asset_id}
                  onChange={(event) => setPaymentForm({ ...paymentForm, asset_id: event.target.value })}
                >
                  <option value="">Без актива</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  placeholder="Заметки"
                  value={paymentForm.notes}
                  onChange={(event) => setPaymentForm({ ...paymentForm, notes: event.target.value })}
                />
                <div className="card-actions">
                  <button type="submit" disabled={busy}>
                    {editingPaymentId ? "Сохранить" : "Добавить"}
                  </button>
                  {editingPaymentId ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingPaymentId(null);
                        setPaymentForm({ ...emptyPaymentForm, paid_at: todayInput() });
                      }}
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="muted">Нет прав на изменение платежей.</p>
            )}
          </Panel>

          <Panel title="Журнал оплат">
            {payments.length === 0 ? (
              <EmptyState title="Платежей нет" description="Отметьте оплату или добавьте запись вручную." />
            ) : (
              <div className="accounting-table-wrap">
                <table className="accounting-table">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Название</th>
                      <th>Категория</th>
                      <th>Сумма</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>{formatDateRu(payment.paid_at)}</td>
                        <td>
                          <strong>{payment.title}</strong>
                        </td>
                        <td>{categoryLabel(payment.category)}</td>
                        <td>{formatMoney(payment.amount, payment.currency)}</td>
                        <td>
                          {canManage ? (
                            <div className="card-actions">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  setEditingPaymentId(payment.id);
                                  setPaymentForm({
                                    title: payment.title,
                                    amount: String(payment.amount),
                                    currency: payment.currency,
                                    category: payment.category,
                                    paid_at: toDateInput(payment.paid_at),
                                    server_id: payment.server_id != null ? String(payment.server_id) : "",
                                    asset_id: payment.asset_id != null ? String(payment.asset_id) : "",
                                    notes: payment.notes || ""
                                  });
                                }}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                className="danger"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(async () => {
                                    await api.deleteAccountingPayment(payment.id);
                                  })
                                }
                              >
                                Удалить
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </section>
      ) : null}

      {tab === "plans" ? (
        <section className="dashboard-grid">
          <Panel title={editingPlanId ? "Редактировать план" : "Запланированная трата"}>
            {canManage ? (
              <form className="compact-form" onSubmit={onPlanSubmit}>
                <input
                  placeholder="Название"
                  value={planForm.title}
                  onChange={(event) => setPlanForm({ ...planForm, title: event.target.value })}
                  required
                />
                <div className="form-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Сумма"
                    value={planForm.amount}
                    onChange={(event) => setPlanForm({ ...planForm, amount: event.target.value })}
                    required
                  />
                  <input
                    placeholder="Валюта"
                    value={planForm.currency}
                    onChange={(event) => setPlanForm({ ...planForm, currency: event.target.value })}
                  />
                </div>
                <input
                  type="date"
                  value={planForm.due_date}
                  onChange={(event) => setPlanForm({ ...planForm, due_date: event.target.value })}
                  required
                />
                <select
                  value={planForm.category}
                  onChange={(event) => setPlanForm({ ...planForm, category: event.target.value })}
                >
                  {ASSET_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <select
                  value={planForm.server_id}
                  onChange={(event) => setPlanForm({ ...planForm, server_id: event.target.value })}
                >
                  <option value="">Без сервера</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
                <select
                  value={planForm.asset_id}
                  onChange={(event) => setPlanForm({ ...planForm, asset_id: event.target.value })}
                >
                  <option value="">Без актива</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  placeholder="Заметки"
                  value={planForm.notes}
                  onChange={(event) => setPlanForm({ ...planForm, notes: event.target.value })}
                />
                <div className="card-actions">
                  <button type="submit" disabled={busy}>
                    {editingPlanId ? "Сохранить" : "Добавить"}
                  </button>
                  {editingPlanId ? (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setEditingPlanId(null);
                        setPlanForm({ ...emptyPlanForm, due_date: todayInput() });
                      }}
                    >
                      Отмена
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="muted">Нет прав на изменение планов.</p>
            )}
          </Panel>

          <Panel title="Плановые траты">
            {plannedPlans.length === 0 ? (
              <EmptyState title="Планов нет" description="Добавьте будущие расходы инфраструктуры." />
            ) : (
              <div className="list-stack">
                {plannedPlans.map((plan) => (
                  <article className="mini-card" key={plan.id}>
                    <div className="server-card-row">
                      <strong>{plan.title}</strong>
                      <span className="muted">{formatDateRu(plan.due_date)}</span>
                    </div>
                    <p>
                      {formatMoney(plan.amount, plan.currency)} · {categoryLabel(plan.category)}
                    </p>
                    {canManage ? (
                      <div className="card-actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await api.completeAccountingPlan(plan.id);
                            })
                          }
                        >
                          Оплачено
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setEditingPlanId(plan.id);
                            setPlanForm({
                              title: plan.title,
                              amount: String(plan.amount),
                              currency: plan.currency,
                              category: plan.category,
                              due_date: toDateInput(plan.due_date),
                              server_id: plan.server_id != null ? String(plan.server_id) : "",
                              asset_id: plan.asset_id != null ? String(plan.asset_id) : "",
                              notes: plan.notes || ""
                            });
                          }}
                        >
                          Изменить
                        </button>
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await api.deleteAccountingPlan(plan.id);
                            })
                          }
                        >
                          Удалить
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </Panel>
        </section>
      ) : null}

      {tab === "budgets" ? (
        <section className="dashboard-grid">
          <Panel title="Бюджет на месяц">
            {canManage ? (
              <form className="compact-form" onSubmit={onBudgetSubmit}>
                <div className="form-row">
                  <input
                    type="number"
                    min="2000"
                    max="2100"
                    value={budgetForm.year}
                    onChange={(event) => setBudgetForm({ ...budgetForm, year: event.target.value })}
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={budgetForm.month}
                    onChange={(event) => setBudgetForm({ ...budgetForm, month: event.target.value })}
                    required
                  />
                </div>
                <div className="form-row">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="План"
                    value={budgetForm.planned_amount}
                    onChange={(event) => setBudgetForm({ ...budgetForm, planned_amount: event.target.value })}
                    required
                  />
                  <input
                    placeholder="Валюта"
                    value={budgetForm.currency}
                    onChange={(event) => setBudgetForm({ ...budgetForm, currency: event.target.value })}
                  />
                </div>
                <select
                  value={budgetForm.category}
                  onChange={(event) => setBudgetForm({ ...budgetForm, category: event.target.value })}
                >
                  <option value="">Общий бюджет</option>
                  {ASSET_CATEGORIES.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <button type="submit" disabled={busy}>
                  Сохранить бюджет
                </button>
              </form>
            ) : (
              <p className="muted">Нет прав на изменение бюджетов.</p>
            )}
          </Panel>

          <Panel title="Бюджеты">
            {budgets.length === 0 ? (
              <EmptyState title="Бюджетов нет" description="Задайте план трат на месяц." />
            ) : (
              <div className="list-stack">
                {budgets.map((budget) => {
                  const ratio = budget.planned_amount > 0 ? budget.actual_amount / budget.planned_amount : 0;
                  return (
                    <article className="mini-card" key={budget.id}>
                      <div className="server-card-row">
                        <strong>
                          {budget.month.toString().padStart(2, "0")}.{budget.year}
                        </strong>
                        <span className="muted">{budget.category ? categoryLabel(budget.category) : "Общий"}</span>
                      </div>
                      <p>
                        Факт {formatMoney(budget.actual_amount, budget.currency)} / план{" "}
                        {formatMoney(budget.planned_amount, budget.currency)}
                      </p>
                      <div className="accounting-progress">
                        <div className="accounting-progress-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          className="danger"
                          disabled={busy}
                          onClick={() =>
                            void withBusy(async () => {
                              await api.deleteAccountingBudget(budget.id);
                            })
                          }
                        >
                          Удалить
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="page-stack">
          <Panel title="Период отчёта">
            <form
              className="compact-form form-row"
              onSubmit={(event) => {
                event.preventDefault();
                void loadReport();
              }}
            >
              <input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} />
              <input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} />
              <button type="submit" disabled={busy}>
                Обновить
              </button>
            </form>
          </Panel>

          {report ? (
            <>
              <div className="stats-grid accounting-stats">
                <article className="stat-card mint">
                  <span>Оплачено за период</span>
                  <strong>{formatMoney(report.total_paid, report.primary_currency)}</strong>
                </article>
                <article className="stat-card sky">
                  <span>Платежей</span>
                  <strong>{report.payments_count}</strong>
                </article>
                <article className="stat-card amber">
                  <span>Recurring / мес</span>
                  <strong>{formatMoney(report.recurring_monthly, report.primary_currency)}</strong>
                </article>
              </div>

              <div className="dashboard-grid">
                <Panel title="По категориям">
                  <BreakdownBars rows={report.by_category} max={maxReport} />
                </Panel>
                <Panel title="По месяцам">
                  <BreakdownBars rows={report.by_month} max={maxReport} />
                </Panel>
                <Panel title="По провайдерам (recurring)">
                  <BreakdownBars rows={report.by_provider} max={Math.max(...report.by_provider.map((r) => r.amount), 1)} />
                </Panel>
                <Panel title="По группам серверов">
                  <BreakdownBars rows={report.by_group} max={Math.max(...report.by_group.map((r) => r.amount), 1)} />
                </Panel>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </PageShell>
  );
}

function BreakdownBars({
  rows,
  max
}: {
  rows: Array<{ key: string; label: string; amount: number; currency: string; count: number }>;
  max: number;
}) {
  if (rows.length === 0) {
    return <p className="muted">Нет данных за период.</p>;
  }
  return (
    <div className="accounting-bars">
      {rows.map((row) => (
        <div className="accounting-bar-row" key={row.key}>
          <div className="accounting-bar-meta">
            <strong>
              {row.label}
              {row.count ? <span className="muted"> · {row.count}</span> : null}
            </strong>
            <span>{formatMoney(row.amount, row.currency)}</span>
          </div>
          <div className="accounting-progress">
            <div className="accounting-progress-fill" style={{ width: `${(row.amount / Math.max(max, 1)) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default AccountingPage;
