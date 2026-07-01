import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import type { ConnectionTestResult, Group, Server, ServerAccountingSummary, ServerMetricSnapshot } from "../types";
import ServersAccountingPanel from "./ServersAccountingPanel";
import ServerCard from "./servers/ServerCard";
import ServerFormPanel from "./servers/ServerFormPanel";
import ServersBulkPanel from "./servers/ServersBulkPanel";
import type { ServerQuickPatch } from "./servers/ServerQuickFields";
import { computeFleetStats, filterServers } from "./servers/helpers";
import ServersOverviewStats from "./servers/ServersOverviewStats";
import type { FleetFilters, ServerForm, ServerViewTab } from "./servers/types";

type Props = {
  groups: Group[];
  servers: Server[];
  metrics: ServerMetricSnapshot[];
  accounting: ServerAccountingSummary | null;
  accountingLoading: boolean;
  form: ServerForm;
  setForm: (form: ServerForm) => void;
  connectionResult: ConnectionTestResult | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTest: () => void;
  editingServerId: number | null;
  onEdit: (server: Server) => void;
  onCancelEdit: () => void;
  onDelete: (id: number) => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canEnrollAgent: boolean;
  onEnrollAgent: (id: number) => void;
  onReinstallAllAgents: () => void;
  agentsReinstallingAll: boolean;
  onQuickUpdateServer: (serverId: number, patch: ServerQuickPatch) => Promise<void>;
  quickSavingServerId: number | null;
  onConvertToKey?: (serverId: number) => Promise<void>;
  convertingToKeyServerId: number | null;
  onRefreshAllMetrics: () => void;
  onRefreshServerMetrics: (id: number) => void;
  onExportFilezilla: () => void;
  filezillaExporting: boolean;
  metricsRefreshingAll: boolean;
  refreshingMetricServerId: number | null;
  bulkInput: string;
  setBulkInput: (value: string) => void;
  bulkGroupId: string;
  setBulkGroupId: (value: string) => void;
  onBulkCreate: () => void;
  bulkStatus: string;
  bulkBusy: boolean;
  onImportFilezilla: (file: File) => void;
  filezillaImporting: boolean;
};

const defaultFilters: FleetFilters = {
  query: "",
  groupId: "",
  status: "all",
  agent: "all"
};

const tabs: { id: ServerViewTab; label: string; hint: string }[] = [
  { id: "fleet", label: "Парк серверов", hint: "Список, фильтры и метрики" },
  { id: "form", label: "Добавить узел", hint: "Один сервер с проверкой SSH" },
  { id: "bulk", label: "Импорт", hint: "Пакетное добавление" },
  { id: "accounting", label: "Бухгалтерия", hint: "Расходы и оплаты" }
];

function ServersPage({
  groups,
  servers,
  metrics,
  accounting,
  accountingLoading,
  form,
  setForm,
  connectionResult,
  onSubmit,
  onTest,
  editingServerId,
  onEdit,
  onCancelEdit,
  onDelete,
  canCreate,
  canEdit,
  canDelete,
  canEnrollAgent,
  onEnrollAgent,
  onReinstallAllAgents,
  agentsReinstallingAll,
  onQuickUpdateServer,
  quickSavingServerId,
  onConvertToKey,
  convertingToKeyServerId,
  onRefreshAllMetrics,
  onRefreshServerMetrics,
  onExportFilezilla,
  filezillaExporting,
  metricsRefreshingAll,
  refreshingMetricServerId,
  bulkInput,
  setBulkInput,
  bulkGroupId,
  setBulkGroupId,
  onBulkCreate,
  bulkStatus,
  bulkBusy,
  onImportFilezilla,
  filezillaImporting
}: Props) {
  const [activeTab, setActiveTab] = useState<ServerViewTab>("fleet");
  const [filters, setFilters] = useState<FleetFilters>(defaultFilters);

  const fleetStats = useMemo(() => computeFleetStats(servers, metrics, accounting), [servers, metrics, accounting]);
  const filteredServers = useMemo(() => filterServers(servers, metrics, filters), [servers, metrics, filters]);

  useEffect(() => {
    if (editingServerId != null) {
      setActiveTab("form");
    }
  }, [editingServerId]);

  function handleEdit(server: Server) {
    onEdit(server);
    setActiveTab("form");
  }

  function handleCancelEdit() {
    onCancelEdit();
    setActiveTab("fleet");
  }

  return (
    <div className="page-stack servers-page">
      <section className="page-hero">
        <div>
          <p className="eyebrow">Серверы</p>
          <h1>Управление узлами и доступом</h1>
          <p className="hero-copy">
            Следите за состоянием парка, добавляйте узлы по одному или пачкой, проверяйте SSH и агент, ведите учёт
            оплаты по каждому серверу.
          </p>
        </div>
      </section>

      <ServersOverviewStats stats={fleetStats} />

      <nav className="page-tabs" aria-label="Разделы управления серверами">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`page-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            <small>{tab.hint}</small>
          </button>
        ))}
      </nav>

      {activeTab === "fleet" ? (
        <section className="panel servers-fleet-panel">
          <div className="panel-head">
            <div>
              <h2>Парк серверов</h2>
              <p className="muted">
                Показано {filteredServers.length} из {servers.length}. Группу и стоимость можно менять прямо на
                карточке. Метрики — кнопкой «Запросить все» или по серверу.
              </p>
            </div>
            <div className="panel-actions">
              <button type="button" className="ghost" disabled={filezillaExporting} onClick={onExportFilezilla}>
                {filezillaExporting ? "Экспорт…" : "FileZilla XML"}
              </button>
              <button type="button" className="ghost" disabled={metricsRefreshingAll} onClick={onRefreshAllMetrics}>
                {metricsRefreshingAll ? "Опрос…" : "Запросить все"}
              </button>
              {canEnrollAgent ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={agentsReinstallingAll}
                  onClick={onReinstallAllAgents}
                >
                  {agentsReinstallingAll ? "Обновление агентов…" : "Обновить всех агентов"}
                </button>
              ) : null}
              {(canCreate || canEdit) && (
                <>
                  <button type="button" className="ghost" onClick={() => setActiveTab("form")}>
                    + Добавить узел
                  </button>
                  {canCreate ? (
                    <button type="button" className="ghost" onClick={() => setActiveTab("bulk")}>
                      Импорт
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>

          <div className="servers-toolbar">
            <label className="toolbar-search">
              <span className="sr-only">Поиск</span>
              <input
                type="search"
                placeholder="Поиск по имени, IP, логину, группе…"
                value={filters.query}
                onChange={(event) => setFilters({ ...filters, query: event.target.value })}
              />
            </label>
            <label>
              Группа
              <select
                value={filters.groupId}
                onChange={(event) => setFilters({ ...filters, groupId: event.target.value })}
              >
                <option value="">Все группы</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              SSH
              <select
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value as FleetFilters["status"] })}
              >
                <option value="all">Любой</option>
                <option value="online">Онлайн</option>
                <option value="offline">Офлайн</option>
              </select>
            </label>
            <label>
              Агент
              <select
                value={filters.agent}
                onChange={(event) => setFilters({ ...filters, agent: event.target.value as FleetFilters["agent"] })}
              >
                <option value="all">Любой</option>
                <option value="online">Онлайн</option>
                <option value="pending">Ожидает связи</option>
                <option value="none">Не установлен</option>
              </select>
            </label>
            {filters.query || filters.groupId || filters.status !== "all" || filters.agent !== "all" ? (
              <button type="button" className="ghost" onClick={() => setFilters(defaultFilters)}>
                Сбросить
              </button>
            ) : null}
          </div>

          {filteredServers.length === 0 ? (
            <div className="empty-state">
              <strong>{servers.length === 0 ? "Серверов пока нет" : "Ничего не найдено"}</strong>
              <p className="muted">
                {servers.length === 0
                  ? "Добавьте первый узел вручную или импортируйте список из CSV-подобного формата."
                  : "Измените фильтры или очистите поиск, чтобы увидеть другие узлы."}
              </p>
              {canCreate && servers.length === 0 ? (
                <div className="card-actions">
                  <button type="button" onClick={() => setActiveTab("form")}>
                    Добавить сервер
                  </button>
                  <button type="button" className="ghost" onClick={() => setActiveTab("bulk")}>
                    Массовый импорт
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="servers-grid">
              {filteredServers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  groups={groups}
                  metric={metrics.find((item) => item.server_id === server.id)}
                  isEditing={editingServerId === server.id}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canEnrollAgent={canEnrollAgent}
                  quickSaving={quickSavingServerId === server.id}
                  onEdit={handleEdit}
                  onDelete={onDelete}
                  onEnrollAgent={onEnrollAgent}
                  onQuickUpdate={onQuickUpdateServer}
                  onConvertToKey={onConvertToKey}
                  convertingToKey={convertingToKeyServerId === server.id}
                  onRefreshMetrics={onRefreshServerMetrics}
                  metricsRefreshing={refreshingMetricServerId === server.id}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "form" ? (
        <ServerFormPanel
          groups={groups}
          form={form}
          setForm={setForm}
          connectionResult={connectionResult}
          onSubmit={onSubmit}
          onTest={onTest}
          editingServerId={editingServerId}
          onCancelEdit={handleCancelEdit}
          canCreate={canCreate}
          canEdit={canEdit}
        />
      ) : null}

      {activeTab === "bulk" ? (
        <ServersBulkPanel
          groups={groups}
          bulkInput={bulkInput}
          setBulkInput={setBulkInput}
          bulkGroupId={bulkGroupId}
          setBulkGroupId={setBulkGroupId}
          onBulkCreate={onBulkCreate}
          bulkStatus={bulkStatus}
          bulkBusy={bulkBusy}
          onImportFilezilla={onImportFilezilla}
          filezillaImporting={filezillaImporting}
          canCreate={canCreate}
        />
      ) : null}

      {activeTab === "accounting" ? (
        <ServersAccountingPanel summary={accounting} loading={accountingLoading} embedded />
      ) : null}
    </div>
  );
}

export default ServersPage;
