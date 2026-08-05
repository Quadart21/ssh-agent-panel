import type { FormEvent } from "react";

import type { ConnectionTestResult, Group } from "../../types";
import type { ServerForm } from "./types";

type Props = {
  groups: Group[];
  form: ServerForm;
  setForm: (form: ServerForm) => void;
  connectionResult: ConnectionTestResult | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
  editingServerId: number | null;
  onCancelEdit: () => void;
  canCreate: boolean;
  canEdit: boolean;
};

function ServerFormPanel({
  groups,
  form,
  setForm,
  connectionResult,
  onSubmit,
  onTest,
  editingServerId,
  onCancelEdit,
  canCreate,
  canEdit
}: Props) {
  const canUseForm = canCreate || (editingServerId != null && canEdit);

  return (
    <article className="panel servers-form-panel">
      <div className="panel-head">
        <div>
          <h2>{editingServerId ? "Редактирование" : "Новый сервер"}</h2>
          <p className="muted">
            {editingServerId
              ? "Подключение, группа и оплата. Пустой пароль оставит текущий."
              : "SSH-доступ — после сохранения агент ставится автоматически."}
          </p>
        </div>
        <div className="panel-actions">
          {editingServerId && canEdit ? (
            <button type="button" className="ghost" onClick={onCancelEdit}>
              Отменить
            </button>
          ) : null}
          <button type="button" className="ghost" onClick={onTest} disabled={!canUseForm}>
            Проверить SSH
          </button>
        </div>
      </div>

      {connectionResult ? (
        <div className={`banner ${connectionResult.ok ? "success" : "error"}`}>
          {connectionResult.message}
          {connectionResult.latency_ms !== null ? ` Задержка: ${connectionResult.latency_ms} мс.` : ""}
        </div>
      ) : null}

      {canUseForm ? (
        <form className="form-sections" onSubmit={onSubmit}>
          <section className="form-section">
            <h3>Подключение</h3>
            <div className="form-grid">
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
                <input
                  value={form.login}
                  onChange={(event) => setForm({ ...form, login: event.target.value })}
                  required
                />
              </label>
              <label>
                Пароль
                <input
                  type="password"
                  value={form.password_enc}
                  onChange={(event) => setForm({ ...form, password_enc: event.target.value })}
                  placeholder={editingServerId ? "Оставьте пустым, чтобы не менять" : ""}
                />
              </label>
              <label>
                Путь к SSH-ключу
                <input value={form.key_path} onChange={(event) => setForm({ ...form, key_path: event.target.value })} />
              </label>
            </div>
          </section>

          <section className="form-section">
            <h3>Организация</h3>
            <div className="form-grid">
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
            </div>
          </section>

          <section className="form-section">
            <h3>Оплата и провайдер</h3>
            <div className="form-grid">
              <label>
                Оплачен до
                <input
                  type="datetime-local"
                  value={form.pay_until}
                  onChange={(event) => setForm({ ...form, pay_until: event.target.value })}
                />
              </label>
              <label>
                Стоимость тарифа
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="1500"
                  value={form.monthly_cost}
                  onChange={(event) => setForm({ ...form, monthly_cost: event.target.value })}
                />
              </label>
              <label>
                Период оплаты
                <select
                  value={form.billing_period}
                  onChange={(event) => setForm({ ...form, billing_period: event.target.value })}
                >
                  <option value="monthly">Ежемесячно</option>
                  <option value="quarterly">Ежеквартально</option>
                  <option value="yearly">Ежегодно</option>
                </select>
              </label>
              <label>
                Валюта
                <select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })}>
                  <option value="RUB">RUB</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
              <label>
                Провайдер / хостинг
                <input
                  value={form.provider}
                  onChange={(event) => setForm({ ...form, provider: event.target.value })}
                  placeholder="Hetzner, Selectel…"
                />
              </label>
              <label>
                Разовые затраты
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={form.setup_cost}
                  onChange={(event) => setForm({ ...form, setup_cost: event.target.value })}
                />
              </label>
            </div>
          </section>

          <section className="form-section">
            <h3>Дополнительно</h3>
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
              Проверять SSH при сохранении (агент установится автоматически, если указан пароль или ключ)
            </label>
            <div className="form-actions">
              <button type="submit">{editingServerId ? "Сохранить изменения" : "Добавить сервер"}</button>
            </div>
          </section>
        </form>
      ) : (
        <p className="muted">У вас нет прав на создание или редактирование серверов.</p>
      )}
    </article>
  );
}

export default ServerFormPanel;
