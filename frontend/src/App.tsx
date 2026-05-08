import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";

import { api, getStoredToken, setStoredToken } from "./api";
import PageFallback from "./components/PageFallback";
import AppChrome from "./layout/AppChrome";
import AppSidebar from "./layout/AppSidebar";
import SubnavStrip from "./layout/SubnavStrip";
import { sections, userHasSectionAccess } from "./navigation";
import AppRoutes from "./routes/AppRoutes";
import type {
  Alert,
  AuditLog,
  DashboardStats,
  Group,
  Pattern,
  Server,
  ServerMetricSnapshot,
  User
} from "./types";

const LoginPage = lazy(() => import("./components/LoginPage"));
const PasswordChangePage = lazy(() => import("./components/PasswordChangePage"));

function App() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(getStoredToken());
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [panelUsers, setPanelUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [metrics, setMetrics] = useState<ServerMetricSnapshot[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadReferenceData() {
    const me = await api.me();
    const [serverList, groupList, patternList, alertsData] = await Promise.all([
      userHasSectionAccess(me, "servers") ? api.listServers() : Promise.resolve([]),
      userHasSectionAccess(me, "groups") ? api.listGroups() : Promise.resolve([]),
      userHasSectionAccess(me, "patterns") ? api.listPatterns() : Promise.resolve([]),
      userHasSectionAccess(me, "alerts") ? api.listAlerts() : Promise.resolve([])
    ]);
    const [logs, users] =
      me.role === "admin" ? await Promise.all([api.listAuditLogs(), api.listPanelUsers()]) : [[], []];
    setCurrentUser(me);
    setServers(serverList);
    setGroups(groupList);
    setPatterns(patternList);
    setAuditLogs(logs as AuditLog[]);
    setPanelUsers(users as User[]);
    setAlerts(alertsData);
  }

  async function loadLiveData() {
    if (!currentUser || !userHasSectionAccess(currentUser, "dashboard")) {
      setStats(null);
      setMetrics([]);
      return;
    }
    const [dashboard, metricList] = await Promise.all([api.dashboard(), api.metrics()]);
    setStats(dashboard);
    setMetrics(metricList);
  }

  async function loadData() {
    if (!authToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      await Promise.all([loadReferenceData(), loadLiveData()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось загрузить панель.";
      setError(message);
      if (!getStoredToken()) {
        void handleLogout(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [authToken]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!authToken) {
      return;
    }
    const intervalId = window.setInterval(() => {
      void loadLiveData().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Не удалось обновить живые метрики.");
      });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [authToken, currentUser]);

  async function handleLogin(email: string, password: string, otpCode?: string, recoveryCode?: string) {
    setError("");
    const response = await api.login(email, password, otpCode, recoveryCode);
    setStoredToken(response.access_token);
    setAuthToken(response.access_token);
    setCurrentUser(response.user);
  }

  async function handleChangeOwnPassword(currentPassword: string, newPassword: string) {
    setError("");
    try {
      await api.changePassword({
        current_password: currentPassword,
        new_password: newPassword
      });
      const me = await api.me();
      setCurrentUser(me);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить пароль.");
    }
  }

  async function handleLogout(skipRemote = false) {
    if (!skipRemote && getStoredToken()) {
      try {
        await api.logout();
      } catch {
        // ignore remote logout errors
      }
    }
    setStoredToken(null);
    setAuthToken(null);
    setCurrentUser(null);
    setServers([]);
    setGroups([]);
    setPatterns([]);
    setPanelUsers([]);
    setAlerts([]);
    setAuditLogs([]);
    setStats(null);
    setMetrics([]);
    setError("");
  }

  const visibleSections = sections.filter((section) => !section.adminOnly || currentUser?.role === "admin");
  const permissionAwareSections = visibleSections.filter((section) =>
    userHasSectionAccess(currentUser, section.path.slice(1))
  );
  const activeSection = useMemo(
    () =>
      permissionAwareSections.find((section) => location.pathname.startsWith(section.path)) ?? permissionAwareSections[0],
    [permissionAwareSections, location.pathname]
  );
  const activeGroup = activeSection?.group ?? "overview";
  const activeGroupSections = permissionAwareSections.filter((section) => section.group === activeGroup);

  if (!authToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginPage onLogin={handleLogin} error={error} />
      </Suspense>
    );
  }

  if (currentUser?.must_change_password) {
    return (
      <Suspense fallback={<PageFallback />}>
        <PasswordChangePage email={currentUser.email} onSubmit={handleChangeOwnPassword} error={error} />
      </Suspense>
    );
  }

  return (
    <div className="workspace-shell">
      <AppChrome
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((open) => !open)}
        onCloseMobileNav={() => setMobileNavOpen(false)}
        topBarTitle={activeSection?.label ?? "Панель"}
      />

      <AppSidebar
        mobileNavOpen={mobileNavOpen}
        permissionAwareSections={permissionAwareSections}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      <div className="content-shell">
        {error ? <div className="banner error">{error}</div> : null}

        <SubnavStrip sections={activeGroupSections} />

        <main id="main-content">
          <AppRoutes
            authToken={authToken}
            currentUser={currentUser}
            servers={servers}
            groups={groups}
            patterns={patterns}
            panelUsers={panelUsers}
            alerts={alerts}
            auditLogs={auditLogs}
            stats={stats}
            metrics={metrics}
            loading={loading}
            setError={setError}
            onReload={loadData}
          />
        </main>
      </div>
    </div>
  );
}

export default App;
