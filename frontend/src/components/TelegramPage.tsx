import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api";
import type { NotificationSettings } from "../types";

type Props = {
  onError: (message: string) => void;
};

type FormState = {
  telegram_bot_token: string;
  telegram_chat_id: string;
  scheduler_enabled: boolean;
  scheduler_interval_seconds: number;
  alert_repeat_minutes: number;
  notify_login: boolean;
  notify_server_offline: boolean;
  notify_payment_expired: boolean;
  notify_payment_expiring: boolean;
  notify_automation_failed: boolean;
};

function TelegramPage({ onError }: Props) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Проверьте настройки и выберите, какие уведомления вам нужны.");

  async function loadSettings() {
    setLoading(true);
    onError("");
    try {
      const data = await api.notificationSettings();
      setSettings(data);
      setForm({
        telegram_bot_token: data.telegram_bot_token ?? "",
        telegram_chat_id: data.telegram_chat_id ?? "",
        scheduler_enabled: data.scheduler_enabled,
        scheduler_interval_seconds: data.scheduler_interval_seconds,
        alert_repeat_minutes: data.alert_repeat_minutes,
        notify_login: data.notify_login,
        notify_server_offline: data.notify_server_offline,
        notify_payment_expired: data.notify_payment_expired,
        notify_payment_expiring: data.notify_payment_expiring,
        notify_automation_failed: data.notify_automation_failed
      });
      setMessage(data.configured ? "Telegram настроен и готов к отправке." : "Укажите токен и chat id, чтобы включить Telegram.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось получить настройки уведомлений.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) {
      return;
    }
    onError("");
    try {
      const updated = await api.updateNotificationSettings({
        ...form,
        telegram_bot_token: form.telegram_bot_token || null,
        telegram_chat_id: form.telegram_chat_id || null
      });
      setSettings(updated);
      setMessage("Настройки уведомлений сохранены.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить настройки уведомлений.");
    }
  }

  async function handleTestSend() {
    onError("");
    try {
      const response = await api.sendTelegramTest();
      setMessage(response.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось отправить тестовое уведомление.");
    }
  }

  async function handleSendAlerts() {
    onError("");
    try {
      const response = await api.sendTelegramAlerts();
      setMessage(response.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось отправить алерты в Telegram.");
    }
  }

  if (!form) {
    return (
      <div className="page-stack">
        <section className="page-hero">
          <div>
            <p className="eyebrow">Telegram</p>
            <h1>Уведомления и планировщик</h1>
            <p className="hero-copy">{loading ? "Загружаю настройки..." : "Настройки пока недоступны."}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Telegram</p>
          <h1>Уведомления и планировщик</h1>
          <p className="hero-copy">
            Настройте Telegram, включите или выключите фоновые проверки и отметьте чекбоксами только нужные уведомления.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Подключение Telegram</h2>
            <span className="muted">{loading ? "Загрузка..." : "Готово"}</span>
          </div>
          <form className="form-grid" onSubmit={handleSave}>
            <label className="full-width">
              Bot Token
              <input
                value={form.telegram_bot_token}
                onChange={(event) => setForm({ ...form, telegram_bot_token: event.target.value })}
                placeholder="123456:ABC..."
              />
            </label>
            <label className="full-width">
              Chat ID
              <input
                value={form.telegram_chat_id}
                onChange={(event) => setForm({ ...form, telegram_chat_id: event.target.value })}
                placeholder="123456789"
              />
            </label>
            <label className="checkbox full-width">
              <input
                type="checkbox"
                checked={form.scheduler_enabled}
                onChange={(event) => setForm({ ...form, scheduler_enabled: event.target.checked })}
              />
              Включить фоновый планировщик алертов
            </label>
            <label>
              Интервал проверки, сек
              <input
                type="number"
                min="30"
                value={form.scheduler_interval_seconds}
                onChange={(event) => setForm({ ...form, scheduler_interval_seconds: Number(event.target.value) })}
              />
            </label>
            <label>
              Повтор алерта, мин
              <input
                type="number"
                min="5"
                value={form.alert_repeat_minutes}
                onChange={(event) => setForm({ ...form, alert_repeat_minutes: Number(event.target.value) })}
              />
            </label>

            <div className="full-width settings-checklist">
              <strong>Какие уведомления отправлять</strong>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.notify_login}
                  onChange={(event) => setForm({ ...form, notify_login: event.target.checked })}
                />
                Входы в панель
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.notify_server_offline}
                  onChange={(event) => setForm({ ...form, notify_server_offline: event.target.checked })}
                />
                Офлайн-серверы
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.notify_payment_expired}
                  onChange={(event) => setForm({ ...form, notify_payment_expired: event.target.checked })}
                />
                Просроченная оплата
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.notify_payment_expiring}
                  onChange={(event) => setForm({ ...form, notify_payment_expiring: event.target.checked })}
                />
                Оплата истекает скоро
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={form.notify_automation_failed}
                  onChange={(event) => setForm({ ...form, notify_automation_failed: event.target.checked })}
                />
                Ошибки автоматизации
              </label>
            </div>

            <button type="submit">Сохранить настройки</button>
          </form>
        </article>

        <article className="panel">
          <h2>Статус и действия</h2>
          <div className="result-card">
            <div className="server-card-row">
              <strong>Telegram Bot API</strong>
              <span className={`status-pill ${settings?.configured ? "online" : "offline"}`}>
                {settings?.configured ? "настроен" : "не настроен"}
              </span>
            </div>
            <p className="muted">CHAT_ID: {settings?.telegram_chat_id ?? "не указан"}</p>
            <p>{message}</p>
          </div>
          <div className="compact-form">
            <button type="button" onClick={() => void handleTestSend()}>
              Отправить тестовое сообщение
            </button>
            <button type="button" className="ghost" onClick={() => void handleSendAlerts()}>
              Отправить текущие алерты
            </button>
            <button type="button" className="ghost" onClick={() => void loadSettings()}>
              Обновить настройки
            </button>
          </div>
        </article>
      </section>
    </div>
  );
}

export default TelegramPage;
