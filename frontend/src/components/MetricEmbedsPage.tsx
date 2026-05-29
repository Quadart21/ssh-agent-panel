import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { api } from "../api";
import {
  METRIC_EMBED_THEMES,
  metricEmbedDefaultAccent,
  metricEmbedThemeLabel,
  normalizeAccentColor
} from "./metricEmbeds/config";
import type { MetricEmbedTheme, MetricsEmbed, Server } from "../types";

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

type FormState = {
  title: string;
  server_ids: number[];
  theme: MetricEmbedTheme;
  accent_color: string;
};

const emptyForm: FormState = {
  title: "",
  server_ids: [],
  theme: "dark",
  accent_color: ""
};

function MetricEmbedsPage({ servers, onError }: Props) {
  const [embeds, setEmbeds] = useState<MetricsEmbed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState("Создайте виджет и вставьте iframe на сторонний сайт.");

  const editingEmbed = useMemo(() => embeds.find((item) => item.id === editingId) ?? null, [embeds, editingId]);
  const previewAccent = form.accent_color.trim() || metricEmbedDefaultAccent(form.theme);
  const previewStyle = {
    "--embed-accent-override": previewAccent,
    "--embed-accent-soft": `color-mix(in srgb, ${previewAccent} 18%, transparent)`
  } as CSSProperties;

  const loadEmbeds = useCallback(async () => {
    setLoading(true);
    onError("");
    try {
      const data = await api.listMetricEmbeds();
      setEmbeds(data);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить виджеты.");
      setEmbeds([]);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void loadEmbeds();
  }, [loadEmbeds]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function toggleServer(serverId: number) {
    setForm((current) => ({
      ...current,
      server_ids: current.server_ids.includes(serverId)
        ? current.server_ids.filter((id) => id !== serverId)
        : [...current.server_ids, serverId]
    }));
  }

  function startEdit(embed: MetricsEmbed) {
    setEditingId(embed.id);
    setForm({
      title: embed.title,
      server_ids: [...embed.server_ids],
      theme: embed.theme,
      accent_color: embed.accent_color ?? ""
    });
    setStatus(`Редактирование: ${embed.title}`);
  }

  function buildPayload() {
    const accent = normalizeAccentColor(form.accent_color);
    return {
      title: form.title.trim(),
      server_ids: form.server_ids,
      theme: form.theme,
      accent_color: accent || null
    };
  }

  async function handleSubmit() {
    if (!form.title.trim()) {
      onError("Укажите название виджета.");
      return;
    }
    if (!form.server_ids.length) {
      onError("Выберите хотя бы один сервер.");
      return;
    }
    if (form.accent_color.trim() && !normalizeAccentColor(form.accent_color)) {
      onError("Цвет акцента укажите в формате #RRGGBB.");
      return;
    }
    setBusy(true);
    onError("");
    try {
      const payload = buildPayload();
      if (editingId) {
        await api.updateMetricEmbed(editingId, payload);
        setStatus("Виджет обновлён.");
      } else {
        await api.createMetricEmbed(payload);
        setStatus("Виджет создан. Скопируйте iframe-код ниже.");
      }
      resetForm();
      await loadEmbeds();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось сохранить виджет.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Удалить виджет? Ссылка перестанет работать.")) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      await api.deleteMetricEmbed(id);
      if (editingId === id) {
        resetForm();
      }
      setStatus("Виджет удалён.");
      await loadEmbeds();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось удалить виджет.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRotateToken(id: number) {
    setBusy(true);
    onError("");
    try {
      await api.rotateMetricEmbedToken(id);
      setStatus("Токен обновлён. Старые ссылки больше не работают.");
      await loadEmbeds();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось обновить токен.");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEnabled(embed: MetricsEmbed) {
    setBusy(true);
    onError("");
    try {
      await api.updateMetricEmbed(embed.id, { enabled: !embed.enabled });
      await loadEmbeds();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось изменить статус виджета.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(value: string, message: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(message);
    } catch {
      onError("Не удалось скопировать в буфер обмена.");
    }
  }

  return (
    <div className="page-stack metric-embeds-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Виджеты</p>
          <h1>Встраивание метрик</h1>
          <p className="hero-copy">
            Создайте публичный виджет с CPU, RAM и Disk для выбранных серверов и вставьте его на любой сайт через iframe.
            IP-адреса и учётные данные не передаются.
          </p>
        </div>
      </section>

      <section className="dashboard-grid metric-embeds-layout">
        <article className="panel">
          <div className="panel-head">
            <h2>{editingEmbed ? "Редактировать виджет" : "Новый виджет"}</h2>
            {editingEmbed ? (
              <button type="button" className="ghost" onClick={resetForm}>
                Отмена
              </button>
            ) : null}
          </div>

          <label>
            Название
            <input
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Например: Статус продакшн-серверов"
            />
          </label>

          <div className="metric-embeds-theme-picker">
            <strong>Оформление</strong>
            <div className="metric-embeds-theme-grid">
              {METRIC_EMBED_THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={`metric-embeds-theme-option theme-${theme.id}${form.theme === theme.id ? " active" : ""}`}
                  onClick={() => setForm((current) => ({ ...current, theme: theme.id }))}
                >
                  <span className="metric-embeds-theme-swatch" style={{ background: theme.defaultAccent }} />
                  <span>{theme.label}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="metric-embeds-color-field">
            Цвет акцента
            <div className="metric-embeds-color-row">
              <input
                type="color"
                value={normalizeAccentColor(form.accent_color) || metricEmbedDefaultAccent(form.theme)}
                onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))}
                aria-label="Выбор цвета акцента"
              />
              <input
                value={form.accent_color}
                onChange={(event) => setForm((current) => ({ ...current, accent_color: event.target.value }))}
                placeholder={metricEmbedDefaultAccent(form.theme)}
              />
              <button
                type="button"
                className="ghost"
                onClick={() => setForm((current) => ({ ...current, accent_color: "" }))}
              >
                По умолчанию
              </button>
            </div>
            <span className="muted">Используется для колец CPU/RAM/Disk и статуса online. Пустое значение — цвет темы.</span>
          </label>

          <div className={`metric-embeds-preview metrics-embed-widget theme-${form.theme}`} style={previewStyle}>
            <div className="metric-embeds-preview-card">
              <div className="metrics-embed-card-head">
                <strong>{form.title.trim() || "Пример сервера"}</strong>
                <span className="status-pill online">online</span>
              </div>
              <div className="metric-embeds-preview-rings">
                <span style={{ color: previewAccent }}>CPU 42%</span>
                <span style={{ color: previewAccent }}>RAM 61%</span>
                <span style={{ color: previewAccent }}>Disk 28%</span>
              </div>
            </div>
          </div>

          <div className="metric-embeds-server-picker">
            <strong>Серверы в виджете</strong>
            <div className="metric-embeds-server-list">
              {servers.map((server) => (
                <label key={server.id} className="metric-embeds-server-option">
                  <input
                    type="checkbox"
                    checked={form.server_ids.includes(server.id)}
                    onChange={() => toggleServer(server.id)}
                  />
                  <span>
                    {server.name} · {server.ip}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="metric-embeds-actions">
            <button type="button" disabled={busy} onClick={() => void handleSubmit()}>
              {busy ? "Сохранение…" : editingEmbed ? "Сохранить" : "Создать виджет"}
            </button>
            <p className="muted">{status}</p>
          </div>
        </article>

        <article className="panel">
          <div className="panel-head">
            <h2>Готовые виджеты</h2>
            <span className="muted">{loading ? "Загрузка…" : `${embeds.length} шт.`}</span>
          </div>

          {embeds.length ? (
            <div className="metric-embeds-list">
              {embeds.map((embed) => (
                <section key={embed.id} className="metric-embeds-item">
                  <div className="metric-embeds-item-head">
                    <div>
                      <strong>{embed.title}</strong>
                      <p className="muted">
                        {embed.server_ids.length} сервер(ов) · {metricEmbedThemeLabel(embed.theme)}
                        {embed.accent_color ? ` · акцент ${embed.accent_color}` : ""}
                      </p>
                    </div>
                    <span className={`status-pill ${embed.enabled ? "online" : "offline"}`}>
                      {embed.enabled ? "активен" : "выключен"}
                    </span>
                  </div>

                  <label>
                    Ссылка для iframe
                    <div className="metric-embeds-copy-row">
                      <input value={embed.embed_url} readOnly />
                      <button type="button" className="ghost" onClick={() => void copyText(embed.embed_url, "Ссылка скопирована.")}>
                        URL
                      </button>
                    </div>
                  </label>

                  <label>
                    Код для вставки
                    <textarea value={embed.iframe_code} readOnly rows={3} />
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void copyText(embed.iframe_code, "iframe-код скопирован.")}
                    >
                      Скопировать iframe
                    </button>
                  </label>

                  <div className="card-actions">
                    <a className="ghost button-link" href={embed.embed_url} target="_blank" rel="noreferrer">
                      Открыть
                    </a>
                    <button type="button" className="ghost" disabled={busy} onClick={() => startEdit(embed)}>
                      Редактировать
                    </button>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void handleToggleEnabled(embed)}>
                      {embed.enabled ? "Выключить" : "Включить"}
                    </button>
                    <button type="button" className="ghost" disabled={busy} onClick={() => void handleRotateToken(embed.id)}>
                      Новый токен
                    </button>
                    <button type="button" className="danger" disabled={busy} onClick={() => void handleDelete(embed.id)}>
                      Удалить
                    </button>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <p className="muted">Виджетов пока нет.</p>
          )}
        </article>
      </section>
    </div>
  );
}

export default MetricEmbedsPage;
