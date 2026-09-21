import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "../api";
import PageFallback from "../components/PageFallback";
import { permissionSections, userHasActionAccess, userHasSectionAccess } from "../navigation";
import type {
  Alert,
  AuditLog,
  DashboardStats,
  Group,
  Pattern,
  Server,
  ServerMetricSnapshot,
  User
} from "../types";

const AuditPage = lazy(() => import("../components/AuditPage"));
const AlertsPage = lazy(() => import("../components/AlertsPage"));
const AccountingPage = lazy(() => import("../components/AccountingPage"));
const CryptoSpreadPage = lazy(() => import("../components/CryptoSpreadPage"));
const AutomationPage = lazy(() => import("../components/AutomationPage"));
const CommandsRoute = lazy(() => import("../components/CommandsRoute"));
const DashboardPage = lazy(() => import("../components/DashboardPage"));
const FirewallPage = lazy(() => import("../components/FirewallPage"));
const GroupsRoute = lazy(() => import("../components/GroupsRoute"));
const PanelUsersRoute = lazy(() => import("../components/PanelUsersRoute"));
const Pm2Panel = lazy(() => import("../components/Pm2Panel"));
const PatternsRoute = lazy(() => import("../components/PatternsRoute"));
const SecurityPage = lazy(() => import("../components/SecurityPage"));
const SshKeysPage = lazy(() => import("../components/SshKeysPage"));
const ServersRoute = lazy(() => import("../components/ServersRoute"));
const MetricEmbedsPage = lazy(() => import("../components/MetricEmbedsPage"));
const DomainsRoute = lazy(() => import("../components/DomainsRoute"));
const SessionsPage = lazy(() => import("../components/SessionsPage"));
const SystemPage = lazy(() => import("../components/SystemPage"));
const TerminalPanel = lazy(() => import("../components/TerminalPanel"));
const TelegramPage = lazy(() => import("../components/TelegramPage"));
const TwoFactorPage = lazy(() => import("../components/TwoFactorPage"));
const UsersPage = lazy(() => import("../components/UsersPage"));

export type AppRoutesProps = {
  authToken: string;
  currentUser: User;
  servers: Server[];
  groups: Group[];
  patterns: Pattern[];
  panelUsers: User[];
  alerts: Alert[];
  auditLogs: AuditLog[];
  stats: DashboardStats | null;
  metrics: ServerMetricSnapshot[];
  loading: boolean;
  setError: (message: string) => void;
  onReload: () => Promise<void>;
  onRefreshAllMetrics: () => Promise<ServerMetricSnapshot[]>;
  onRefreshServerMetrics: (serverId: number) => Promise<ServerMetricSnapshot>;
};

function AppRoutes({
  authToken,
  currentUser,
  servers,
  groups,
  patterns,
  panelUsers,
  alerts,
  auditLogs,
  stats,
  metrics,
  loading,
  setError,
  onReload,
  onRefreshAllMetrics,
  onRefreshServerMetrics
}: AppRoutesProps) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={
            <DashboardPage
              stats={stats}
              metrics={metrics}
              servers={servers}
              groups={groups}
              alerts={alerts}
              loading={loading}
              canViewAccess={
                userHasSectionAccess(currentUser, "servers") ||
                userHasSectionAccess(currentUser, "dashboard")
              }
              canConvertKey={userHasActionAccess(currentUser, "server_update")}
              onReload={onReload}
              onRefreshAllMetrics={onRefreshAllMetrics}
              onError={setError}
            />
          }
        />
        <Route
          path="/servers"
          element={
            <ServersRoute
              groups={groups}
              servers={servers}
              metrics={metrics}
              currentUser={currentUser}
              onError={setError}
              onReload={onReload}
              onRefreshAllMetrics={onRefreshAllMetrics}
              onRefreshServerMetrics={onRefreshServerMetrics}
            />
          }
        />
        <Route
          path="/metric-embeds"
          element={<MetricEmbedsPage servers={servers} onError={setError} />}
        />
        <Route
          path="/groups"
          element={<GroupsRoute groups={groups} currentUser={currentUser} onError={setError} onReload={onReload} />}
        />
        <Route path="/domains" element={<DomainsRoute currentUser={currentUser} onError={setError} />} />
        <Route
          path="/commands"
          element={<CommandsRoute servers={servers} groups={groups} patterns={patterns} token={authToken} onError={setError} />}
        />
        <Route path="/automation" element={<AutomationPage servers={servers} groups={groups} token={authToken} onError={setError} />} />
        <Route path="/users" element={<UsersPage servers={servers} groups={groups} onError={setError} />} />
        <Route path="/firewall" element={<FirewallPage servers={servers} onError={setError} />} />
        <Route path="/security" element={<SecurityPage servers={servers} onError={setError} />} />
        <Route
          path="/ssh-keys"
          element={
            <SshKeysPage
              canManage={
                userHasActionAccess(currentUser, "ssh_keys_manage") ||
                userHasActionAccess(currentUser, "server_update")
              }
              onError={setError}
            />
          }
        />
        <Route path="/sessions" element={<SessionsPage onError={setError} />} />
        <Route path="/two-factor" element={<TwoFactorPage onError={setError} />} />
        <Route path="/telegram" element={<TelegramPage onError={setError} />} />
        <Route
          path="/panel-users"
          element={
            currentUser.role === "admin" ? (
              <PanelUsersRoute users={panelUsers} servers={servers} currentUser={currentUser} onError={setError} onReload={onReload} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/system"
          element={currentUser.role === "admin" ? <SystemPage onError={setError} /> : <Navigate to="/dashboard" replace />}
        />
        <Route path="/terminal" element={<TerminalPanel servers={servers} token={authToken} />} />
        <Route path="/tmux" element={<Navigate to="/pm2" replace />} />
        <Route
          path="/pm2"
          element={
            <div className="page-stack">
              <section className="page-hero">
                <div>
                  <p className="eyebrow">PM2</p>
                  <h1>Процессы и cluster-инстансы</h1>
                  <p className="hero-copy">
                    Запускайте приложения через PM2 на удалённом сервере, задавайте несколько инстансов (cluster) и смотрите логи.
                  </p>
                </div>
              </section>
              <Pm2Panel servers={servers} onError={setError} />
            </div>
          }
        />
        <Route path="/alerts" element={<AlertsPage alerts={alerts} loading={loading} />} />
        <Route
          path="/accounting"
          element={
            userHasSectionAccess(currentUser, "accounting") ? (
              <AccountingPage currentUser={currentUser} servers={servers} onError={setError} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/crypto-spread"
          element={
            userHasSectionAccess(currentUser, "crypto-spread") ? (
              <CryptoSpreadPage currentUser={currentUser} onError={setError} />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/patterns"
          element={<PatternsRoute patterns={patterns} currentUser={currentUser} onError={setError} onReload={onReload} />}
        />
        <Route
          path="/audit"
          element={
            currentUser.role === "admin" ? (
              <AuditPage
                logs={auditLogs}
                loading={loading}
                onExport={() => {
                  void api
                    .downloadAuditLogs()
                    .then((blob) => {
                      const url = window.URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.href = url;
                      link.download = "audit_logs.csv";
                      link.click();
                      window.URL.revokeObjectURL(url);
                    })
                    .catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : "Не удалось выгрузить аудит.");
                    });
                }}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default AppRoutes;
