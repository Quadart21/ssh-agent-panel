import { useEffect, useState } from "react";

import { api } from "../api";
import type { UserSession } from "../types";

type Props = {
  onError: (message: string) => void;
};

function SessionsPage({ onError }: Props) {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [message, setMessage] = useState("Здесь можно управлять активными входами в панель.");

  async function loadSessions() {
    onError("");
    try {
      setSessions(await api.listSessions());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить список сессий.");
    }
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  async function handleLogoutAll() {
    onError("");
    try {
      const response = await api.logoutAllSessions();
      setMessage(response.message);
      await loadSessions();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось завершить прочие сессии.");
    }
  }

  async function handleRevoke(sessionId: number) {
    onError("");
    try {
      const response = await api.revokeSession(sessionId);
      setMessage(response.message);
      await loadSessions();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось завершить выбранную сессию.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Сессии</p>
          <h1>Контроль входов в панель</h1>
          <p className="hero-copy">{message}</p>
        </div>
      </section>

      <article className="panel">
        <div className="panel-head">
          <h2>Текущие сессии</h2>
          <button type="button" className="ghost" onClick={() => void handleLogoutAll()}>
            Завершить все прочие
          </button>
        </div>
        <div className="result-stack">
          {sessions.length === 0 ? <p className="muted">Активных сессий не найдено.</p> : null}
          {sessions.map((session) => (
            <article className="result-card" key={session.id}>
              <div className="server-card-row">
                <strong>{session.is_current ? "Текущая сессия" : `Сессия #${session.id}`}</strong>
                <span className={`status-pill ${session.revoked_at ? "offline" : "online"}`}>
                  {session.revoked_at ? "завершена" : "активна"}
                </span>
              </div>
              <p className="muted">IP: {session.ip_address || "неизвестно"}</p>
              <p className="muted">User-Agent: {session.user_agent || "неизвестно"}</p>
              <p className="muted">Создана: {formatDate(session.created_at)}</p>
              <p className="muted">Последняя активность: {formatDate(session.last_seen_at)}</p>
              <p className="muted">Истекает: {formatDate(session.expires_at)}</p>
              {!session.is_current && !session.revoked_at ? (
                <button type="button" className="danger" onClick={() => void handleRevoke(session.id)}>
                  Завершить эту сессию
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </article>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}

export default SessionsPage;
