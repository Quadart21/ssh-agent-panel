import type { FormEvent } from "react";

import type { CloudflareDnsRecord, CloudflareDnsRecordForm, CloudflareSettings, CloudflareZone } from "../types";
import { EmptyState, PageHero, PageShell, Panel } from "./ui";

type SettingsForm = {
  api_token: string;
  account_id: string;
  default_ttl: string;
};

type Props = {
  settings: CloudflareSettings | null;
  settingsForm: SettingsForm;
  setSettingsForm: (value: SettingsForm) => void;
  zones: CloudflareZone[];
  selectedZoneId: string;
  setSelectedZoneId: (value: string) => void;
  selectedZone: CloudflareZone | null;
  records: CloudflareDnsRecord[];
  search: string;
  setSearch: (value: string) => void;
  recordType: string;
  setRecordType: (value: string) => void;
  onlySubdomains: boolean;
  setOnlySubdomains: (value: boolean) => void;
  recordForm: CloudflareDnsRecordForm;
  setRecordForm: (value: CloudflareDnsRecordForm) => void;
  editingRecordId: string | null;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onTestConnection: () => void;
  onRefreshZones: () => void;
  onRefreshRecords: () => void;
  onSaveRecord: (event: FormEvent<HTMLFormElement>) => void;
  onEditRecord: (record: CloudflareDnsRecord) => void;
  onCancelEdit: () => void;
  onDeleteRecord: (recordId: string) => void;
  loadingSettings: boolean;
  loadingZones: boolean;
  loadingRecords: boolean;
  busy: boolean;
  statusMessage: string;
  canManage: boolean;
  isAdmin: boolean;
};

const recordTypes = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"];

function DomainsPage({
  settings,
  settingsForm,
  setSettingsForm,
  zones,
  selectedZoneId,
  setSelectedZoneId,
  selectedZone,
  records,
  search,
  setSearch,
  recordType,
  setRecordType,
  onlySubdomains,
  setOnlySubdomains,
  recordForm,
  setRecordForm,
  editingRecordId,
  onSaveSettings,
  onTestConnection,
  onRefreshZones,
  onRefreshRecords,
  onSaveRecord,
  onEditRecord,
  onCancelEdit,
  onDeleteRecord,
  loadingSettings,
  loadingZones,
  loadingRecords,
  busy,
  statusMessage,
  canManage,
  isAdmin
}: Props) {
  const subdomainCount = records.filter((record) => record.is_subdomain).length;
  const apexCount = records.length - subdomainCount;

  return (
    <PageShell className="domains-page">
      <PageHero eyebrow="Инфраструктура" title="Домены" description="Зоны и DNS через Cloudflare API." />

      <section className="stats-grid domains-overview-stats">
        <article className="stat-card ice">
          <span>Зон</span>
          <strong>{zones.length}</strong>
        </article>
        <article className="stat-card sky">
          <span>DNS-записей</span>
          <strong>{records.length}</strong>
        </article>
        <article className="stat-card mint">
          <span>Поддоменов</span>
          <strong>{subdomainCount}</strong>
        </article>
        <article className="stat-card amber">
          <span>Apex-записей</span>
          <strong>{apexCount}</strong>
        </article>
      </section>

      <section className="dashboard-grid">
        {isAdmin ? (
          <Panel
            title="Cloudflare API"
            description="API token с правами Zone:Read и DNS:Edit. Account ID необязателен."
            actions={
              <span className={`status-pill ${settings?.configured ? "online" : "offline"}`}>
                {settings?.configured ? "настроен" : "не настроен"}
              </span>
            }
          >
            <form className="form-grid" onSubmit={onSaveSettings}>
              <label className="full-width">
                API Token
                <input
                  value={settingsForm.api_token}
                  onChange={(event) => setSettingsForm({ ...settingsForm, api_token: event.target.value })}
                  placeholder={settings?.configured ? "Токен сохранён — оставьте пустым, чтобы не менять" : "Cloudflare API token"}
                />
              </label>
              <label>
                Account ID
                <input
                  value={settingsForm.account_id}
                  onChange={(event) => setSettingsForm({ ...settingsForm, account_id: event.target.value })}
                  placeholder="Необязательно"
                />
              </label>
              <label>
                TTL по умолчанию
                <input
                  type="number"
                  min={1}
                  value={settingsForm.default_ttl}
                  onChange={(event) => setSettingsForm({ ...settingsForm, default_ttl: event.target.value })}
                />
              </label>
              <div className="full-width card-actions">
                <button type="submit" disabled={busy || loadingSettings}>
                  Сохранить
                </button>
                <button type="button" className="ghost" onClick={onTestConnection} disabled={busy || !settings?.configured}>
                  Проверить API
                </button>
              </div>
            </form>
            {statusMessage ? <p className="muted">{statusMessage}</p> : null}
          </Panel>
        ) : (
          <Panel title="Cloudflare API">
            <p className="muted">
              {settings?.configured
                ? "Cloudflare подключён. Настройки API доступны только администратору."
                : "Cloudflare ещё не настроен администратором."}
            </p>
            {statusMessage ? <p className="muted">{statusMessage}</p> : null}
          </Panel>
        )}

        <Panel
          title="Зона / домен"
          description="Выберите домен, чтобы увидеть DNS-записи и поддомены."
          actions={
            <button type="button" className="ghost" onClick={onRefreshZones} disabled={loadingZones || !settings?.configured}>
              {loadingZones ? "Обновляем…" : "Обновить зоны"}
            </button>
          }
        >
          {!settings?.configured ? (
            <p className="muted">Сначала настройте Cloudflare API token.</p>
          ) : zones.length === 0 ? (
            <p className="muted">{loadingZones ? "Загружаем зоны…" : "Активные зоны не найдены."}</p>
          ) : (
            <>
              <label>
                Домен
                <select value={selectedZoneId} onChange={(event) => setSelectedZoneId(event.target.value)}>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} · {zone.status}
                    </option>
                  ))}
                </select>
              </label>
              {selectedZone ? (
                <div className="domain-zone-meta">
                  <span className="server-chip">{selectedZone.type}</span>
                  <span className={`status-pill ${selectedZone.status === "active" ? "online" : "offline"}`}>
                    {selectedZone.status}
                  </span>
                  {selectedZone.paused ? <span className="server-chip muted-chip">paused</span> : null}
                  {selectedZone.name_servers.slice(0, 2).map((ns) => (
                    <span className="server-chip muted-chip" key={ns}>
                      {ns}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </Panel>
      </section>

      <Panel
        className="domains-records-panel"
        title={`DNS-записи${selectedZone ? ` · ${selectedZone.name}` : ""}`}
        description={
          loadingRecords
            ? "Загружаем записи…"
            : `Показано ${records.length} записей${onlySubdomains ? " (только поддомены)" : ""}.`
        }
        actions={
          <button type="button" className="ghost" onClick={onRefreshRecords} disabled={!selectedZoneId || loadingRecords}>
            Обновить записи
          </button>
        }
      >
        <div className="servers-toolbar domains-toolbar">
          <label className="toolbar-search">
            <span className="sr-only">Поиск</span>
            <input
              type="search"
              placeholder="Поиск по имени или содержимому…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!selectedZoneId}
            />
          </label>
          <label>
            Тип
            <select value={recordType} onChange={(event) => setRecordType(event.target.value)} disabled={!selectedZoneId}>
              <option value="">Все</option>
              {recordTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox domains-filter-checkbox">
            <input
              type="checkbox"
              checked={onlySubdomains}
              onChange={(event) => setOnlySubdomains(event.target.checked)}
              disabled={!selectedZoneId}
            />
            Только поддомены
          </label>
        </div>

        {!selectedZoneId ? (
          <EmptyState title="Выберите домен" description="После выбора зоны здесь появятся DNS-записи и поддомены." />
        ) : records.length === 0 && !loadingRecords ? (
          <EmptyState title="Записей не найдено" description="Измените фильтры или добавьте первую DNS-запись ниже." />
        ) : (
          <div className="accounting-table-wrap">
            <table className="accounting-table domains-table">
              <thead>
                <tr>
                  <th>Имя</th>
                  <th>Тип</th>
                  <th>Содержимое</th>
                  <th>TTL</th>
                  <th>Proxy</th>
                  <th>Комментарий</th>
                  {canManage ? <th>Действия</th> : null}
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id} className={record.is_subdomain ? "is-subdomain" : "is-apex"}>
                    <td>
                      <strong>{record.relative_name}</strong>
                      <div className="muted domain-record-fqdn">{record.name}</div>
                    </td>
                    <td>{record.type}</td>
                    <td>
                      <code>{record.content}</code>
                    </td>
                    <td>{record.ttl === 1 ? "auto" : record.ttl}</td>
                    <td>{record.proxied == null ? "—" : record.proxied ? "да" : "нет"}</td>
                    <td>{record.comment || "—"}</td>
                    {canManage ? (
                      <td>
                        <div className="card-actions">
                          <button type="button" className="ghost" onClick={() => onEditRecord(record)}>
                            Изменить
                          </button>
                          <button type="button" className="danger" onClick={() => onDeleteRecord(record.id)}>
                            Удалить
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {canManage && selectedZone ? (
        <Panel
          title={editingRecordId ? "Редактировать DNS-запись" : "Добавить поддомен / запись"}
          description={
            <>
              Для поддомена укажите только имя, например <code>api</code> или <code>panel</code>. Для apex используйте{" "}
              <code>@</code>.
            </>
          }
          actions={
            editingRecordId ? (
              <button type="button" className="ghost" onClick={onCancelEdit}>
                Отменить
              </button>
            ) : null
          }
        >
          <form className="form-grid" onSubmit={onSaveRecord}>
            <label>
              Тип
              <select value={recordForm.type} onChange={(event) => setRecordForm({ ...recordForm, type: event.target.value })}>
                {recordTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Имя
              <input
                value={recordForm.name}
                onChange={(event) => setRecordForm({ ...recordForm, name: event.target.value })}
                placeholder={selectedZone ? `api или @ для ${selectedZone.name}` : "api"}
                required
              />
            </label>
            <label className="full-width">
              Содержимое
              <input
                value={recordForm.content}
                onChange={(event) => setRecordForm({ ...recordForm, content: event.target.value })}
                placeholder="IP, CNAME, TXT…"
                required
              />
            </label>
            <label>
              TTL
              <input
                type="number"
                min={1}
                value={recordForm.ttl}
                onChange={(event) => setRecordForm({ ...recordForm, ttl: event.target.value })}
              />
            </label>
            {recordForm.type === "MX" ? (
              <label>
                Priority
                <input
                  type="number"
                  min={0}
                  value={recordForm.priority}
                  onChange={(event) => setRecordForm({ ...recordForm, priority: event.target.value })}
                />
              </label>
            ) : null}
            {["A", "AAAA", "CNAME"].includes(recordForm.type) ? (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={recordForm.proxied}
                  onChange={(event) => setRecordForm({ ...recordForm, proxied: event.target.checked })}
                />
                Проксировать через Cloudflare
              </label>
            ) : null}
            <label className="full-width">
              Комментарий
              <input
                value={recordForm.comment}
                onChange={(event) => setRecordForm({ ...recordForm, comment: event.target.value })}
                placeholder="Необязательно"
              />
            </label>
            <div className="full-width card-actions">
              <button type="submit" disabled={busy}>
                {editingRecordId ? "Сохранить изменения" : "Создать запись"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}
    </PageShell>
  );
}

export default DomainsPage;
