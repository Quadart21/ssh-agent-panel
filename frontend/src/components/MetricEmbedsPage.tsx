import { useCallback, useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { MetricsEmbed, Server } from "../types";

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

type FormState = {
  title: string;
  server_ids: number[];
  theme: "dark" | "light";
};

const emptyForm: FormState = {
  title: "",
  server_ids: [],
  theme: "dark"
};

function MetricEmbedsPage({ servers, onError }: Props) {
  const [embeds, setEmbeds] = useState<MetricsEmbed[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [status, setStatus] = useState("Создайте виджет и вставьте iframe на сторонний сайт.");

  const editingEmbed = useMemo(() => embeds.find((item) => item.id === editingId) ?? null, [embeds, editingId]);

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
      theme: embed.theme
    });
    setStatus(`Редактирование: ${embed.title}`);
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
    setBusy(true);
    onError("");
    try {
      if (editingId) {
        await api.updateMetricEmbed(editingId, {
          title: form.title.trim(),
          server_ids: form.server_ids,
          theme: form.theme
        });
        setStatus("Виджет обновлён.");
      } else {
        await api.createMetricEmbed({
          title: form.title.trim(),
          server_ids: form.server_ids,
          theme: form.theme
        });
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

          <label>
            Тема
            <select
              value={form.theme}
              onChange={(event) => setForm((current) => ({ ...current, theme: event.target.value as "dark" | "light" }))}
            >
              <option value="dark">Тёмная</option>
              <option value="light">Светлая</option>
            </select>
          </label>

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
                        {embed.server_ids.length} сервер(ов) · {embed.theme === "dark" ? "тёмная" : "светлая"} тема
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
