import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../api";
import type { FirewallStatus, Server } from "../types";

type RuleForm = {
  action: "allow" | "deny" | "delete";
  port: string;
  protocol: "tcp" | "udp";
  source: string;
};

type Props = {
  servers: Server[];
  onError: (message: string) => void;
};

const emptyRuleForm: RuleForm = {
  action: "allow",
  port: "22",
  protocol: "tcp",
  source: ""
};

function FirewallPage({ servers, onError }: Props) {
  const [selectedServerId, setSelectedServerId] = useState("");
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Выберите сервер, чтобы посмотреть правила UFW.");

  useEffect(() => {
    if (!selectedServerId) {
      setFirewall(null);
      setStatus("Выберите сервер, чтобы посмотреть правила UFW.");
      return;
    }
    void loadFirewallStatus(selectedServerId);
  }, [selectedServerId]);

  async function loadFirewallStatus(serverId: string) {
    setLoading(true);
    setStatus("Загружаю правила firewall...");
    onError("");
    try {
      const data = await api.firewallStatus(Number(serverId));
      setFirewall(data);
      setStatus(data.enabled ? "UFW активен." : "UFW выключен.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось получить состояние firewall.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(enabled: boolean) {
    if (!selectedServerId) {
      onError("Сначала выберите сервер для работы с firewall.");
      return;
    }
    onError("");
    try {
      const response = await api.toggleFirewall(Number(selectedServerId), { enabled });
      setStatus(response.message);
      await loadFirewallStatus(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось изменить состояние firewall.");
    }
  }

  async function handleApplyRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedServerId) {
      onError("Сначала выберите сервер для работы с firewall.");
      return;
    }
    onError("");
    try {
      const response = await api.applyFirewallRule(Number(selectedServerId), {
        action: ruleForm.action,
        port: Number(ruleForm.port),
        protocol: ruleForm.protocol,
        source: ruleForm.source || null
      });
      setStatus(response.message);
      await loadFirewallStatus(selectedServerId);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось применить правило firewall.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Firewall</p>
          <h1>Управление UFW и портами</h1>
          <p className="hero-copy">
            Включайте и выключайте UFW, открывайте или закрывайте порты и просматривайте активные правила на сервере.
          </p>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-head">
            <h2>Состояние firewall</h2>
            <select value={selectedServerId} onChange={(event) => setSelectedServerId(event.target.value)}>
              <option value="">Выберите сервер</option>
              {servers.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.name}
                </option>
              ))}
            </select>
          </div>
          <div className="server-card-row">
            <p className="muted">{status}</p>
            {firewall ? (
              <span className={`status-pill ${firewall.enabled ? "online" : "offline"}`}>
                {firewall.enabled ? "включён" : "выключен"}
              </span>
            ) : null}
          </div>
          <div className="action-row">
            <button type="button" onClick={() => void handleToggle(true)}>
              Включить UFW
            </button>
            <button type="button" className="ghost" onClick={() => void loadFirewallStatus(selectedServerId)} disabled={!selectedServerId}>
              Обновить
            </button>
            <button type="button" className="danger" onClick={() => void handleToggle(false)}>
              Выключить UFW
            </button>
          </div>

          <div className="result-stack firewall-rules">
            {loading ? <p className="muted">Загрузка...</p> : null}
            {!loading && firewall && firewall.rules.length === 0 ? <p className="muted">Активных правил не найдено.</p> : null}
            {firewall?.rules.map((rule, index) => (
              <article className="mini-card" key={`${rule.index ?? "raw"}-${index}`}>
                <div className="server-card-row">
                  <strong>{rule.index ? `Правило #${rule.index}` : "Правило"}</strong>
                </div>
                <code>{rule.rule}</code>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <h2>Применить правило</h2>
          <form className="form-grid" onSubmit={handleApplyRule}>
            <label>
              Действие
              <select
                value={ruleForm.action}
                onChange={(event) => setRuleForm({ ...ruleForm, action: event.target.value as RuleForm["action"] })}
              >
                <option value="allow">Открыть порт</option>
                <option value="deny">Запретить порт</option>
                <option value="delete">Удалить allow-правило</option>
              </select>
            </label>
            <label>
              Порт
              <input
                type="number"
                min="1"
                max="65535"
                value={ruleForm.port}
                onChange={(event) => setRuleForm({ ...ruleForm, port: event.target.value })}
                required
              />
            </label>
            <label>
              Протокол
              <select
                value={ruleForm.protocol}
                onChange={(event) => setRuleForm({ ...ruleForm, protocol: event.target.value as RuleForm["protocol"] })}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </label>
            <label>
              Источник
              <input
                value={ruleForm.source}
                onChange={(event) => setRuleForm({ ...ruleForm, source: event.target.value })}
                placeholder="Например 1.2.3.4 или 10.0.0.0/24"
              />
            </label>
            <button type="submit">Применить правило</button>
          </form>

          {firewall ? (
            <div className="firewall-raw">
              <h3>Сырой вывод UFW</h3>
              <pre>{firewall.raw_output}</pre>
            </div>
          ) : null}
        </article>
      </section>
    </div>
  );
}

export default FirewallPage;
