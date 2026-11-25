import React, { useEffect, useState } from 'react';
import {
  Building2,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Package,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import { BrandLogo, EmptyState, formatGhanaDate, formatGhs } from '../components/BrandLogo';
import { CandlelightToggle } from '../components/CandlelightToggle';
import { apiFetch } from '../lib/api';
import type {
  AuthUser,
  IntegrationItem,
  PlanCatalogItem,
  PricingBand,
  SchoolSummary,
  SubscriptionSummary,
} from '../types/nexasua';

type SuperTab =
  | 'overview'
  | 'schools'
  | 'plans'
  | 'pricing'
  | 'custom'
  | 'tickets'
  | 'audit';

export function SuperAdminDashboard({
  user,
  superAdminManagedBySecrets = false,
  candlelight = false,
  onToggleCandlelight,
  onUserUpdated,
  onOpenWorkspace,
  onLogout,
}: {
  user: AuthUser;
  superAdminManagedBySecrets?: boolean;
  candlelight?: boolean;
  onToggleCandlelight?: () => void;
  onUserUpdated?: (next: AuthUser) => void;
  onOpenWorkspace?: (ctx: {
    school: SchoolSummary;
    subscription: SubscriptionSummary | null;
  }) => void;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<SuperTab>('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [overview, setOverview] = useState<{
    metrics: Record<string, number>;
    integrations: Record<string, IntegrationItem>;
    systemHealth: { database: { ok: boolean; latencyMs?: number }; uptimeSeconds: number; memoryMb: number };
    recentAuditEvents: Array<{ _id: string; action: string; userEmail: string; resourceType: string; createdAt: string }>;
  } | null>(null);
  const [schools, setSchools] = useState<Array<any>>([]);
  const [customProjects, setCustomProjects] = useState<Array<any>>([]);
  const [tickets, setTickets] = useState<Array<any>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<any>>([]);
  const [config, setConfig] = useState<{
    trialDays: number;
    threeTermDiscountPercent: number;
    gracePeriodDays: number;
    platformAnnouncement: string;
    pricingBands: PricingBand[];
    planCatalog?: PlanCatalogItem[];
    promotionalOffers: Array<any>;
  } | null>(null);

  const [mfaSetup, setMfaSetup] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [banner, setBanner] = useState('');
  const [error, setError] = useState('');
  const [savingPlans, setSavingPlans] = useState(false);
  const [vacationEdit, setVacationEdit] = useState<Record<string, string>>({});

  // Direct create school form
  const [showCreateSchool, setShowCreateSchool] = useState(false);
  const [newSchool, setNewSchool] = useState({
    schoolName: '',
    schoolType: 'Private',
    educationalLevels: ['Primary', 'Junior High School'],
    region: 'Greater Accra',
    town: '',
    address: '',
    schoolEmail: '',
    schoolPhone: '',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    studentPopulation: 150,
    selectedPlan: 'CORE',
    termVacationDate: '',
  });

  // Promo form
  const [promo, setPromo] = useState({
    code: '',
    description: '',
    discountPercent: 15,
    applicablePlan: 'ALL',
  });

  // Ticket reply
  const [replyMap, setReplyMap] = useState<Record<string, string>>({});

  // Super Admin credential update
  const [credForm, setCredForm] = useState({
    fullName: user.fullName,
    newEmail: user.email,
    currentPassword: '',
    newPassword: '',
  });
  const [credBusy, setCredBusy] = useState(false);

  useEffect(() => {
    setCredForm((prev) => ({
      ...prev,
      fullName: user.fullName,
      newEmail: user.email,
    }));
  }, [user.fullName, user.email]);

  const loadAll = async () => {
    try {
      const [ov, sc, cfg, cp, tk, al] = await Promise.all([
        apiFetch<NonNullable<typeof overview>>('/api/super-admin/overview'),
        apiFetch<{ schools: Array<any> }>('/api/super-admin/schools'),
        apiFetch<{ config: NonNullable<typeof config> }>('/api/super-admin/system-config'),
        apiFetch<{ requests: Array<any> }>('/api/super-admin/custom-projects'),
        apiFetch<{ tickets: Array<any> }>('/api/super-admin/support-tickets'),
        apiFetch<{ logs: Array<any> }>('/api/super-admin/audit-logs'),
      ]);
      setOverview(ov);
      setSchools(sc.schools);
      setConfig(cfg.config);
      setCustomProjects(cp.requests);
      setTickets(tk.tickets);
      setAuditLogs(al.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform data.');
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const schoolAction = async (id: string, action: 'approve' | 'reject' | 'suspend' | 'reactivate') => {
    setBanner('');
    setError('');
    try {
      await apiFetch(`/api/super-admin/schools/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
      setBanner(`School ${action} completed.`);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    }
  };

  const overrideSubscription = async (
    schoolId: string,
    plan: string,
    status: string,
    termVacationDate?: string
  ) => {
    setBanner('');
    setError('');
    try {
      await apiFetch(`/api/super-admin/schools/${schoolId}/subscription`, {
        method: 'PUT',
        body: JSON.stringify({
          plan,
          status,
          periodDays: 365,
          ...(termVacationDate ? { termVacationDate } : {}),
        }),
      });
      setBanner(
        termVacationDate
          ? `Updated school subscription (${plan} · ${status}) and vacation date (${termVacationDate}).`
          : `Subscription updated to NexaSua ${plan} (${status}).`
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const savePlanCatalog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config?.planCatalog) return;
    setBanner('');
    setError('');
    setSavingPlans(true);
    try {
      await apiFetch('/api/super-admin/plans', {
        method: 'PUT',
        body: JSON.stringify({ plans: config.planCatalog }),
      });
      setBanner('Subscription plans updated and published across NexaSua.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save subscription plans.');
    } finally {
      setSavingPlans(false);
    }
  };

  const launchAllPlansWorkspace = async () => {
    setError('');
    try {
      const ctx = await apiFetch<{
        school: SchoolSummary;
        subscription: SubscriptionSummary | null;
      }>('/api/super-admin/ensure-admin-workspace', { method: 'POST', body: JSON.stringify({}) });
      onOpenWorkspace?.(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open workspace.');
    }
  };

  const enterSchoolWorkspace = async (schoolId: string) => {
    setError('');
    try {
      const ctx = await apiFetch<{
        school: SchoolSummary;
        subscription: SubscriptionSummary | null;
      }>(`/api/super-admin/schools/${schoolId}/workspace-context`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onOpenWorkspace?.(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enter school workspace.');
    }
  };

  const createSchoolDirect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/super-admin/schools', {
        method: 'POST',
        body: JSON.stringify(newSchool),
      });
      setShowCreateSchool(false);
      setBanner('School created and approved.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create school failed.');
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    try {
      await apiFetch('/api/super-admin/system-config', {
        method: 'PUT',
        body: JSON.stringify({
          trialDays: Number(config.trialDays),
          threeTermDiscountPercent: Number(config.threeTermDiscountPercent),
          gracePeriodDays: Number(config.gracePeriodDays),
          platformAnnouncement: config.platformAnnouncement,
          pricingBands: config.pricingBands,
        }),
      });
      setBanner('Platform pricing and settings updated.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config.');
    }
  };

  const createPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/super-admin/promotions', {
        method: 'POST',
        body: JSON.stringify(promo),
      });
      setPromo({ code: '', description: '', discountPercent: 15, applicablePlan: 'ALL' });
      setBanner('Promotional offer added.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promo creation failed.');
    }
  };

  const updateProject = async (id: string, status: string, quotationAmountGhs?: number | null) => {
    try {
      await apiFetch(`/api/super-admin/custom-projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status, quotationAmountGhs }),
      });
      setBanner('Custom project updated.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed.');
    }
  };

  const replyTicket = async (id: string, status: string) => {
    const message = replyMap[id] || '';
    if (!message.trim()) return;
    try {
      await apiFetch(`/api/super-admin/support-tickets/${id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message, status }),
      });
      setReplyMap((p) => ({ ...p, [id]: '' }));
      setBanner('Ticket reply saved.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reply failed.');
    }
  };

  const startMfaSetup = async () => {
    const res = await apiFetch<{ secret: string; qrDataUrl: string }>('/api/auth/mfa/setup', {
      method: 'POST',
    });
    setMfaSetup(res);
  };

  const enableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ enabled: boolean; backupCodes: string[] }>('/api/auth/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: mfaCode }),
      });
      setBackupCodes(res.backupCodes);
      setMfaSetup(null);
      setBanner('MFA enabled on your Super Admin account.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid MFA code.');
    }
  };

  const updateSuperAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setBanner('');
    setError('');
    setCredBusy(true);
    try {
      const res = await apiFetch<{ message: string; user: AuthUser }>(
        '/api/auth/super-admin-credentials',
        {
          method: 'PUT',
          body: JSON.stringify(credForm),
        }
      );
      setBanner(res.message);
      setCredForm((p) => ({ ...p, currentPassword: '', newPassword: '' }));
      onUserUpdated?.(res.user);
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credentials.');
    } finally {
      setCredBusy(false);
    }
  };

  const navItems: Array<{ id: SuperTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Platform Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'schools', label: 'Schools & Trials', icon: <Building2 className="w-4 h-4" /> },
    { id: 'plans', label: 'Subscription Plans', icon: <Package className="w-4 h-4" /> },
    { id: 'pricing', label: 'Pricing & Offers', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'custom', label: 'Custom Projects', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'tickets', label: 'Support Tickets', icon: <LifeBuoy className="w-4 h-4" /> },
    { id: 'audit', label: 'Security & Audit', icon: <ShieldAlert className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-[#102846] text-white shrink-0">
        <div className="p-5 border-b border-white/10">
          <div className="bg-white rounded-lg px-3 py-2 inline-block">
            <BrandLogo size="sm" />
          </div>
          <div className="mt-3 text-xs text-slate-300">NexaFlow Super Admin</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === item.id
                  ? 'bg-[#148D82] text-white'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10 text-xs space-y-2">
          <div className="text-slate-300 truncate">{user.email}</div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNav((p) => !p)}
              className="lg:hidden p-2 rounded-lg border border-slate-200"
            >
              {mobileNav ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="text-sm font-semibold text-[#102846]">
              NexaFlow Technologies / {navItems.find((n) => n.id === tab)?.label}
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            {onToggleCandlelight && (
              <CandlelightToggle enabled={candlelight} onToggle={onToggleCandlelight} />
            )}
            <button
              type="button"
              onClick={() => void loadAll()}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
            >
              Refresh
            </button>
          </div>
        </header>

        {mobileNav && (
          <div className="lg:hidden bg-[#102846] text-white p-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  setMobileNav(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm"
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={onLogout}
              className="w-full text-left px-3 py-2 text-sm text-amber-300"
            >
              Sign Out
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
          {banner && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {banner}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          {tab === 'overview' && overview && (
            <div className="space-y-8">
              <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-[#102846]">
                    Full Platform &amp; All-Plans Access
                  </h2>
                  <p className="text-xs text-[#64748B] mt-1">
                    Enter any school workspace with NexaSua Core, Complete, Finance, Report Cards,
                    Admissions, Staff HR, and Timetables unlocked, or configure plans directly.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void launchAllPlansWorkspace()}
                    className="rounded-lg bg-[#148D82] hover:bg-[#10766c] px-4 py-2 text-xs font-semibold text-white"
                  >
                    Open Full School Workspace (All Plans)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('schools')}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                  >
                    Schools &amp; Plan Assignment
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('plans')}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                  >
                    Manage Subscription Plans
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('pricing')}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                  >
                    Pricing Bands &amp; Offers
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('custom')}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                  >
                    Custom Projects
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  ['Registered Schools', overview.metrics.totalSchools],
                  ['Pending Applications', overview.metrics.pendingSchools],
                  ['Approved Schools', overview.metrics.approvedSchools],
                  ['Active Subscriptions', overview.metrics.activeSubs],
                  ['Trial Subscriptions', overview.metrics.trialSubs],
                  ['Core / Complete', `${overview.metrics.coreSubs} / ${overview.metrics.completeSubs}`],
                  ['Registered Students', overview.metrics.totalStudents],
                  ['Subscription Revenue', formatGhs(overview.metrics.subscriptionRevenueGhs)],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-[#64748B]">{label}</div>
                    <div className="text-2xl font-bold text-[#102846] font-mono tabular-nums mt-1">
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              {/* Integration Health */}
              <div className="bg-white border border-slate-200 rounded-xl p-6">
                <h2 className="text-base font-bold text-[#102846] mb-4">
                  Platform Integrations & System Health
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.values(overview.integrations).map((intg) => (
                    <div key={intg.name} className="border border-slate-200 rounded-lg p-4">
                      <div className="text-sm font-semibold text-[#102846]">{intg.name}</div>
                      <div className="text-xs font-mono mt-1 text-[#148D82]">{intg.status}</div>
                      <div className="text-xs text-[#64748B] mt-1">{intg.detail}</div>
                    </div>
                  ))}
                  <div className="border border-slate-200 rounded-lg p-4">
                    <div className="text-sm font-semibold text-[#102846]">Runtime Health</div>
                    <div className="text-xs font-mono mt-1 text-[#102846]">
                      DB Ping: {overview.systemHealth.database.ok ? `${overview.systemHealth.database.latencyMs}ms` : 'Offline'}
                    </div>
                    <div className="text-xs text-[#64748B] mt-1">
                      Uptime: {overview.systemHealth.uptimeSeconds}s · RSS: {overview.systemHealth.memoryMb} MB
                    </div>
                  </div>
                </div>
              </div>

              {/* Super Admin MFA Security */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-bold text-[#102846]">
                      Two-Factor Authentication (TOTP MFA)
                    </h2>
                    <p className="text-xs text-[#64748B]">
                      Status: {user.mfaEnabled ? 'Enabled' : 'Not yet enabled — recommended for Super Admin'}
                    </p>
                  </div>
                  {!user.mfaEnabled && !mfaSetup && (
                    <button
                      type="button"
                      onClick={() => void startMfaSetup()}
                      className="rounded-lg bg-[#102846] px-4 py-2 text-xs font-semibold text-white"
                    >
                      Configure MFA
                    </button>
                  )}
                </div>

                {mfaSetup && (
                  <form onSubmit={enableMfa} className="flex flex-col sm:flex-row gap-6 items-start pt-2">
                    <img src={mfaSetup.qrDataUrl} alt="MFA QR Code" className="w-36 h-36 border border-slate-200 rounded-lg" />
                    <div className="space-y-3">
                      <div className="text-xs text-[#64748B]">
                        Scan with Google Authenticator or Authy. Manual key:{' '}
                        <span className="font-mono text-[#102846]">{mfaSetup.secret}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          required
                          placeholder="6-digit code"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono w-36"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white"
                        >
                          Verify & Activate
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {backupCodes.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs">
                    <strong>Save these MFA backup codes securely:</strong>{' '}
                    <span className="font-mono">{backupCodes.join('  ·  ')}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'schools' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#102846]">Registered & Pending Schools</h2>
                <button
                  type="button"
                  onClick={() => setShowCreateSchool((p) => !p)}
                  className="rounded-lg bg-[#148D82] px-4 py-2 text-xs font-semibold text-white"
                >
                  {showCreateSchool ? 'Cancel' : 'Register School Directly'}
                </button>
              </div>

              {showCreateSchool && (
                <form
                  onSubmit={createSchoolDirect}
                  className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-4"
                >
                  <input
                    required
                    placeholder="School Name"
                    value={newSchool.schoolName}
                    onChange={(e) => setNewSchool({ ...newSchool, schoolName: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Region"
                    value={newSchool.region}
                    onChange={(e) => setNewSchool({ ...newSchool, region: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Town"
                    value={newSchool.town}
                    onChange={(e) => setNewSchool({ ...newSchool, town: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Address"
                    value={newSchool.address}
                    onChange={(e) => setNewSchool({ ...newSchool, address: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="email"
                    placeholder="School Email"
                    value={newSchool.schoolEmail}
                    onChange={(e) => setNewSchool({ ...newSchool, schoolEmail: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="School Phone"
                    value={newSchool.schoolPhone}
                    onChange={(e) => setNewSchool({ ...newSchool, schoolPhone: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    placeholder="Admin Name"
                    value={newSchool.adminName}
                    onChange={(e) => setNewSchool({ ...newSchool, adminName: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Admin Email"
                    value={newSchool.adminEmail}
                    onChange={(e) => setNewSchool({ ...newSchool, adminEmail: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    required
                    type="password"
                    minLength={8}
                    placeholder="Admin Password"
                    value={newSchool.adminPassword}
                    onChange={(e) => setNewSchool({ ...newSchool, adminPassword: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={newSchool.selectedPlan}
                    onChange={(e) => setNewSchool({ ...newSchool, selectedPlan: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                  >
                    <option value="CORE">NexaSua Core</option>
                    <option value="COMPLETE">NexaSua Complete</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={newSchool.studentPopulation}
                    onChange={(e) =>
                      setNewSchool({ ...newSchool, studentPopulation: Number(e.target.value) || 1 })
                    }
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                  <input
                    type="date"
                    value={newSchool.termVacationDate}
                    onChange={(e) =>
                      setNewSchool({ ...newSchool, termVacationDate: e.target.value })
                    }
                    title="Term Vacation Date (portal closes automatically on this date)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Create & Approve School
                  </button>
                </form>
              )}

              {schools.length === 0 ? (
                <EmptyState
                  title="No schools registered yet"
                  description="School applications submitted from the public website or created directly will appear here for review."
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-[#FBF8F1] text-xs font-semibold text-[#102846]">
                        <th className="py-3 px-4">School & Code</th>
                        <th className="py-3 px-4">Location</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Plan & Sub</th>
                        <th className="py-3 px-4">Term Vacation</th>
                        <th className="py-3 px-4 text-right">Students</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {schools.map((s) => {
                        const currentVac =
                          vacationEdit[s._id] ??
                          s.subscription?.termVacationDate ??
                          s.termVacationDate ??
                          '';
                        return (
                          <tr key={s._id}>
                            <td className="py-3 px-4">
                              <div className="font-semibold text-[#102846]">{s.name}</div>
                              <div className="text-xs font-mono text-[#64748B]">{s.schoolCode}</div>
                            </td>
                            <td className="py-3 px-4 text-xs text-[#64748B]">
                              {s.town}, {s.region}
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold text-[#102846]">
                              {s.status}
                            </td>
                            <td className="py-3 px-4 text-xs text-[#64748B]">
                              {s.subscription
                                ? `${s.subscription.plan} · ${s.subscription.status}`
                                : `${s.requestedPlan} (Pending)`}
                            </td>
                            <td className="py-3 px-4 text-xs">
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="date"
                                  value={currentVac}
                                  onChange={(e) =>
                                    setVacationEdit((prev) => ({
                                      ...prev,
                                      [s._id]: e.target.value,
                                    }))
                                  }
                                  className="rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void overrideSubscription(
                                      s._id,
                                      s.subscription?.plan || 'COMPLETE',
                                      s.subscription?.status || 'ACTIVE',
                                      currentVac
                                    )
                                  }
                                  className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                                >
                                  Save
                                </button>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {s.actualStudentCount} / {s.studentPopulationEstimate}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => void enterSchoolWorkspace(s._id)}
                                className="text-xs font-semibold text-[#148D82] hover:underline"
                              >
                                Open Workspace
                              </button>
                              {s.status === 'PENDING' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void schoolAction(s._id, 'approve')}
                                    className="text-xs font-semibold text-[#148D82] hover:underline"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void schoolAction(s._id, 'reject')}
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {s.status === 'APPROVED' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => void overrideSubscription(s._id, 'CORE', 'ACTIVE')}
                                    className="text-xs font-semibold text-[#102846] hover:underline"
                                  >
                                    Set Core
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void overrideSubscription(s._id, 'COMPLETE', 'ACTIVE')
                                    }
                                    className="text-xs font-semibold text-[#102846] hover:underline"
                                  >
                                    Set Complete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void schoolAction(s._id, 'suspend')}
                                    className="text-xs font-semibold text-red-600 hover:underline"
                                  >
                                    Suspend
                                  </button>
                                </>
                              )}
                              {s.status === 'SUSPENDED' && (
                                <button
                                  type="button"
                                  onClick={() => void schoolAction(s._id, 'reactivate')}
                                  className="text-xs font-semibold text-[#148D82] hover:underline"
                                >
                                  Reactivate
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'plans' && config && (
            <form onSubmit={savePlanCatalog} className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-[#102846]">
                    Subscription Plans Management
                  </h2>
                  <p className="text-xs text-[#64748B] mt-1">
                    Configure plan titles, pricing labels, term durations, included features, and
                    visibility across the public NexaSua website and school billing portals.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const current = config.planCatalog || [];
                    const nextCode = `TIER_${current.length + 1}`;
                    setConfig({
                      ...config,
                      planCatalog: [
                        ...current,
                        {
                          code: nextCode,
                          name: 'NexaSua Enterprise Tier',
                          tagline: 'Multi-campus or specialized school package.',
                          durationLabel: 'Per Term (120 Days)',
                          durationDays: 120,
                          startingPriceLabel: 'From GH₵1,200 / term',
                          features: ['Full Academic & Finance Modules', 'Priority Support'],
                          isFeatured: false,
                          isActive: true,
                        },
                      ],
                    });
                  }}
                  className="rounded-lg border border-[#148D82] text-[#148D82] hover:bg-[#148D82] hover:text-white px-4 py-2 text-xs font-semibold transition-colors"
                >
                  + Add Custom Plan Tier
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {(config.planCatalog || []).map((plan, idx) => {
                  const updatePlan = (patch: Partial<PlanCatalogItem>) => {
                    const next = [...(config.planCatalog || [])];
                    next[idx] = { ...plan, ...patch };
                    setConfig({ ...config, planCatalog: next });
                  };
                  const isBuiltIn = plan.code === 'CORE' || plan.code === 'COMPLETE';
                  return (
                    <div
                      key={`${plan.code}-${idx}`}
                      className={`bg-white rounded-xl p-6 space-y-4 border ${
                        plan.isFeatured ? 'border-2 border-[#148D82]' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-mono text-xs font-bold text-[#148D82]">
                          CODE: {plan.code}
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={plan.isFeatured}
                              onChange={(e) => updatePlan({ isFeatured: e.target.checked })}
                              className="accent-[#148D82]"
                            />
                            <span>Featured</span>
                          </label>
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={plan.isActive}
                              onChange={(e) => updatePlan({ isActive: e.target.checked })}
                              className="accent-[#148D82]"
                            />
                            <span>Active</span>
                          </label>
                          {!isBuiltIn && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = (config.planCatalog || []).filter((_, i) => i !== idx);
                                setConfig({ ...config, planCatalog: next });
                              }}
                              className="text-red-600 font-semibold hover:underline"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#102846] mb-1">
                            Plan Name *
                          </label>
                          <input
                            required
                            value={plan.name}
                            onChange={(e) => updatePlan({ name: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#102846] mb-1">
                            Plan Code *
                          </label>
                          <input
                            required
                            disabled={isBuiltIn}
                            value={plan.code}
                            onChange={(e) =>
                              updatePlan({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })
                            }
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono disabled:bg-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#102846] mb-1">
                            Starting Price Label *
                          </label>
                          <input
                            required
                            value={plan.startingPriceLabel}
                            onChange={(e) => updatePlan({ startingPriceLabel: e.target.value })}
                            placeholder="From GH₵350 / term"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-semibold text-[#102846] mb-1">
                              Duration Label *
                            </label>
                            <input
                              required
                              value={plan.durationLabel}
                              onChange={(e) => updatePlan({ durationLabel: e.target.value })}
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#102846] mb-1">
                              Duration (Days) *
                            </label>
                            <input
                              required
                              type="number"
                              min={1}
                              max={1095}
                              value={plan.durationDays}
                              onChange={(e) =>
                                updatePlan({ durationDays: Math.max(1, Number(e.target.value) || 1) })
                              }
                              className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#102846] mb-1">
                          Tagline / Summary *
                        </label>
                        <input
                          required
                          value={plan.tagline}
                          onChange={(e) => updatePlan({ tagline: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#102846] mb-1">
                          Included Features (one per line) *
                        </label>
                        <textarea
                          rows={5}
                          value={plan.features.join('\n')}
                          onChange={(e) =>
                            updatePlan({
                              features: e.target.value
                                .split('\n')
                                .map((line) => line.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs leading-relaxed"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <button
                  type="submit"
                  disabled={savingPlans}
                  className="rounded-lg bg-[#148D82] hover:bg-[#10766c] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {savingPlans ? 'Saving Plans...' : 'Save Subscription Plans'}
                </button>
              </div>
            </form>
          )}

          {tab === 'pricing' && config && (
            <div className="space-y-6">
              <form onSubmit={saveConfig} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
                <h2 className="text-lg font-bold text-[#102846]">
                  Subscription Rules & Ghana Pricing Bands
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#102846] mb-1">
                      Trial Days
                    </label>
                    <input
                      type="number"
                      value={config.trialDays}
                      onChange={(e) => setConfig({ ...config, trialDays: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#102846] mb-1">
                      3-Term Prepay Discount (%)
                    </label>
                    <input
                      type="number"
                      value={config.threeTermDiscountPercent}
                      onChange={(e) =>
                        setConfig({ ...config, threeTermDiscountPercent: Number(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#102846] mb-1">
                      Grace Period Days
                    </label>
                    <input
                      type="number"
                      value={config.gracePeriodDays}
                      onChange={(e) =>
                        setConfig({ ...config, gracePeriodDays: Number(e.target.value) })
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#102846] mb-1">
                    Global Platform Announcement Banner (optional)
                  </label>
                  <input
                    value={config.platformAnnouncement}
                    onChange={(e) => setConfig({ ...config, platformAnnouncement: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="space-y-3">
                  {config.pricingBands.map((band, idx) => (
                    <div
                      key={band.code}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center border border-slate-200 rounded-lg p-3"
                    >
                      <div className="text-sm font-semibold text-[#102846]">{band.label}</div>
                      <div>
                        <label className="text-xs text-[#64748B]">Core (GH₵)</label>
                        <input
                          disabled={band.isCustomQuote}
                          type="number"
                          value={band.corePriceGhs ?? ''}
                          onChange={(e) => {
                            const next = [...config.pricingBands];
                            next[idx] = { ...band, corePriceGhs: Number(e.target.value) };
                            setConfig({ ...config, pricingBands: next });
                          }}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm font-mono disabled:bg-slate-100"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-[#64748B]">Complete (GH₵)</label>
                        <input
                          disabled={band.isCustomQuote}
                          type="number"
                          value={band.completePriceGhs ?? ''}
                          onChange={(e) => {
                            const next = [...config.pricingBands];
                            next[idx] = { ...band, completePriceGhs: Number(e.target.value) };
                            setConfig({ ...config, pricingBands: next });
                          }}
                          className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm font-mono disabled:bg-slate-100"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="submit"
                  className="rounded-lg bg-[#148D82] px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Save Pricing Configuration
                </button>
              </form>

              <form onSubmit={createPromo} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold text-[#102846]">Create Promotional Offer</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    required
                    placeholder="Code (e.g. TERM1GH)"
                    value={promo.code}
                    onChange={(e) => setPromo({ ...promo, code: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                  />
                  <input
                    required
                    placeholder="Description"
                    value={promo.description}
                    onChange={(e) => setPromo({ ...promo, description: e.target.value })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={promo.discountPercent}
                    onChange={(e) => setPromo({ ...promo, discountPercent: Number(e.target.value) })}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white"
                  >
                    Add Offer
                  </button>
                </div>
                {config.promotionalOffers.length > 0 && (
                  <div className="text-xs text-[#64748B] space-y-1 pt-2">
                    {config.promotionalOffers.map((o) => (
                      <div key={o.code} className="font-mono">
                        {o.code} · {o.discountPercent}% off · {o.description}
                      </div>
                    ))}
                  </div>
                )}
              </form>
            </div>
          )}

          {tab === 'custom' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#102846]">NexaSua Custom Project Requests</h2>
              {customProjects.length === 0 ? (
                <EmptyState
                  title="No custom project inquiries yet"
                  description="Inquiries submitted through the NexaSua Custom page will appear here for scoping and quotations."
                />
              ) : (
                customProjects.map((p) => (
                  <div key={p._id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="font-bold text-[#102846]">
                          {p.schoolName} ({p.referenceNumber})
                        </div>
                        <div className="text-xs text-[#64748B]">
                          {p.contactPerson} · {p.email} · {p.phone} · {p.location} · Budget:{' '}
                          {p.budgetRange}
                        </div>
                      </div>
                      <select
                        value={p.status}
                        onChange={(e) => void updateProject(p._id, e.target.value, p.quotationAmountGhs)}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold bg-white"
                      >
                        {[
                          'NEW',
                          'REQUIREMENTS_REVIEW',
                          'CONSULTATION',
                          'QUOTATION_PREPARED',
                          'QUOTATION_APPROVED',
                          'DEVELOPMENT',
                          'TESTING',
                          'DEPLOYMENT',
                          'MAINTENANCE',
                          'COMPLETED',
                        ].map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-sm text-[#64748B]">{p.requirements || 'No extra notes.'}</p>
                    <div className="text-xs text-[#102846]">
                      Features: {p.requestedFeatures?.join(' · ') || 'Standard custom package'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'tickets' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-[#102846]">Platform Support Tickets</h2>
              {tickets.length === 0 ? (
                <EmptyState
                  title="No support tickets yet"
                  description="Contact form inquiries and school support tickets will appear here."
                />
              ) : (
                tickets.map((t) => (
                  <div key={t._id} className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#64748B]">
                      <span className="font-mono font-semibold text-[#102846]">{t.ticketNumber}</span>
                      <span>
                        {t.status} · {formatGhanaDate(t.createdAt)}
                      </span>
                    </div>
                    <div className="font-bold text-[#102846]">{t.subject}</div>
                    <div className="text-xs text-[#64748B]">
                      From: {t.contactName} ({t.contactEmail})
                    </div>
                    <p className="text-sm text-[#102846]">{t.description}</p>
                    <div className="flex gap-2 pt-2">
                      <input
                        placeholder="Write response..."
                        value={replyMap[t._id] || ''}
                        onChange={(e) => setReplyMap({ ...replyMap, [t._id]: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void replyTicket(t._id, 'RESOLVED')}
                        className="rounded-lg bg-[#148D82] px-4 py-1.5 text-xs font-semibold text-white"
                      >
                        Reply & Resolve
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'audit' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h2 className="text-base font-bold text-[#102846]">
                    Super Admin Credentials (Email &amp; Password)
                  </h2>
                  <p className="text-xs text-[#64748B] mt-1">
                    {superAdminManagedBySecrets
                      ? `Currently managed via Environment Secrets (SUPER_ADMIN_EMAIL = ${user.email}, SUPER_ADMIN_PASSWORD = configured). You can update those secrets anytime in AI Studio -> Settings -> Secrets and sign in immediately with the new credentials.`
                      : 'Update your Super Admin email address or password anytime below, or set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in Environment Secrets.'}
                  </p>
                </div>

                {!superAdminManagedBySecrets && (
                  <form
                    onSubmit={updateSuperAdminCredentials}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2"
                  >
                    <div>
                      <label className="block text-xs font-semibold text-[#102846] mb-1">
                        Full Name
                      </label>
                      <input
                        required
                        value={credForm.fullName}
                        onChange={(e) => setCredForm({ ...credForm, fullName: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#102846] mb-1">
                        Super Admin Email
                      </label>
                      <input
                        required
                        type="email"
                        value={credForm.newEmail}
                        onChange={(e) => setCredForm({ ...credForm, newEmail: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#102846] mb-1">
                        Current Password *
                      </label>
                      <input
                        required
                        type="password"
                        value={credForm.currentPassword}
                        onChange={(e) =>
                          setCredForm({ ...credForm, currentPassword: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#102846] mb-1">
                        New Password (optional, min 10 chars)
                      </label>
                      <input
                        type="password"
                        minLength={10}
                        value={credForm.newPassword}
                        onChange={(e) => setCredForm({ ...credForm, newPassword: e.target.value })}
                        placeholder="Leave blank to keep current password"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        disabled={credBusy}
                        className="rounded-lg bg-[#102846] px-5 py-2 text-xs font-semibold text-white hover:bg-[#193a63] disabled:opacity-60"
                      >
                        {credBusy ? 'Saving...' : 'Update Super Admin Credentials'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-[#FBF8F1] text-[#102846]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Resource</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {auditLogs.map((l) => (
                      <tr key={l._id}>
                        <td className="py-2.5 px-4 font-mono text-[#64748B]">
                          {new Date(l.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#102846]">
                          {l.action}
                        </td>
                        <td className="py-2.5 px-4 text-[#64748B]">
                          {l.userEmail || 'System'} ({l.userRole || '—'})
                        </td>
                        <td className="py-2.5 px-4 text-[#64748B]">
                          {l.resourceType} · {l.resourceId}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
