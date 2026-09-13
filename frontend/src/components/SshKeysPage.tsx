import { useEffect, useMemo, useState } from "react";

import { api } from "../api";
import type { ServerKeyBinding, ServerKeyBindingStatus, SshKeysOverview } from "../types";
import { PageHero, PageShell, Panel } from "./ui";

type Props = {
  canManage: boolean;
  onError: (message: string) => void;
};

const statusLabels: Record<ServerKeyBindingStatus, string> = {
  panel_bound: "Ключ панели",
  unbound: "Не привязан",
  outdated: "Устарел",
  individual: "Свой ключ",
  no_access: "Нет доступа"
};

const statusTone: Record<ServerKeyBindingStatus, string> = {
  panel_bound: "online",
  unbound: "offline",
  outdated: "offline",
  individual: "online",
  no_access: "offline"
};

function SshKeysPage({ canManage, onError }: Props) {
  const [overview, setOverview] = useState<SshKeysOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | ServerKeyBindingStatus>("all");
  const [removePassword, setRemovePassword] = useState(false);
  const [deployResults, setDeployResults] = useState<string[]>([]);

  async function loadOverview() {
    setLoading(true);
    onError("");
    try {
      const data = await api.sshKeysOverview();
      setOverview(data);
      setSelectedIds((current) => current.filter((id) => data.servers.some((server) => server.server_id === id)));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось загрузить SSH-ключи.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  const filteredServers = useMemo(() => {
    if (!overview) {
      return [];
    }
    if (statusFilter === "all") {
      return overview.servers;
    }
    return overview.servers.filter((server) => server.binding_status === statusFilter);
  }, [overview, statusFilter]);

  const selectableIds = useMemo(
    () => filteredServers.filter((server) => server.can_deploy).map((server) => server.server_id),
    [filteredServers]
  );

  function toggleServer(serverId: number) {
    setSelectedIds((current) =>
      current.includes(serverId) ? current.filter((id) => id !== serverId) : [...current, serverId]
    );
  }

  function toggleAllVisible() {
    const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !selectableIds.includes(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...selectableIds])));
  }

  async function handleGenerate() {
    if (
      overview?.panel_key?.configured &&
      !window.confirm("Сгенерировать новый ключ? Серверы со старым ключом получат статус «Устарел» до переустановки.")
    ) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      await api.generatePanelSshKey();
      await loadOverview();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось сгенерировать ключ.";
      onError(message);
      window.alert(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleExportPrivate() {
    setBusy(true);
    onError("");
    try {
      const data = await api.exportPanelSshPrivateKey();
      await navigator.clipboard.writeText(data.private_key);
      window.alert("Приватный ключ скопирован в буфер обмена.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось экспортировать ключ.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeploy(serverIds: number[]) {
    if (serverIds.length === 0) {
      onError("Выберите серверы для установки ключа.");
      return;
    }
    if (!overview?.panel_key?.configured) {
      onError("Сначала сгенерируйте ключ панели.");
      return;
    }
    setBusy(true);
    onError("");
    setDeployResults([]);
    try {
      const response = await api.deployPanelSshKey({ server_ids: serverIds, remove_password: removePassword });
      setDeployResults(response.results.map((item) => `${item.server_name}: ${item.ok ? "OK" : item.message}`));
      await loadOverview();
      setSelectedIds([]);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Не удалось установить ключ на серверы.");
    } finally {
      setBusy(false);
    }
  }

  function deployPreset(status: ServerKeyBindingStatus) {
    if (!overview) {
      return;
    }
    const ids = overview.servers.filter((server) => server.binding_status === status && server.can_deploy).map((s) => s.server_id);
    void handleDeploy(ids);
  }

  const panelKey = overview?.panel_key;
  const stats = overview?.stats ?? {};

  return (
    <PageShell className="ssh-keys-page">
      <PageHero eyebrow="Безопасность" title="SSH-ключи" description="Ключ панели и статус установки на серверах." />

      <section className="dashboard-kpi-row">
        <article className="dashboard-kpi-card mint">
          <span>Привязан</span>
          <strong>{stats.panel_bound ?? 0}</strong>
          <p className="muted">Ключ панели установлен</p>
        </article>
        <article className="dashboard-kpi-card amber">
          <span>Не привязан</span>
          <strong>{stats.unbound ?? 0}</strong>
          <p className="muted">Есть пароль, ключа нет</p>
        </article>
        <article className="dashboard-kpi-card rose">
          <span>Устарел</span>
          <strong>{stats.outdated ?? 0}</strong>
          <p className="muted">Нужна переустановка</p>
        </article>
        <article className="dashboard-kpi-card ice">
          <span>Свой ключ</span>
          <strong>{stats.individual ?? 0}</strong>
          <p className="muted">Индивидуальный ключ</p>
        </article>
      </section>

      <section className="dashboard-grid">
        <Panel className="ssh-keys-panel-key" title="Ключ панели" description={panelKey?.configured ? "Настроен" : "Не создан"}>
          {panelKey?.configured ? (
            <div className="ssh-keys-key-block">
              <p>
                <span className="muted">Fingerprint</span>
                <code>{panelKey.fingerprint}</code>
              </p>
              <p>
                <span className="muted">Public key</span>
                <code className="ssh-keys-public">{panelKey.public_key}</code>
              </p>
              {panelKey.updated_at ? (
                <p className="muted">Обновлён: {new Date(panelKey.updated_at).toLocaleString("ru-RU")}</p>
              ) : null}
            </div>
          ) : (
            <p className="muted">Ключ ещё не сгенерирован. Создайте его, затем установите на серверы.</p>
          )}
          {canManage ? (
            <div className="ssh-keys-actions">
              <button type="button" disabled={busy} onClick={() => void handleGenerate()}>
                {panelKey?.configured ? "Перегенерировать ключ" : "Сгенерировать ключ"}
              </button>
              {panelKey?.configured ? (
                <>
                  <button type="button" className="ghost" disabled={busy} onClick={() => void handleExportPrivate()}>
                    Скопировать приватный ключ
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => panelKey.public_key && void navigator.clipboard.writeText(panelKey.public_key)}
                  >
                    Скопировать public key
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <article className="panel">
          <h2>Массовая установка</h2>
          <label className="ssh-keys-checkbox">
            <input type="checkbox" checked={removePassword} onChange={(event) => setRemovePassword(event.target.checked)} />
            Удалить пароль из панели после успешной установки ключа
          </label>
          {canManage ? (
            <div className="ssh-keys-actions">
              <button type="button" disabled={busy || !panelKey?.configured} onClick={() => void handleDeploy(selectedIds)}>
                Установить на выбранные ({selectedIds.length})
              </button>
              <button type="button" className="ghost" disabled={busy || !panelKey?.configured} onClick={() => deployPreset("unbound")}>
                На все непривязанные
              </button>
              <button type="button" className="ghost" disabled={busy || !panelKey?.configured} onClick={() => deployPreset("outdated")}>
                Обновить устаревшие
              </button>
            </div>
          ) : (
            <p className="muted">Для установки ключа нужны права редактирования раздела.</p>
          )}
          {deployResults.length > 0 ? (
            <pre className="ssh-keys-deploy-log">{deployResults.join("\n")}</pre>
          ) : null}
        </article>
      </section>

      <article className="panel">
        <div className="panel-head">
          <h2>Серверы</h2>
          <span className="muted">{loading ? "Загрузка..." : `Всего: ${overview?.servers.length ?? 0}`}</span>
        </div>
        <div className="ssh-keys-toolbar">
          <label>
            Статус
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
              <option value="all">Все</option>
              <option value="panel_bound">Привязан</option>
              <option value="unbound">Не привязан</option>
              <option value="outdated">Устарел</option>
              <option value="individual">Свой ключ</option>
              <option value="no_access">Нет доступа</option>
            </select>
          </label>
          {canManage ? (
            <button type="button" className="ghost btn-sm" onClick={toggleAllVisible}>
              Выбрать доступные
            </button>
          ) : null}
        </div>

        <div className="ssh-keys-table-wrap">
          <table className="ssh-keys-table">
            <thead>
              <tr>
                {canManage ? <th /> : null}
                <th>Сервер</th>
                <th>SSH</th>
                <th>Группа</th>
                <th>Статус ключа</th>
                <th>Установлен</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {filteredServers.map((server) => (
                <ServerRow
                  key={server.server_id}
                  server={server}
                  canManage={canManage}
                  selected={selectedIds.includes(server.server_id)}
                  busy={busy}
                  onToggle={() => toggleServer(server.server_id)}
                  onDeploy={() => void handleDeploy([server.server_id])}
                />
              ))}
            </tbody>
          </table>
          {filteredServers.length === 0 ? <p className="muted">Нет серверов по выбранному фильтру.</p> : null}
        </div>
      </article>
    </PageShell>
  );
}

function ServerRow({
  server,
  canManage,
  selected,
  busy,
  onToggle,
  onDeploy
}: {
  server: ServerKeyBinding;
  canManage: boolean;
  selected: boolean;
  busy: boolean;
  onToggle: () => void;
  onDeploy: () => void;
}) {
  const status = server.binding_status as ServerKeyBindingStatus;
  return (
    <tr>
      {canManage ? (
        <td>
          <input type="checkbox" checked={selected} disabled={!server.can_deploy} onChange={onToggle} />
        </td>
      ) : null}
      <td>
        <strong>{server.server_name}</strong>
      </td>
      <td>
        {server.login}@{server.ip}:{server.port}
      </td>
      <td>{server.group_name ?? "—"}</td>
      <td>
        <span className={`status-pill ${statusTone[status] ?? "offline"}`}>{statusLabels[status] ?? status}</span>
      </td>
      <td className="muted">
        {server.panel_key_deployed_at ? new Date(server.panel_key_deployed_at).toLocaleString("ru-RU") : "—"}
      </td>
      {canManage ? (
        <td>
          <button type="button" className="ghost btn-sm" disabled={busy || !server.can_deploy} onClick={onDeploy}>
            Установить
          </button>
        </td>
      ) : null}
    </tr>
  );
}

export default SshKeysPage;
