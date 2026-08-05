import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api";
import type { NotificationSettings, TelegramWebhookInfo } from "../types";
import { PageHero, PageShell } from "./ui";

type Props = {
  onError: (message: string) => void;
};

type FormState = {
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_topic_general: string;
  telegram_topic_login: string;
  telegram_topic_servers: string;
  telegram_topic_payments: string;
  telegram_topic_automation: string;
  scheduler_enabled: boolean;
  scheduler_interval_seconds: number;
  alert_repeat_minutes: number;
  notify_login: boolean;
  notify_server_offline: boolean;
  notify_payment_expired: boolean;
  notify_payment_expiring: boolean;
  notify_automation_failed: boolean;
};

const testNotificationKinds = [
  { key: "login", label: "Тест: вход в панель" },
  { key: "server_offline", label: "Тест: офлайн-сервер" },
  { key: "server_online", label: "Тест: сервер восстановлен" },
  { key: "payment_expired", label: "Тест: просроченная оплата" },
  { key: "payment_expiring", label: "Тест: оплата истекает" },
  { key: "automation_failed", label: "Тест: ошибка автоматизации" },
  { key: "digest", label: "Тест: сводка алертов" }
] as const;

function TelegramPage({ onError }: Props) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<TelegramWebhookInfo | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("Проверьте настройки и выберите, какие уведомления вам нужны.");

  async function loadSettings() {
    setLoading(true);
    onError("");
    try {
      const data = await api.notificationSettings();
      setSettings(data);
      try {
        const webhook = await api.telegramWebhookInfo();
        setWebhookInfo(webhook);
      } catch {
        setWebhookInfo(null);
      }
      setForm({
        telegram_bot_token: data.telegram_bot_token ?? "",
        telegram_chat_id: data.telegram_chat_id ?? "",
        telegram_topic_general: data.telegram_topic_general ? String(data.telegram_topic_general) : "",
        telegram_topic_login: data.telegram_topic_login ? String(data.telegram_topic_login) : "",
        telegram_topic_servers: data.telegram_topic_servers ? String(data.telegram_topic_servers) : "",
        telegram_topic_payments: data.telegram_topic_payments ? String(data.telegram_topic_payments) : "",
        telegram_topic_automation: data.telegram_topic_automation ? String(data.telegram_topic_automation) : "",
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
        telegram_chat_id: form.telegram_chat_id || null,
        telegram_topic_general: form.telegram_topic_general.trim() ? Number(form.telegram_topic_general) : null,
        telegram_topic_login: form.telegram_topic_login.trim() ? Number(form.telegram_topic_login) : null,
        telegram_topic_servers: form.telegram_topic_servers.trim() ? Number(form.telegram_topic_servers) : null,
        telegram_topic_payments: form.telegram_topic_payments.trim() ? Number(form.telegram_topic_payments) : null,
        telegram_topic_automation: form.telegram_topic_automation.trim() ? Number(form.telegram_topic_automation) : null
      });
      setSettings(updated);
      setMessage("Настройки уведомлений сохранены.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить настройки уведомлений.");
    }
  }

  async function handleTestSend() {
    onError("");
    setSending(true);
    try {
      const response = await api.sendTelegramTest();
      setMessage(response.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось отправить тестовое уведомление.");
    } finally {
      setSending(false);
    }
  }

  async function handleTestTypedSend(kind: string, label: string) {
    onError("");
    setSending(true);
    try {
      const response = await api.sendTelegramTypedTest(kind);
      setMessage(`${label}: ${response.message}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : `Не удалось отправить уведомление '${label}'.`);
    } finally {
      setSending(false);
    }
  }

  async function handleRegisterWebhook() {
    onError("");
    setSending(true);
    try {
      const response = await api.registerTelegramWebhook();
      setMessage(response.message);
      const webhook = await api.telegramWebhookInfo();
      setWebhookInfo(webhook);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось зарегистрировать webhook.");
    } finally {
      setSending(false);
    }
  }

  async function handleUnregisterWebhook() {
    onError("");
    setSending(true);
    try {
      const response = await api.unregisterTelegramWebhook();
      setMessage(response.message);
      const webhook = await api.telegramWebhookInfo();
      setWebhookInfo(webhook);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить webhook.");
    } finally {
      setSending(false);
    }
  }

  async function handleSendAlerts() {
    onError("");
    setSending(true);
    try {
      const response = await api.sendTelegramAlerts();
      setMessage(response.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось отправить алерты в Telegram.");
    } finally {
      setSending(false);
    }
  }

  if (!form) {
    return (
      <PageShell>
        <PageHero
          eyebrow="Telegram"
          title="Telegram"
          description={loading ? "Загружаю настройки…" : "Настройки пока недоступны."}
        />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHero eyebrow="Telegram" title="Telegram" description="Бот, планировщик и типы уведомлений." />

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Подключение</h2>
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
            <div className="full-width settings-checklist">
              <strong>Топики Telegram (message_thread_id)</strong>
              <p className="muted">
                Если чат с топиками, укажи ID нужного топика для каждого типа уведомлений. Пусто = общий чат/дефолт.
              </p>
              <label>
                Общий топик (fallback)
                <input
                  type="number"
                  min="1"
                  value={form.telegram_topic_general}
                  onChange={(event) => setForm({ ...form, telegram_topic_general: event.target.value })}
                  placeholder="Например: 12"
                />
              </label>
              <label>
                Топик: входы в панель
                <input
                  type="number"
                  min="1"
                  value={form.telegram_topic_login}
                  onChange={(event) => setForm({ ...form, telegram_topic_login: event.target.value })}
                  placeholder="Например: 21"
                />
              </label>
              <label>
                Топик: серверные алерты
                <input
                  type="number"
                  min="1"
                  value={form.telegram_topic_servers}
                  onChange={(event) => setForm({ ...form, telegram_topic_servers: event.target.value })}
                  placeholder="Например: 22"
                />
              </label>
              <label>
                Топик: платежи
                <input
                  type="number"
                  min="1"
                  value={form.telegram_topic_payments}
                  onChange={(event) => setForm({ ...form, telegram_topic_payments: event.target.value })}
                  placeholder="Например: 23"
                />
              </label>
              <label>
                Топик: автоматизация
                <input
                  type="number"
                  min="1"
                  value={form.telegram_topic_automation}
                  onChange={(event) => setForm({ ...form, telegram_topic_automation: event.target.value })}
                  placeholder="Например: 24"
                />
              </label>
            </div>
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
          <div className="result-card">
            <div className="server-card-row">
              <strong>Webhook для кнопки «Оплатил»</strong>
              <span className={`status-pill ${webhookInfo?.webhook_active ? "online" : "offline"}`}>
                {webhookInfo?.webhook_active ? "активен" : "не активен"}
              </span>
            </div>
            <p className="muted">
              Уведомления об оплате: за 7 дней, за 3 дня, затем 3 дня просрочки с кнопкой «Оплатил». После 3 дней
              просрочки сервер удаляется из панели.
            </p>
            {webhookInfo?.webhook_url ? <p className="muted">URL: {webhookInfo.webhook_url}</p> : null}
          </div>
          <div className="compact-form">
            <button type="button" onClick={() => void handleRegisterWebhook()} disabled={sending}>
              Зарегистрировать webhook
            </button>
            <button type="button" className="ghost" onClick={() => void handleUnregisterWebhook()} disabled={sending}>
              Удалить webhook
            </button>
            <button type="button" onClick={() => void handleTestSend()} disabled={sending}>
              Отправить тестовое сообщение
            </button>
            {testNotificationKinds.map((item) => (
              <button
                key={item.key}
                type="button"
                className="ghost"
                onClick={() => void handleTestTypedSend(item.key, item.label)}
                disabled={sending}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className="ghost" onClick={() => void handleSendAlerts()} disabled={sending}>
              Отправить текущие алерты
            </button>
            <button type="button" className="ghost" onClick={() => void loadSettings()} disabled={sending}>
              Обновить настройки
            </button>
          </div>
        </article>
      </section>
    </PageShell>
  );
}

export default TelegramPage;
