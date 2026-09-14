import type { FormEvent } from "react";

import type { CloudflareDnsRecord, CloudflareDnsRecordForm, CloudflareSettings, CloudflareZone } from "../types";
import { EmptyState, PageHero, PageShell, PageToolbar, Panel } from "./ui";

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
  totalRecords: number;
  search: string;
  setSearch: (value: string) => void;
  recordType: string;
  setRecordType: (value: string) => void;
  onlySubdomains: boolean;
  setOnlySubdomains: (value: boolean) => void;
  recordForm: CloudflareDnsRecordForm;
  setRecordForm: (value: CloudflareDnsRecordForm) => void;
  editingRecordId: string | null;
  showSettings: boolean;
  setShowSettings: (value: boolean) => void;
  showRecordForm: boolean;
  onStartCreate: () => void;
  onSaveSettings: (event: FormEvent<HTMLFormElement>) => void;
  onTestConnection: () => void;
  onRefreshZones: () => void;
  onRefreshRecords: () => void;
  onSaveRecord: (event: FormEvent<HTMLFormElement>) => void;
  onEditRecord: (record: CloudflareDnsRecord) => void;
  onCancelEdit: () => void;
  onDeleteRecord: (recordId: string) => void;
  loadingBootstrap: boolean;
  loadingRecords: boolean;
  busy: boolean;
  statusMessage: string;
  canManage: boolean;
  isAdmin: boolean;
};

const recordTypes = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"];

function typeClass(type: string) {
  switch (type) {
    case "A":
    case "AAAA":
      return "dns-type dns-type-a";
    case "CNAME":
      return "dns-type dns-type-cname";
    case "TXT":
      return "dns-type dns-type-txt";
    case "MX":
      return "dns-type dns-type-mx";
    default:
      return "dns-type";
  }
}

function DomainsPage({
  settings,
  settingsForm,
  setSettingsForm,
  zones,
  selectedZoneId,
  setSelectedZoneId,
  selectedZone,
  records,
  totalRecords,
  search,
  setSearch,
  recordType,
  setRecordType,
  onlySubdomains,
  setOnlySubdomains,
  recordForm,
  setRecordForm,
  editingRecordId,
  showSettings,
  setShowSettings,
  showRecordForm,
  onStartCreate,
  onSaveSettings,
  onTestConnection,
  onRefreshZones,
  onRefreshRecords,
  onSaveRecord,
  onEditRecord,
  onCancelEdit,
  onDeleteRecord,
  loadingBootstrap,
  loadingRecords,
  busy,
  statusMessage,
  canManage,
  isAdmin
}: Props) {
  const subdomainCount = records.filter((record) => record.is_subdomain).length;
  const configured = Boolean(settings?.configured);

  return (
    <PageShell className="domains-page">
      <PageHero
        eyebrow="Инфраструктура"
        title="Домены"
        description="Зоны Cloudflare и DNS-записи — быстро, без лишних запросов."
        actions={
          <div className="domains-hero-actions">
            <span className={`status-pill ${configured ? "online" : "offline"}`}>
              {loadingBootstrap ? "загрузка…" : configured ? "Cloudflare OK" : "не настроен"}
            </span>
            {isAdmin ? (
              <button type="button" className="ghost" onClick={() => setShowSettings(!showSettings)}>
                {showSettings ? "Скрыть API" : "API"}
              </button>
            ) : null}
            <button type="button" className="ghost" onClick={onRefreshZones} disabled={loadingBootstrap || !configured}>
              {loadingBootstrap ? "Обновляем…" : "Обновить зоны"}
            </button>
          </div>
        }
      />

      {showSettings && isAdmin ? (
        <Panel
          className="domains-settings-panel"
          title="Cloudflare API"
          description="Token с Zone:Read и DNS:Edit. Account ID необязателен."
          actions={
            <button type="button" className="ghost" onClick={onTestConnection} disabled={busy || !configured}>
              Проверить
            </button>
          }
        >
          <form className="form-grid" onSubmit={onSaveSettings}>
            <label className="full-width">
              API Token
              <input
                value={settingsForm.api_token}
                onChange={(event) => setSettingsForm({ ...settingsForm, api_token: event.target.value })}
                placeholder={configured ? "Токен сохранён — оставьте пустым, чтобы не менять" : "Cloudflare API token"}
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
              <button type="submit" disabled={busy || loadingBootstrap}>
                Сохранить
              </button>
              <button type="button" className="ghost" onClick={() => setShowSettings(false)}>
                Закрыть
              </button>
            </div>
          </form>
          {statusMessage ? <p className="muted domains-status">{statusMessage}</p> : null}
        </Panel>
      ) : null}

      {!configured && !loadingBootstrap ? (
        <EmptyState
          title="Cloudflare не подключён"
          description={isAdmin ? "Откройте API и сохраните token, чтобы увидеть зоны и DNS." : "Попросите администратора настроить Cloudflare."}
        />
      ) : (
        <div className="domains-workspace">
          <aside className="domains-zone-rail panel">
            <div className="panel-head">
              <div>
                <h2>Зоны</h2>
                <p className="muted">{loadingBootstrap ? "Загрузка…" : `${zones.length} активных`}</p>
              </div>
            </div>
            {zones.length === 0 ? (
              <p className="muted domains-zone-empty">{loadingBootstrap ? "Тянем список зон…" : "Активных зон нет."}</p>
            ) : (
              <div className="domains-zone-list" role="listbox" aria-label="Список зон">
                {zones.map((zone) => {
                  const active = zone.id === selectedZoneId;
                  return (
                    <button
                      key={zone.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`domains-zone-item ${active ? "is-active" : ""}`}
                      onClick={() => setSelectedZoneId(zone.id)}
                    >
                      <span className="domains-zone-name">{zone.name}</span>
                      <span className="domains-zone-meta">
                        <span className={`status-dot ${zone.status === "active" && !zone.paused ? "online" : "offline"}`} />
                        {zone.paused ? "paused" : zone.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="domains-main">
            <section className="stats-grid domains-overview-stats">
              <article className="stat-card ice">
                <span>Зон</span>
                <strong>{zones.length}</strong>
              </article>
              <article className="stat-card sky">
                <span>Всего записей</span>
                <strong>{loadingRecords && totalRecords === 0 ? "…" : totalRecords}</strong>
              </article>
              <article className="stat-card mint">
                <span>Показано</span>
                <strong>{records.length}</strong>
              </article>
              <article className="stat-card amber">
                <span>Поддомены</span>
                <strong>{subdomainCount}</strong>
              </article>
            </section>

            <Panel
              className="domains-records-panel"
              title={selectedZone ? selectedZone.name : "DNS-записи"}
              description={
                selectedZone
                  ? loadingRecords
                    ? "Загружаем записи…"
                    : `${records.length} из ${totalRecords}${onlySubdomains ? " · только поддомены" : ""}`
                  : "Выберите зону слева"
              }
              actions={
                <div className="domains-panel-actions">
                  {selectedZone?.name_servers.slice(0, 1).map((ns) => (
                    <span className="server-chip muted-chip" key={ns}>
                      {ns}
                    </span>
                  ))}
                  <button type="button" className="ghost" onClick={onRefreshRecords} disabled={!selectedZoneId || loadingRecords}>
                    {loadingRecords ? "…" : "Обновить"}
                  </button>
                  {canManage && selectedZone ? (
                    <button type="button" onClick={onStartCreate} disabled={busy}>
                      + Запись
                    </button>
                  ) : null}
                </div>
              }
            >
              <PageToolbar
                className="domains-toolbar"
                meta={statusMessage && !showSettings ? statusMessage : undefined}
              >
                <label className="toolbar-search">
                  <span className="sr-only">Поиск</span>
                  <input
                    type="search"
                    placeholder="Фильтр: имя, IP, TXT…"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    disabled={!selectedZoneId}
                  />
                </label>
                <div className="domains-type-chips" role="group" aria-label="Тип записи">
                  <button
                    type="button"
                    className={`ghost domains-chip ${recordType === "" ? "is-active" : ""}`}
                    onClick={() => setRecordType("")}
                    disabled={!selectedZoneId}
                  >
                    Все
                  </button>
                  {recordTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={`ghost domains-chip ${recordType === type ? "is-active" : ""}`}
                      onClick={() => setRecordType(recordType === type ? "" : type)}
                      disabled={!selectedZoneId}
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <label className="checkbox domains-filter-checkbox">
                  <input
                    type="checkbox"
                    checked={onlySubdomains}
                    onChange={(event) => setOnlySubdomains(event.target.checked)}
                    disabled={!selectedZoneId}
                  />
                  Поддомены
                </label>
              </PageToolbar>

              {!selectedZoneId ? (
                <EmptyState title="Выберите зону" description="Кликните домен слева — записи подтянутся один раз и фильтруются локально." />
              ) : loadingRecords && totalRecords === 0 ? (
                <div className="domains-loading" aria-busy="true">
                  <div className="domains-skeleton-row" />
                  <div className="domains-skeleton-row" />
                  <div className="domains-skeleton-row" />
                  <div className="domains-skeleton-row" />
                </div>
              ) : records.length === 0 ? (
                <EmptyState title="Ничего не найдено" description="Сбросьте фильтры или добавьте новую DNS-запись." />
              ) : (
                <div className="domains-table-wrap">
                  <table className="domains-table">
                    <thead>
                      <tr>
                        <th>Имя</th>
                        <th>Тип</th>
                        <th>Содержимое</th>
                        <th>TTL</th>
                        <th>Proxy</th>
                        {canManage ? <th /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr key={record.id} className={record.is_subdomain ? "is-subdomain" : "is-apex"}>
                          <td>
                            <strong>{record.relative_name}</strong>
                            <div className="muted domain-record-fqdn">{record.name}</div>
                            {record.comment ? <div className="muted domain-record-comment">{record.comment}</div> : null}
                          </td>
                          <td>
                            <span className={typeClass(record.type)}>{record.type}</span>
                          </td>
                          <td>
                            <code>{record.content}</code>
                            {record.priority != null ? <span className="muted domain-priority"> · pri {record.priority}</span> : null}
                          </td>
                          <td>{record.ttl === 1 ? "auto" : record.ttl}</td>
                          <td>
                            {record.proxied == null ? (
                              "—"
                            ) : (
                              <span className={`proxy-pill ${record.proxied ? "on" : "off"}`}>
                                {record.proxied ? "proxied" : "dns only"}
                              </span>
                            )}
                          </td>
                          {canManage ? (
                            <td>
                              <div className="card-actions domains-row-actions">
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

            {canManage && selectedZone && showRecordForm ? (
              <Panel
                className="domains-editor-panel"
                title={editingRecordId ? "Редактировать запись" : "Новая DNS-запись"}
                description={
                  <>
                    Поддомен: <code>api</code> / <code>panel</code>. Apex: <code>@</code>. Зона — {selectedZone.name}.
                  </>
                }
                actions={
                  <button type="button" className="ghost" onClick={onCancelEdit}>
                    Отмена
                  </button>
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
                      placeholder={`api или @ для ${selectedZone.name}`}
                      required
                      autoFocus
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
                      Proxied через Cloudflare
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
                      {editingRecordId ? "Сохранить" : "Создать"}
                    </button>
                  </div>
                </form>
              </Panel>
            ) : null}
          </div>
        </div>
      )}
    </PageShell>
  );
}

export default DomainsPage;
