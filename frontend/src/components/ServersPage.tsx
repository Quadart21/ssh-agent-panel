import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type { ConnectionTestResult, Group, Server, ServerAccountingSummary, ServerMetricSnapshot } from "../types";
import { EmptyState, PageHero, PageShell, PageToolbar, Panel } from "./ui";
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

const tabs: { id: ServerViewTab; label: string }[] = [
  { id: "fleet", label: "Список" },
  { id: "form", label: "Добавить" },
  { id: "bulk", label: "Импорт" },
  { id: "accounting", label: "Оплаты" }
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
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const fleetStats = useMemo(() => computeFleetStats(servers, metrics, accounting), [servers, metrics, accounting]);
  const filteredServers = useMemo(() => filterServers(servers, metrics, filters), [servers, metrics, filters]);

  useEffect(() => {
    if (editingServerId != null) {
      setActiveTab("form");
    }
  }, [editingServerId]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    }
    if (moreOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreOpen]);

  function handleEdit(server: Server) {
    onEdit(server);
    setActiveTab("form");
  }

  function handleCancelEdit() {
    onCancelEdit();
    setActiveTab("fleet");
  }

  const tabHint =
    activeTab === "fleet"
      ? "Парк серверов, фильтры и метрики"
      : activeTab === "form"
        ? editingServerId
          ? "Редактирование сервера"
          : "Добавление одного сервера"
        : activeTab === "bulk"
          ? "Пакетное добавление"
          : "Расходы и даты оплаты";

  return (
    <PageShell className="servers-page">
      <PageHero eyebrow="Инфраструктура" title="Серверы" description={tabHint} />

      <nav className="page-tabs page-tabs--compact" aria-label="Разделы управления серверами">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`page-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {activeTab === "fleet" ? (
        <>
          <ServersOverviewStats stats={fleetStats} />

          <PageToolbar
            meta={`${filteredServers.length} из ${servers.length}`}
            actions={
              <>
                <button type="button" className="ghost" disabled={metricsRefreshingAll} onClick={onRefreshAllMetrics}>
                  {metricsRefreshingAll ? "Опрос…" : "Запросить метрики"}
                </button>
                {canCreate || canEdit ? (
                  <button type="button" onClick={() => setActiveTab("form")}>
                    Добавить
                  </button>
                ) : null}
                <div className="servers-more-menu" ref={moreRef}>
                  <button type="button" className="ghost" onClick={() => setMoreOpen((open) => !open)}>
                    Ещё
                  </button>
                  {moreOpen ? (
                    <div className="servers-more-dropdown">
                      <button
                        type="button"
                        className="ghost btn-sm"
                        disabled={filezillaExporting}
                        onClick={() => {
                          setMoreOpen(false);
                          onExportFilezilla();
                        }}
                      >
                        {filezillaExporting ? "Экспорт…" : "Экспорт FileZilla"}
                      </button>
                      {canEnrollAgent ? (
                        <button
                          type="button"
                          className="ghost btn-sm"
                          disabled={agentsReinstallingAll}
                          onClick={() => {
                            setMoreOpen(false);
                            onReinstallAllAgents();
                          }}
                        >
                          {agentsReinstallingAll ? "Обновление…" : "Обновить агентов"}
                        </button>
                      ) : null}
                      {canCreate ? (
                        <button
                          type="button"
                          className="ghost btn-sm"
                          onClick={() => {
                            setMoreOpen(false);
                            setActiveTab("bulk");
                          }}
                        >
                          Импорт
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </>
            }
          >
            <label className="toolbar-search">
              Поиск
              <input
                type="search"
                placeholder="Имя, IP, логин, группа…"
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
                <option value="">Все</option>
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
                <option value="pending">Ожидает</option>
                <option value="none">Нет</option>
              </select>
            </label>
            {filters.query || filters.groupId || filters.status !== "all" || filters.agent !== "all" ? (
              <button type="button" className="ghost btn-sm" onClick={() => setFilters(defaultFilters)}>
                Сбросить
              </button>
            ) : null}
          </PageToolbar>

          <Panel title="Серверы">
            {filteredServers.length === 0 ? (
              <EmptyState
                title={servers.length === 0 ? "Серверов пока нет" : "Ничего не найдено"}
                description={
                  servers.length === 0
                    ? "Добавьте сервер вручную или импортируйте список."
                    : "Измените фильтры или очистите поиск."
                }
                actions={
                  canCreate && servers.length === 0 ? (
                    <>
                      <button type="button" onClick={() => setActiveTab("form")}>
                        Добавить сервер
                      </button>
                      <button type="button" className="ghost" onClick={() => setActiveTab("bulk")}>
                        Импорт
                      </button>
                    </>
                  ) : null
                }
              />
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
          </Panel>
        </>
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
    </PageShell>
  );
}

export default ServersPage;
