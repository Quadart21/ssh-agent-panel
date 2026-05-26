import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { ApiError, api, getStoredToken, setStoredToken } from "./api";
import PageFallback from "./components/PageFallback";
import MetricsEmbedWidget from "./components/MetricsEmbedWidget";
import AppChrome from "./layout/AppChrome";
import AppDock from "./layout/AppDock";
import AppSidebar from "./layout/AppSidebar";
import MobileHeader from "./layout/MobileHeader";
import { sections, userHasSectionAccess } from "./navigation";
import type { NavGroup } from "./navigation";
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
  const navigate = useNavigate();
  const [dockMenuGroup, setDockMenuGroup] = useState<NavGroup | null>(null);
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
    // Set current user ASAP so app can render quickly after refresh.
    setCurrentUser(me);

    const [serverList, groupList, patternList] = await Promise.all([
      userHasSectionAccess(me, "servers") || userHasSectionAccess(me, "dashboard")
        ? api.listServers()
        : Promise.resolve([]),
      userHasSectionAccess(me, "groups") ? api.listGroups() : Promise.resolve([]),
      userHasSectionAccess(me, "patterns") ? api.listPatterns() : Promise.resolve([])
    ]);
    const [logs, users] =
      me.role === "admin" ? await Promise.all([api.listAuditLogs(), api.listPanelUsers()]) : [[], []];
    setServers(serverList);
    setGroups(groupList);
    setPatterns(patternList);
    setAuditLogs(logs as AuditLog[]);
    setPanelUsers(users as User[]);

    // Alerts endpoint loads cached data; failures should not block the whole panel.
    if (userHasSectionAccess(me, "alerts")) {
      void api
        .listAlerts()
        .then((alertsData) => setAlerts(alertsData))
        .catch((err: unknown) => {
          console.warn("Failed to load alerts:", err);
        });
    } else {
      setAlerts([]);
    }

    return me;
  }

  async function loadLiveData(user: User | null = currentUser) {
    if (!user) {
      return;
    }

    const canDashboard = userHasSectionAccess(user, "dashboard");
    const canServers = userHasSectionAccess(user, "servers");
    if (!canDashboard && !canServers) {
      setStats(null);
      setMetrics([]);
      return;
    }

    const [dashboard, metricList] = await Promise.all([
      canDashboard ? api.dashboard() : Promise.resolve(null),
      canDashboard || canServers ? api.metrics() : Promise.resolve([])
    ]);
    setStats(dashboard);
    setMetrics(metricList);
  }

  async function refreshAllMetrics() {
    const snapshots = await api.refreshAllMetrics();
    setMetrics(snapshots);
    if (currentUser && userHasSectionAccess(currentUser, "dashboard")) {
      setStats(await api.dashboard());
    }
    return snapshots;
  }

  async function refreshServerMetrics(serverId: number) {
    const snapshot = await api.refreshServerMetrics(serverId);
    setMetrics((current) => [...current.filter((item) => item.server_id !== serverId), snapshot]);
    if (currentUser && userHasSectionAccess(currentUser, "dashboard")) {
      setStats(await api.dashboard());
    }
    return snapshot;
  }

  async function loadData() {
    if (!authToken) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const me = await loadReferenceData();
      await loadLiveData(me);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Не удалось загрузить панель.";
      setError(message);
      if (err instanceof ApiError && [400, 401, 403].includes(err.status)) {
        await handleLogout(true);
        return;
      }
      if (!getStoredToken()) {
        await handleLogout(true);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [authToken]);

  useEffect(() => {
    setDockMenuGroup(null);
  }, [location.pathname]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDockMenuGroup(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function handleLogin(email: string, password: string, otpCode?: string, recoveryCode?: string) {
    setError("");
    try {
      const response = await api.login(email, password, otpCode, recoveryCode);
      setStoredToken(response.access_token);
      setAuthToken(response.access_token);
      setCurrentUser(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось выполнить вход.");
    }
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

  function handleDockGroupSelect(group: NavGroup) {
    const groupSections = permissionAwareSections.filter((section) => section.group === group);
    if (!groupSections.length) {
      return;
    }

    if (activeGroup === group && groupSections.length > 1) {
      setDockMenuGroup((current) => (current === group ? null : group));
      return;
    }

    const target =
      groupSections.find((section) => location.pathname.startsWith(section.path)) ?? groupSections[0];
    setDockMenuGroup(null);
    if (!location.pathname.startsWith(target.path)) {
      navigate(target.path);
    }
  }

  if (location.pathname.startsWith("/embed/")) {
    return (
      <div className="embed-shell">
        <Routes>
          <Route path="/embed/:token" element={<MetricsEmbedWidget />} />
        </Routes>
      </div>
    );
  }

  if (!authToken) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LoginPage onLogin={handleLogin} error={error} />
      </Suspense>
    );
  }

  if (!currentUser) {
    return <PageFallback />;
  }

  if (currentUser?.must_change_password) {
    return (
      <Suspense fallback={<PageFallback />}>
        <PasswordChangePage email={currentUser.email} onSubmit={handleChangeOwnPassword} error={error} />
      </Suspense>
    );
  }

  return (
    <div className="workspace-shell workspace-shell--adaptive">
      <AppChrome topBarTitle={activeSection?.label ?? "Панель"} />

      <MobileHeader
        topBarTitle={activeSection?.label ?? "Панель"}
        currentUser={currentUser}
        onLogout={handleLogout}
        sections={activeGroupSections}
      />

      <AppSidebar permissionAwareSections={permissionAwareSections} currentUser={currentUser} onLogout={handleLogout} />

      <div className="content-shell">
        {error ? <div className="banner error">{error}</div> : null}

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
            onRefreshAllMetrics={refreshAllMetrics}
            onRefreshServerMetrics={refreshServerMetrics}
          />
        </main>
      </div>

      <AppDock
        permissionAwareSections={permissionAwareSections}
        activeGroup={activeGroup}
        openMenuGroup={dockMenuGroup}
        onSelectGroup={handleDockGroupSelect}
        onCloseMenu={() => setDockMenuGroup(null)}
      />
    </div>
  );
}

export default App;
