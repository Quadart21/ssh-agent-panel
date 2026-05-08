import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api";
import type { SecurityReport, Server } from "../types";

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

function SecurityPage({ servers, onError }: Props) {
  const [selectedServerId, setSelectedServerId] = useState("");
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Выберите сервер, чтобы посмотреть отчёт по безопасности.");
  const [kickUsername, setKickUsername] = useState("");
  const [unbanJail, setUnbanJail] = useState("");
  const [unbanIp, setUnbanIp] = useState("");

  useEffect(() => {
    if (!selectedServerId) {
      setReport(null);
      setStatus("Выберите сервер, чтобы посмотреть отчёт по безопасности.");
      return;
    }
    void loadReport(selectedServerId);
  }, [selectedServerId]);

  async function loadReport(serverId: string) {
    setLoading(true);
    setStatus("Собираю SSH-журналы и состояние fail2ban...");
    onError("");
    try {
      const data = await api.securityReport(Number(serverId));
      setReport(data);
      setStatus("Отчёт по безопасности обновлён.");
      if (!unbanJail && data.fail2ban_jails.length > 0) {
        setUnbanJail(data.fail2ban_jails[0].name);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось получить отчёт по безопасности.");
    } finally {
      setLoading(false);
    }
  }

  async function handleKickUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServerId) {
      onError("Сначала выберите сервер.");
      return;
    }
    onError("");
    try {
      const response = await api.kickUser(Number(selectedServerId), { username: kickUsername });
      setStatus(response.message);
      setKickUsername("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось завершить сессии пользователя.");
    }
  }

  async function handleUnban(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServerId) {
      onError("Сначала выберите сервер.");
      return;
    }
    onError("");
    try {
      const response = await api.unbanFail2BanIp(Number(selectedServerId), {
        jail: unbanJail,
        ip: unbanIp
      });
      setStatus(response.message);
      setUnbanIp("");
      await loadReport(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось снять бан с IP.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Безопасность</p>
          <h1>SSH-журналы и fail2ban</h1>
          <p className="hero-copy">
            Проверяйте свежие входы и ошибки, смотрите блокировки fail2ban и выполняйте базовые защитные действия прямо из панели.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Отчёт по серверу</h2>
            <select value={selectedServerId} onChange={(event) => setSelectedServerId(event.target.value)}>
              <option value="">Выберите сервер</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </div>
          <p className="muted">{status}</p>
          <div className="action-row">
            <button type="button" className="ghost" onClick={() => void loadReport(selectedServerId)} disabled={!selectedServerId}>
              Обновить отчёт
            </button>
          </div>

          {loading ? <p className="muted">Загрузка...</p> : null}

          {report ? (
            <div className="security-stack">
              <div className="mini-card">
                <strong>SSH-журнал</strong>
                <p className="muted">{report.auth_log_path ?? "Путь не найден"}</p>
                <pre>{report.auth_log_excerpt}</pre>
              </div>

              <div className="mini-card">
                <strong>lastb</strong>
                <p className="muted">Последние неудачные входы</p>
                <pre>{report.lastb_excerpt}</pre>
              </div>

              <div className="mini-card">
                <strong>Fail2Ban</strong>
                <p className="muted">Общий статус сервиса</p>
                <pre>{report.fail2ban_summary}</pre>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel">
          <h2>Действия безопасности</h2>

          <form className="compact-form" onSubmit={handleKickUser}>
            <label>
              Завершить сессии пользователя
              <input
                value={kickUsername}
                onChange={(event) => setKickUsername(event.target.value)}
                placeholder="Например deploy"
                required
              />
            </label>
            <button type="submit" className="danger">
              Кикнуть пользователя
            </button>
          </form>

          <form className="compact-form" onSubmit={handleUnban}>
            <label>
              Jail
              <select value={unbanJail} onChange={(event) => setUnbanJail(event.target.value)} required>
                <option value="">Выберите jail</option>
                {report?.fail2ban_jails.map((jail) => (
                  <option key={jail.name} value={jail.name}>
                    {jail.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              IP для разбана
              <input
                value={unbanIp}
                onChange={(event) => setUnbanIp(event.target.value)}
                placeholder="Например 1.2.3.4"
                required
              />
            </label>
            <button type="submit">Снять бан с IP</button>
          </form>

          <div className="result-stack">
            {report?.fail2ban_jails.length ? (
              report.fail2ban_jails.map((jail) => (
                <article className="result-card" key={jail.name}>
                  <div className="server-card-row">
                    <strong>{jail.name}</strong>
                    <span className={`status-pill ${jail.banned_count > 0 ? "offline" : "online"}`}>
                      Банoв: {jail.banned_count}
                    </span>
                  </div>
                  <pre>{jail.banned_ips.length ? jail.banned_ips.join("\n") : "Заблокированных IP нет."}</pre>
                </article>
              ))
            ) : (
              <p className="muted">Jail-список пока пуст или fail2ban не активен.</p>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

export default SecurityPage;
