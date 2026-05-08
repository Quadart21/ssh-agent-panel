import type { CSSProperties, FormEvent } from "react";

import type { ConnectionTestResult, Group, Server, ServerMetricSnapshot } from "../types";

type ServerForm = {
  name: string;
  ip: string;
  port: number;
  login: string;
  password_enc: string;
  key_path: string;
  group_id: string;
  pay_until: string;
  notes: string;
  test_connection: boolean;
};

type Props = {
  groups: Group[];
  servers: Server[];
  metrics: ServerMetricSnapshot[];
  form: ServerForm;
  setForm: (form: ServerForm) => void;
  connectionResult: ConnectionTestResult | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
  editingServerId: number | null;
  onEdit: (server: Server) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

function ServersPage({
  groups,
  servers,
  metrics,
  form,
  setForm,
  connectionResult,
  onSubmit,
  onTest,
  editingServerId,
  onEdit,
  onCancelEdit,
  onDelete,
  canCreate,
  canEdit,
  canDelete
}: Props) {
  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Серверы</p>
          <h1>Управление узлами и доступом</h1>
          <p className="hero-copy">Добавляйте серверы, проверяйте SSH и держите инвентарь в одном месте.</p>
        </div>
      </section>

      {connectionResult ? (
        <div className={`banner ${connectionResult.ok ? "success" : "error"}`}>
          {connectionResult.message}
          {connectionResult.latency_ms !== null ? ` Задержка: ${connectionResult.latency_ms} мс.` : ""}
        </div>
      ) : null}

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>{editingServerId ? "Редактировать сервер" : "Добавить сервер"}</h2>
            <div className="panel-actions">
              {editingServerId && canEdit ? (
                <button type="button" className="ghost" onClick={onCancelEdit}>
                  Отменить
                </button>
              ) : null}
              <button type="button" className="ghost" onClick={onTest} disabled={!canCreate && !canEdit}>
                Проверить SSH
              </button>
            </div>
          </div>
          {canCreate || (editingServerId && canEdit) ? (
          <form className="form-grid" onSubmit={onSubmit}>
            <label>
              Название
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              IP / хост
              <input value={form.ip} onChange={(event) => setForm({ ...form, ip: event.target.value })} required />
            </label>
            <label>
              Порт
              <input
                type="number"
                value={form.port}
                onChange={(event) => setForm({ ...form, port: Number(event.target.value) })}
              />
            </label>
            <label>
              Логин
              <input value={form.login} onChange={(event) => setForm({ ...form, login: event.target.value })} required />
            </label>
            <label>
              Пароль
              <input
                type="password"
                value={form.password_enc}
                onChange={(event) => setForm({ ...form, password_enc: event.target.value })}
              />
            </label>
            <label>
              Путь к SSH-ключу
              <input value={form.key_path} onChange={(event) => setForm({ ...form, key_path: event.target.value })} />
            </label>
            <label>
              Группа
              <select value={form.group_id} onChange={(event) => setForm({ ...form, group_id: event.target.value })}>
                <option value="">Без группы</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Оплачен до
              <input
                type="datetime-local"
                value={form.pay_until}
                onChange={(event) => setForm({ ...form, pay_until: event.target.value })}
              />
            </label>
            <label className="full-width">
              Заметки
              <textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            <label className="checkbox full-width">
              <input
                type="checkbox"
                checked={form.test_connection}
                onChange={(event) => setForm({ ...form, test_connection: event.target.checked })}
              />
              Проверять SSH при сохранении
            </label>
            <button type="submit">{editingServerId ? "Сохранить изменения" : "Сохранить сервер"}</button>
          </form>
          ) : (
            <p className="muted">У вас нет прав на создание или редактирование серверов.</p>
          )}
        </article>

        <article className="panel">
          <h2>Список серверов</h2>
          <div className="server-list">
            {servers.length === 0 ? <p className="muted">Серверов пока нет.</p> : null}
            {servers.map((server) => {
              const metric = metrics.find((item) => item.server_id === server.id);
              return (
                <article className="server-card" key={server.id}>
                  <div className="server-card-row">
                    <div>
                      <strong>{server.name}</strong>
                      <p>
                        {server.ip}:{server.port} · {server.login}
                      </p>
                    </div>
                    <span className={`status-pill ${metric?.online ? "online" : "offline"}`}>
                      {metric?.online ? "онлайн" : "офлайн"}
                    </span>
                  </div>
                  <p className="muted">{server.group_name ?? "Группа не назначена"}</p>
                  {metric ? (
                    <div className="server-metric-visuals">
                      <MetricRing label="CPU" value={metric.cpu_percent} tone="sky" />
                      <MetricRing label="RAM" value={metric.ram_percent} tone="mint" />
                      <MetricRing label="Disk" value={metric.disk_percent} tone="amber" />
                      <div className="metric-uptime">
                        <span className="muted">Uptime</span>
                        <strong>{metric.uptime}</strong>
                      </div>
                    </div>
                  ) : null}
                  {canEdit || canDelete ? (
                    <div className="card-actions">
                      {canEdit ? (
                        <button className="ghost" type="button" onClick={() => onEdit(server)}>
                          Редактировать
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button className="danger" type="button" onClick={() => onDelete(server.id)}>
                          Удалить
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}

function MetricRing({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "sky" | "mint" | "amber";
}) {
  const normalized = Math.max(0, Math.min(100, value));
  const style = {
    "--metric-value": normalized,
    "--metric-accent":
      tone === "sky" ? "#7cc8ff" : tone === "mint" ? "#6df7c1" : "#ffc56a"
  } as CSSProperties;

  return (
    <div className="metric-ring compact" style={style}>
      <div className="metric-ring-graphic">
        <div className="metric-ring-inner">
          <strong>{normalized}%</strong>
        </div>
      </div>
      <span>{label}</span>
    </div>
  );
}

export default ServersPage;
