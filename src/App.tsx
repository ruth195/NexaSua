import React, { useEffect, useState } from 'react';
import { OfflineIndicator } from './components/PWAInstallButton';
import { PublicLayout } from './components/PublicLayout';
import { apiFetch, setActiveAdminSchoolId, setMemoryAuthToken } from './lib/api';
import { PublicPageRouter } from './pages/PublicPages';
import {
  LoginPage,
  SchoolRegisterPage,
  SuperAdminPortalLoginPage,
} from './pages/RegisterAndLoginPages';
import { SchoolWorkspace } from './pages/SchoolWorkspace';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import type {
  AuthUser,
  HealthResponse,
  SchoolSummary,
  SubscriptionPlan,
  SubscriptionSummary,
  UserRole,
} from './types/nexasua';

export default function App() {
  const [path, setPath] = useState<string>(() => window.location.pathname || '/');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [school, setSchool] = useState<SchoolSummary | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionSummary | null>(null);
  const [superAdminManagedBySecrets, setSuperAdminManagedBySecrets] = useState(false);
  const [adminWorkspace, setAdminWorkspace] = useState<{
    school: SchoolSummary;
    subscription: SubscriptionSummary | null;
  } | null>(null);
  const [superAdminRolePreview, setSuperAdminRolePreview] = useState<'AUTO' | UserRole>('AUTO');
  const [autoTourBanner, setAutoTourBanner] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>('COMPLETE');
  const [selectedPopulation, setSelectedPopulation] = useState<number>(200);
  const [googleOnboarding, setGoogleOnboarding] = useState<{
    email: string;
    fullName: string;
    googleOnboardingToken: string;
  } | null>(null);
  const [candlelight, setCandlelight] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nexasua_candlelight') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.classList.toggle('candlelight', candlelight);
    try {
      localStorage.setItem('nexasua_candlelight', candlelight ? '1' : '0');
    } catch {
      // ignore storage failure
    }
  }, [candlelight]);

  const toggleCandlelight = () => setCandlelight((prev) => !prev);

  const candlelightOverlay = (
    <>
      {candlelight && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[60] bg-amber-500/[0.12] mix-blend-multiply transition-opacity duration-200"
        />
      )}
      <OfflineIndicator />
    </>
  );

  const navigate = (nextPath: string) => {
    if (nextPath !== window.location.pathname) {
      window.history.pushState({}, '', nextPath);
    }
    setPath(nextPath);
  };

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname || '/');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const refreshHealthAndSession = async () => {
    apiFetch<HealthResponse>('/api/health')
      .then((h) => {
        setHealth(h);
        if (typeof h.superAdminManagedBySecrets === 'boolean') {
          setSuperAdminManagedBySecrets(h.superAdminManagedBySecrets);
        }
      })
      .catch(() => null);
    try {
      const me = await apiFetch<{
        user: AuthUser;
        school: SchoolSummary | null;
        subscription: SubscriptionSummary | null;
        superAdminManagedBySecrets?: boolean;
      }>('/api/auth/me');
      setUser(me.user);
      setSchool(me.school);
      setSubscription(me.subscription);
      if (typeof me.superAdminManagedBySecrets === 'boolean') {
        setSuperAdminManagedBySecrets(me.superAdminManagedBySecrets);
      }
    } catch {
      setUser(null);
      setSchool(null);
      setSubscription(null);
    } finally {
      setAuthChecked(true);
    }
  };

  useEffect(() => {
    void refreshHealthAndSession();
  }, []);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => null);
    setMemoryAuthToken(null);
    setActiveAdminSchoolId(null);
    setAdminWorkspace(null);
    setSuperAdminRolePreview('AUTO');
    setAutoTourBanner(false);
    setUser(null);
    setSchool(null);
    setSubscription(null);
    navigate('/');
  };

  const openAdminWorkspace = (
    ctx: {
      school: SchoolSummary;
      subscription: SubscriptionSummary | null;
    },
    initialRole: 'AUTO' | UserRole = 'AUTO'
  ) => {
    const schoolId = ctx.school.id || ctx.school._id || null;
    setActiveAdminSchoolId(schoolId);
    setSuperAdminRolePreview(initialRole);
    setAdminWorkspace(ctx);
  };

  const autoOpenAllDashboards = async (
    initialRole: 'AUTO' | UserRole = 'AUTO',
    fromGoogle = false
  ) => {
    try {
      const ctx = await apiFetch<{
        school: SchoolSummary;
        subscription: SubscriptionSummary | null;
      }>('/api/super-admin/ensure-admin-workspace', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setAutoTourBanner(fromGoogle);
      openAdminWorkspace(ctx, initialRole);
    } catch {
      // Fallback to SuperAdminDashboard if workspace auto-open fails
    }
  };

  const refreshAdminWorkspace = async () => {
    const schoolId = adminWorkspace?.school.id || adminWorkspace?.school._id;
    if (!schoolId) return;
    try {
      const ctx = await apiFetch<{
        school: SchoolSummary;
        subscription: SubscriptionSummary | null;
      }>(`/api/super-admin/schools/${schoolId}/workspace-context`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setAdminWorkspace(ctx);
    } catch {
      // ignore
    }
  };

  // Protected Super Admin Portal (separate route)
  if (path === '/nexaflow-admin') {
    if (user && user.role === 'SUPER_ADMIN') {
      if (adminWorkspace) {
        const activeWorkspaceSchoolId =
          adminWorkspace.school.id || adminWorkspace.school._id || 'admin-workspace';
        return (
          <>
            {candlelightOverlay}
            <SchoolWorkspace
              key={activeWorkspaceSchoolId}
              user={user}
              school={adminWorkspace.school}
              subscription={adminWorkspace.subscription}
              initialRolePreview={superAdminRolePreview}
              onRolePreviewChange={setSuperAdminRolePreview}
              autoOpenedViaGoogle={autoTourBanner}
              onDismissAutoBanner={() => setAutoTourBanner(false)}
              onSwitchAdminSchool={(nextCtx) => openAdminWorkspace(nextCtx, superAdminRolePreview)}
              candlelight={candlelight}
              onToggleCandlelight={toggleCandlelight}
              onRefreshAuth={() => void refreshAdminWorkspace()}
              onExitAdminWorkspace={() => {
                setActiveAdminSchoolId(null);
                setAdminWorkspace(null);
                setAutoTourBanner(false);
              }}
              onLogout={() => void handleLogout()}
            />
          </>
        );
      }
      return (
        <>
          {candlelightOverlay}
          <SuperAdminDashboard
            user={user}
            superAdminManagedBySecrets={superAdminManagedBySecrets}
            candlelight={candlelight}
            onToggleCandlelight={toggleCandlelight}
            onUserUpdated={(next) => setUser(next)}
            onOpenWorkspace={openAdminWorkspace}
            onLogout={() => void handleLogout()}
          />
        </>
      );
    }
    return (
      <>
        {candlelightOverlay}
        <SuperAdminPortalLoginPage
          onNavigate={navigate}
          onLoginSuccess={(data) => {
            setUser(data.user);
            void refreshHealthAndSession();
            navigate('/nexaflow-admin');
            if (data.autoOpenAllDashboards) {
              void autoOpenAllDashboards('AUTO', true);
            }
          }}
        />
      </>
    );
  }

  // Authenticated School Dashboard Workspace
  if (user && user.role !== 'SUPER_ADMIN' && (path === '/dashboard' || path === '/login')) {
    return (
      <>
        {candlelightOverlay}
        <SchoolWorkspace
          user={user}
          school={school}
          subscription={subscription}
          candlelight={candlelight}
          onToggleCandlelight={toggleCandlelight}
          onRefreshAuth={() => void refreshHealthAndSession()}
          onLogout={() => void handleLogout()}
        />
      </>
    );
  }

  if (user && user.role === 'SUPER_ADMIN' && (path === '/dashboard' || path === '/login')) {
    return (
      <>
        {candlelightOverlay}
        <SuperAdminDashboard
          user={user}
          superAdminManagedBySecrets={superAdminManagedBySecrets}
          candlelight={candlelight}
          onToggleCandlelight={toggleCandlelight}
          onUserUpdated={(next) => setUser(next)}
          onOpenWorkspace={(ctx, role = 'AUTO') => {
            openAdminWorkspace(ctx, role);
            navigate('/nexaflow-admin');
          }}
          onLogout={() => void handleLogout()}
        />
      </>
    );
  }

  // Public Pages + School Registration + Portal Login
  return (
    <>
      {candlelightOverlay}
      <PublicLayout
        currentPath={path}
        onNavigate={navigate}
        platformAnnouncement={health?.platformAnnouncement}
        candlelight={candlelight}
        onToggleCandlelight={toggleCandlelight}
      >
      {path === '/register' ? (
        <SchoolRegisterPage
          initialPlan={selectedPlan}
          initialPopulation={selectedPopulation}
          health={health}
          googleOnboarding={googleOnboarding}
          onClearGoogleOnboarding={() => setGoogleOnboarding(null)}
          onGoogleOnboardingReceived={(data) => setGoogleOnboarding(data)}
          onNavigate={navigate}
        />
      ) : path === '/login' ? (
        <LoginPage
          googleOAuthEnabled={Boolean(health?.googleOAuthEnabled)}
          onNavigate={navigate}
          onStartGoogleRegistration={(data) => {
            setGoogleOnboarding(data);
            navigate('/register');
          }}
          onLoginSuccess={(data) => {
            setUser(data.user);
            setSchool(data.school);
            setSubscription(data.subscription);
            if (data.user.role === 'SUPER_ADMIN') {
              navigate('/nexaflow-admin');
              if (data.autoOpenAllDashboards) {
                void autoOpenAllDashboards('AUTO', true);
              }
            } else {
              navigate('/dashboard');
            }
          }}
        />
      ) : (
        <PublicPageRouter
          path={path}
          health={health}
          onNavigate={navigate}
          onSelectPlanForRegistration={(plan, pop) => {
            setSelectedPlan(plan);
            setSelectedPopulation(pop);
            navigate('/register');
          }}
        />
      )}
    </PublicLayout>
    </>
  );
}
