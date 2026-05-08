import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "../api";
import PageFallback from "../components/PageFallback";
import { permissionSections } from "../navigation";
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
const AutomationPage = lazy(() => import("../components/AutomationPage"));
const CommandsRoute = lazy(() => import("../components/CommandsRoute"));
const DashboardPage = lazy(() => import("../components/DashboardPage"));
const FirewallPage = lazy(() => import("../components/FirewallPage"));
const GroupsRoute = lazy(() => import("../components/GroupsRoute"));
const PanelUsersRoute = lazy(() => import("../components/PanelUsersRoute"));
const Pm2Panel = lazy(() => import("../components/Pm2Panel"));
const PatternsRoute = lazy(() => import("../components/PatternsRoute"));
const SecurityPage = lazy(() => import("../components/SecurityPage"));
const ServersRoute = lazy(() => import("../components/ServersRoute"));
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
  onReload
}: AppRoutesProps) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route
          path="/dashboard"
          element={<DashboardPage stats={stats} metrics={metrics} servers={servers} alerts={alerts} loading={loading} />}
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
            />
          }
        />
        <Route
          path="/groups"
          element={<GroupsRoute groups={groups} currentUser={currentUser} onError={setError} onReload={onReload} />}
        />
        <Route
          path="/commands"
          element={<CommandsRoute servers={servers} groups={groups} patterns={patterns} token={authToken} onError={setError} />}
        />
        <Route path="/automation" element={<AutomationPage servers={servers} groups={groups} token={authToken} onError={setError} />} />
        <Route path="/users" element={<UsersPage servers={servers} groups={groups} onError={setError} />} />
        <Route path="/firewall" element={<FirewallPage servers={servers} onError={setError} />} />
        <Route path="/security" element={<SecurityPage servers={servers} onError={setError} />} />
        <Route path="/sessions" element={<SessionsPage onError={setError} />} />
        <Route path="/two-factor" element={<TwoFactorPage onError={setError} />} />
        <Route path="/telegram" element={<TelegramPage onError={setError} />} />
        <Route
          path="/panel-users"
          element={
            currentUser.role === "admin" ? (
              <PanelUsersRoute
                users={panelUsers}
                servers={servers}
                currentUser={currentUser}
                onError={setError}
                onReload={onReload}
                permissionSections={[...permissionSections]}
              />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="/system"
          element={currentUser.role === "admin" ? <SystemPage onError={setError} /> : <Navigate to="/dashboard" replace />}
        />
        <Route
          path="/terminal"
          element={
            <div className="page-stack">
              <section className="page-hero">
                <div>
                  <p className="eyebrow">Терминал</p>
                  <h1>Интерактивный SSH-доступ</h1>
                  <p className="hero-copy">Подключайтесь к серверу прямо из панели без перехода в отдельный клиент.</p>
                </div>
              </section>
              <TerminalPanel servers={servers} token={authToken} />
            </div>
          }
        />
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
