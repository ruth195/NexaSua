import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ClipboardCheck,
  CreditCard,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Package,
  Palette,
  Settings,
  X,
} from 'lucide-react';
import { BrandLogo, formatGhs } from '../components/BrandLogo';
import { CandlelightToggle } from '../components/CandlelightToggle';
import { PWAInstallButton } from '../components/PWAInstallButton';
import {
  getSubscriptionCountdownState,
  SubscriptionStatusCard,
} from '../components/SubscriptionStatusCard';
import { apiFetch } from '../lib/api';
import { resolveDashboardSettings, resolveDashboardTheme } from '../lib/dashboardTheme';
import type {
  AuthUser,
  PlanCatalogItem,
  PricingBand,
  SchoolSummary,
  SubscriptionSummary,
  UserRole,
} from '../types/nexasua';
import {
  AcademicAnalyticsPanel,
  AcademicsSetupPanel,
  ApprovalsAndReportsPanel,
  AttendancePanel,
  MarksEntryPanel,
} from './workspace/AcademicsPanel';
import {
  CompletePlanGate,
  FinancePanel,
  OperationsCompletePanel,
} from './workspace/CompleteModulesPanel';
import { StudentParentPortalPanel } from './workspace/StudentParentPortalPanel';
import { SettingsAndBillingPanel, StudentsPanel } from './workspace/StudentsAndSettingsPanel';

type WorkspaceTab =
  | 'overview'
  | 'plans'
  | 'students'
  | 'academics'
  | 'marks'
  | 'reports'
  | 'attendance'
  | 'analytics'
  | 'finance'
  | 'operations'
  | 'settings';

export function SchoolWorkspace({
  user,
  school,
  subscription,
  candlelight = false,
  onToggleCandlelight,
  onRefreshAuth,
  onExitAdminWorkspace,
  onLogout,
}: {
  user: AuthUser;
  school: SchoolSummary | null;
  subscription: SubscriptionSummary | null;
  candlelight?: boolean;
  onToggleCandlelight?: () => void;
  onRefreshAuth: () => void;
  onExitAdminWorkspace?: () => void;
  onLogout: () => void;
}) {
  const isAdminUser = user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN';
  const [planPreview, setPlanPreview] = useState<'ALL' | 'CORE' | 'COMPLETE'>('ALL');
  const [rolePreview, setRolePreview] = useState<'AUTO' | UserRole>('AUTO');
  const effectiveRole: UserRole = isAdminUser && rolePreview !== 'AUTO' ? rolePreview : user.role;
  const isStudentOrParent = effectiveRole === 'STUDENT' || effectiveRole === 'PARENT';
  const dash = resolveDashboardSettings(school?.dashboardSettings);
  const dashTheme = resolveDashboardTheme(dash.primaryColor, dash.accentColor);
  const hasManualTab = useRef(false);
  const [tab, setTab] = useState<WorkspaceTab>(() => dash.defaultLandingTab || 'overview');
  const [mobileNav, setMobileNav] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [planCatalog, setPlanCatalog] = useState<PlanCatalogItem[]>([]);
  const [pricingBands, setPricingBands] = useState<PricingBand[]>([]);
  const [verifyBanner, setVerifyBanner] = useState('');
  const [vacInput, setVacInput] = useState('');
  const [vacBusy, setVacBusy] = useState(false);
  const [vacErr, setVacErr] = useState('');
  const [vacMsg, setVacMsg] = useState('');

  const selectTab = (next: WorkspaceTab) => {
    hasManualTab.current = true;
    setTab(next);
  };

  const effectiveSubscription: SubscriptionSummary | null = subscription
    ? {
        ...subscription,
        plan:
          planPreview === 'CORE'
            ? 'CORE'
            : planPreview === 'COMPLETE' || isAdminUser
              ? 'COMPLETE'
              : subscription.plan,
      }
    : null;

  const todayAccra = new Date().toISOString().slice(0, 10);
  const vacationDate = subscription?.termVacationDate || school?.termVacationDate || '';
  const portalClosed =
    user.role !== 'SUPER_ADMIN' &&
    (subscription?.status === 'EXPIRED' ||
      subscription?.status === 'SUSPENDED' ||
      Boolean(vacationDate && todayAccra >= vacationDate));

  const saveQuickVacationDate = async (e: React.FormEvent) => {
    e.preventDefault();
    setVacErr('');
    setVacMsg('');
    if (!vacInput) {
      setVacErr('Please select your school vacation date.');
      return;
    }
    setVacBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/school/term-vacation-date', {
        method: 'PUT',
        body: JSON.stringify({ termVacationDate: vacInput }),
      });
      setVacMsg(res.message);
      onRefreshAuth();
    } catch (err) {
      setVacErr(err instanceof Error ? err.message : 'Unable to save vacation date.');
    } finally {
      setVacBusy(false);
    }
  };

  const loadOverview = async () => {
    if (portalClosed) return;
    const ov = await apiFetch('/api/school/overview').catch(() => null);
    setOverview(ov);
    if (isAdminUser) {
      apiFetch<{ planCatalog?: PlanCatalogItem[]; pricingBands?: PricingBand[] }>(
        '/api/school/subscription'
      )
        .then((subRes) => {
          if (subRes.planCatalog) setPlanCatalog(subRes.planCatalog);
          if (subRes.pricingBands) setPricingBands(subRes.pricingBands);
        })
        .catch(() => null);
    }
  };

  useEffect(() => {
    void loadOverview();

    const params = new URLSearchParams(window.location.search);
    const subVerify = params.get('subVerify');
    const feeVerify = params.get('feeVerify');

    if (subVerify) {
      apiFetch('/api/school/subscription/verify-payment', {
        method: 'POST',
        body: JSON.stringify({ reference: subVerify }),
      })
        .then(() => {
          setVerifyBanner('Subscription payment verified and activated.');
          onRefreshAuth();
        })
        .catch(() => null);
    }
    if (feeVerify) {
      apiFetch('/api/complete/payments/paystack/verify', {
        method: 'POST',
        body: JSON.stringify({ reference: feeVerify }),
      })
        .then(() => setVerifyBanner('School fee payment verified and receipt issued.'))
        .catch(() => null);
    }
  }, []);

  const navItems: Array<{ id: WorkspaceTab; label: string; icon: React.ReactNode; roles: string[] }> = [
    {
      id: 'overview',
      label: 'Dashboard',
      icon: <LayoutDashboard className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'BURSAR', 'ADMIN_STAFF', 'STUDENT', 'PARENT'],
    },
    {
      id: 'students',
      label: 'Students & Guardians',
      icon: <GraduationCap className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'],
    },
    {
      id: 'academics',
      label: 'Classes, Staff & Setup',
      icon: <BookOpen className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'],
    },
    {
      id: 'marks',
      label: 'Marks Entry',
      icon: <FileSpreadsheet className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
    },
    {
      id: 'reports',
      label: 'Approvals & Report Cards',
      icon: <ClipboardCheck className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER'],
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: <CalendarCheck className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
    },
    {
      id: 'analytics',
      label: 'Academic Analytics',
      icon: <BarChart3 className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
    },
    {
      id: 'finance',
      label: 'School Fees & Finance',
      icon: <CreditCard className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR'],
    },
    {
      id: 'operations',
      label: 'Admissions, Staff & Timetable',
      icon: <Layers className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF', 'CLASS_TEACHER', 'SUBJECT_TEACHER'],
    },
    {
      id: 'settings',
      label: 'Settings & Subscription',
      icon: <Settings className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR'],
    },
    {
      id: 'plans',
      label: 'All Plans & Tiers',
      icon: <Package className="w-4 h-4" />,
      roles: ['SCHOOL_ADMIN'],
    },
  ];

  const allowedTabs =
    isAdminUser && rolePreview === 'AUTO'
      ? navItems
      : navItems.filter((item) => item.roles.includes(effectiveRole));

  useEffect(() => {
    if (
      !hasManualTab.current &&
      dash.defaultLandingTab &&
      allowedTabs.some((t) => t.id === dash.defaultLandingTab)
    ) {
      setTab(dash.defaultLandingTab);
    }
  }, [dash.defaultLandingTab, school?.id, school?._id]);

  const countdown = getSubscriptionCountdownState(effectiveSubscription, school);
  const showSubscriptionOnOverview =
    dash.showSubscriptionBanner || countdown.isApproaching || countdown.isClosedOrExpired;

  const onboardingList = school?.onboardingSteps
    ? [
        ['School Profile Completed', school.onboardingSteps.profileCompleted],
        ['Academic Year Set', school.onboardingSteps.academicYearSet],
        ['Current Term Set', school.onboardingSteps.termSet],
        ['Classes Created', school.onboardingSteps.classesCreated],
        ['Subjects Configured', school.onboardingSteps.subjectsConfigured],
        ['Teachers Invited', school.onboardingSteps.teachersInvited],
        ['Students Enrolled', school.onboardingSteps.studentsEnrolled],
      ]
    : [];

  return (
    <div className="min-h-screen bg-[#FBF8F1] flex">
      {/* Sidebar */}
      <aside className={`hidden lg:flex w-64 flex-col ${dashTheme.sidebarBgClass} text-white shrink-0 transition-colors`}>
        <div className="p-5 border-b border-white/10 space-y-2">
          <div className="bg-white rounded-lg px-3 py-2 inline-flex items-center gap-2">
            {dash.showSchoolLogoInSidebar && school?.logoDataUrl ? (
              <img
                src={school.logoDataUrl}
                alt={`${school.name} crest`}
                className="w-7 h-7 rounded object-cover shrink-0"
              />
            ) : null}
            <BrandLogo size="sm" />
          </div>
          <div className="text-sm font-bold text-white truncate pt-1">
            {school?.name || 'School Workspace'}
          </div>
          {dash.showSchoolLogoInSidebar && school?.motto && (
            <div className="text-[11px] italic text-slate-200 truncate">
              &ldquo;{school.motto}&rdquo;
            </div>
          )}
          <div className="text-xs font-mono text-slate-300">
            {school?.schoolCode} · {subscription?.plan || 'CORE'} ({subscription?.status || 'TRIAL'})
          </div>
          {vacationDate && (
            <div className="text-[11px] font-mono text-slate-300">
              Vacates: {vacationDate}
            </div>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {allowedTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                tab === item.id
                  ? `${dashTheme.accentBgClass} text-white`
                  : 'text-slate-200 hover:bg-white/10'
              }`}
            >
              {item.icon}
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs space-y-2">
          <div className="font-semibold text-white truncate">{user.fullName}</div>
          <div className="text-slate-300 truncate">{user.role.replace(/_/g, ' ')}</div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 sm:h-16 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNav((p) => !p)}
              className="lg:hidden inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 shrink-0 min-w-[42px] min-h-[42px]"
              aria-label="Open workspace menu"
            >
              {mobileNav ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="text-xs sm:text-sm font-semibold text-[#102846] truncate">
              {school?.name} / {allowedTabs.find((t) => t.id === tab)?.label || 'Dashboard'}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <PWAInstallButton compact />
            {onToggleCandlelight && (
              <CandlelightToggle enabled={candlelight} onToggle={onToggleCandlelight} />
            )}
            <div className="text-xs text-[#64748B] hidden md:block whitespace-nowrap">
              {user.fullName} · {user.role.replace(/_/g, ' ')}
            </div>
          </div>
        </header>

        {mobileNav && (
          <div className={`lg:hidden ${dashTheme.sidebarBgClass} text-white p-3 space-y-1 max-h-[calc(100vh-7rem)] overflow-y-auto`}>
            {allowedTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  selectTab(item.id);
                  setMobileNav(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl text-sm ${
                  tab === item.id ? `${dashTheme.accentBgClass} text-white font-semibold` : 'text-slate-200'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={onLogout}
              className="w-full text-left px-3.5 py-2.5 min-h-[44px] text-sm text-amber-300"
            >
              Sign Out
            </button>
          </div>
        )}

        <main className="flex-1 p-3 sm:p-6 lg:p-8 pb-20 lg:pb-8 max-w-7xl w-full mx-auto space-y-5 sm:space-y-6">
          {isAdminUser && school && (
            <div className="rounded-xl bg-[#102846] text-white px-3.5 sm:px-4 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="text-xs space-y-0.5">
                <div>
                  <span className="font-bold text-[#E2A83B]">
                    {user.role === 'SUPER_ADMIN' ? 'Super Admin Full Access' : 'Admin Full Access'}
                  </span>{' '}
                  · All plans and dashboards unlocked for <strong className="text-white">{school.name}</strong>{' '}
                  <span className="text-slate-300 font-mono">
                    (School Plan: {subscription?.plan || 'COMPLETE'} · Viewing:{' '}
                    {planPreview === 'ALL' ? 'All Plans' : planPreview})
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
                <select
                  aria-label="Preview Plan Tier"
                  value={planPreview}
                  onChange={(e) => setPlanPreview(e.target.value as 'ALL' | 'CORE' | 'COMPLETE')}
                  className="w-full sm:w-auto rounded-lg border border-white/25 bg-[#193a63] px-2.5 py-2 sm:py-1.5 text-xs font-semibold text-white"
                >
                  <option value="ALL">Plan View: All Plans Unlocked</option>
                  <option value="CORE">Plan View: NexaSua Core</option>
                  <option value="COMPLETE">Plan View: NexaSua Complete</option>
                </select>

                <select
                  aria-label="Preview Role Dashboard"
                  value={rolePreview}
                  onChange={(e) => {
                    const next = e.target.value as 'AUTO' | UserRole;
                    setRolePreview(next);
                    setTab('overview');
                  }}
                  className="rounded-lg border border-white/25 bg-[#193a63] px-2.5 py-1.5 text-xs font-semibold text-white"
                >
                  <option value="AUTO">Dashboard: Full Admin View</option>
                  <option value="HEADTEACHER">Dashboard: Headteacher</option>
                  <option value="CLASS_TEACHER">Dashboard: Class Teacher</option>
                  <option value="BURSAR">Dashboard: Bursar / Finance</option>
                  <option value="STUDENT">Dashboard: Student Portal</option>
                  <option value="PARENT">Dashboard: Parent / Guardian</option>
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setRolePreview('AUTO');
                    selectTab('plans');
                  }}
                  className="rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                >
                  All Plans
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setRolePreview('AUTO');
                    selectTab('settings');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                >
                  <Palette className="w-3.5 h-3.5" /> Customize Dashboard
                </button>

                {user.role === 'SUPER_ADMIN' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = school.id || school._id;
                        if (!targetId) return;
                        const nextPlan = subscription?.plan === 'CORE' ? 'COMPLETE' : 'CORE';
                        void apiFetch(`/api/super-admin/schools/${targetId}/subscription`, {
                          method: 'PUT',
                          body: JSON.stringify({ plan: nextPlan, status: 'ACTIVE', periodDays: 365 }),
                        }).then(() => onRefreshAuth());
                      }}
                      className="rounded-lg border border-white/25 bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                    >
                      Set School Plan: {subscription?.plan === 'CORE' ? 'COMPLETE' : 'CORE'}
                    </button>
                    {onExitAdminWorkspace && (
                      <button
                        type="button"
                        onClick={onExitAdminWorkspace}
                        className="rounded-lg bg-[#148D82] hover:bg-[#10766c] px-3 py-1.5 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        ← Back to Super Admin Dashboard
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {verifyBanner && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              {verifyBanner}
            </div>
          )}

          {portalClosed ? (
            <div className="space-y-6">
              <div className="bg-white border-2 border-red-200 rounded-xl p-6 sm:p-8 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-red-50 text-red-700 shrink-0">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-[#102846]">
                        School Portal Closed — Term Subscription Ended
                      </h1>
                      <p className="text-sm text-[#64748B] mt-1 leading-relaxed">
                        {vacationDate && todayAccra >= vacationDate
                          ? `Your school reached its term vacation date (${vacationDate}), so the subscription has ended and the school portal has closed automatically.`
                          : subscription?.portalClosedReason ||
                            'This school portal is currently closed because its term subscription has ended.'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                  >
                    <LogOut className="w-4 h-4" /> Sign Out
                  </button>
                </div>

                {user.role !== 'SCHOOL_ADMIN' && (
                  <p className="text-xs text-[#64748B] pt-2 border-t border-slate-100">
                    Please contact your School Administrator to set next term&apos;s vacation date
                    and renew the school subscription to reopen the portal.
                  </p>
                )}
              </div>

              {user.role === 'SCHOOL_ADMIN' && (
                <SettingsAndBillingPanel
                  user={user}
                  school={school}
                  subscription={subscription}
                  onRefreshAuth={onRefreshAuth}
                />
              )}
            </div>
          ) : (
            <>
              {!vacationDate &&
                (user.role === 'SCHOOL_ADMIN' ||
                  user.role === 'HEADTEACHER' ||
                  user.role === 'SUPER_ADMIN') && (
                  <form
                    onSubmit={saveQuickVacationDate}
                    className="bg-white border-2 border-[#E2A83B] rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <h2 className="text-sm font-bold text-[#102846]">
                        When does your school vacate this term?
                      </h2>
                      <p className="text-xs text-[#64748B]">
                        Set your term vacation date. Once this date reaches, your school portal
                        closes automatically because the subscription has ended.
                      </p>
                      {vacErr && <p className="text-xs text-red-600 font-medium">{vacErr}</p>}
                      {vacMsg && <p className="text-xs text-emerald-700 font-medium">{vacMsg}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <input
                        required
                        type="date"
                        min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                        value={vacInput}
                        onChange={(e) => setVacInput(e.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                      />
                      <button
                        type="submit"
                        disabled={vacBusy}
                        className="rounded-lg bg-[#148D82] hover:bg-[#10766c] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {vacBusy ? 'Saving...' : 'Save Vacation Date'}
                      </button>
                    </div>
                  </form>
                )}

              {isStudentOrParent ? (
            <div className="space-y-6">
              <SubscriptionStatusCard
                subscription={effectiveSubscription}
                school={school}
                userRole={effectiveRole}
              />
              <StudentParentPortalPanel
                user={user}
                subscription={effectiveSubscription}
                previewRole={effectiveRole as 'STUDENT' | 'PARENT'}
                forceComplete={planPreview !== 'CORE'}
                isAdminPreview={isAdminUser}
              />
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="space-y-6">
                  {(dash.customTitle || dash.welcomeMessage || effectiveRole === 'HEADTEACHER' || effectiveRole === 'SCHOOL_ADMIN') && (
                    <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {dash.showSchoolLogoInSidebar && school?.logoDataUrl && (
                          <img
                            src={school.logoDataUrl}
                            alt={`${school.name} crest`}
                            className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                          />
                        )}
                        <div className="min-w-0 space-y-1">
                          <h1 className="text-lg font-bold text-[#102846] truncate">
                            {dash.customTitle || `${school?.name || 'School'} Dashboard`}
                          </h1>
                          {dash.welcomeMessage ? (
                            <p className="text-xs text-[#64748B] leading-relaxed">
                              {dash.welcomeMessage}
                            </p>
                          ) : school?.motto ? (
                            <p className="text-xs italic text-[#64748B]">{school.motto}</p>
                          ) : null}
                        </div>
                      </div>
                      {(user.role === 'SCHOOL_ADMIN' || user.role === 'HEADTEACHER' || user.role === 'SUPER_ADMIN') && (
                        <button
                          type="button"
                          onClick={() => selectTab('settings')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1] whitespace-nowrap shrink-0"
                        >
                          <Palette className="w-3.5 h-3.5 text-[#148D82]" /> Customize Dashboard
                        </button>
                      )}
                    </section>
                  )}

                  {showSubscriptionOnOverview && (
                    <SubscriptionStatusCard
                      subscription={effectiveSubscription}
                      school={school}
                      userRole={effectiveRole}
                      onManageBilling={() => selectTab('settings')}
                    />
                  )}
                  {dash.showMetricsCards && overview?.metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {effectiveRole === 'CLASS_TEACHER' || effectiveRole === 'SUBJECT_TEACHER' ? (
                        <>
                          <MetricCard label="Assigned Classes" value={overview.metrics.assignedClasses ?? overview.metrics.classCount ?? 0} />
                          <MetricCard label="Assigned Subjects" value={overview.metrics.assignedSubjects ?? overview.metrics.subjectCount ?? 0} />
                          <MetricCard label="Draft Marks" value={overview.metrics.draftScores ?? 0} />
                          <MetricCard label="Published Marks" value={overview.metrics.publishedScores ?? 0} />
                        </>
                      ) : (
                        <>
                          <MetricCard label="Active Students" value={overview.metrics.studentCount} />
                          <MetricCard label="Active Teachers" value={overview.metrics.teacherCount} />
                          <MetricCard label="Classes & Subjects" value={`${overview.metrics.classCount} / ${overview.metrics.subjectCount}`} />
                          <MetricCard label="Pending Score Approvals" value={overview.metrics.pendingApprovalScores} />
                        </>
                      )}
                    </div>
                  )}

                  {dash.showOnboardingChecklist &&
                    (user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN') &&
                    onboardingList.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                      <h2 className="text-base font-bold text-[#102846]">School Onboarding Checklist</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                        {onboardingList.map(([label, done]) => (
                          <div
                            key={String(label)}
                            className={`border rounded-lg px-3 py-2.5 font-medium ${
                              done
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : 'border-slate-200 bg-[#FBF8F1] text-[#64748B]'
                            }`}
                          >
                            {done ? '✓ ' : '○ '}
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {dash.showNotificationsWidget && overview?.notifications?.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                      <h2 className="text-base font-bold text-[#102846]">Recent Notifications</h2>
                      <div className="space-y-2 text-xs">
                        {overview.notifications.map((n: any) => (
                          <div key={n._id} className="border-b border-slate-100 pb-2">
                            <div className="font-semibold text-[#102846]">{n.title}</div>
                            <div className="text-[#64748B]">{n.message}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'students' && <StudentsPanel />}
              {tab === 'academics' && <AcademicsSetupPanel onChanged={() => void loadOverview()} />}
              {tab === 'marks' && <MarksEntryPanel user={user} />}
              {tab === 'reports' && <ApprovalsAndReportsPanel user={user} />}
              {tab === 'attendance' && <AttendancePanel />}
              {tab === 'analytics' && <AcademicAnalyticsPanel />}
              {tab === 'finance' && (
                <CompletePlanGate
                  subscription={effectiveSubscription}
                  bypassGate={isAdminUser && planPreview !== 'CORE'}
                  onGoToBilling={() => setTab('settings')}
                >
                  <FinancePanel user={user} />
                </CompletePlanGate>
              )}
              {tab === 'operations' && (
                <CompletePlanGate
                  subscription={effectiveSubscription}
                  bypassGate={isAdminUser && planPreview !== 'CORE'}
                  onGoToBilling={() => setTab('settings')}
                >
                  <OperationsCompletePanel user={user} />
                </CompletePlanGate>
              )}
              {tab === 'settings' && (
                <SettingsAndBillingPanel
                  user={user}
                  school={school}
                  subscription={subscription}
                  onRefreshAuth={onRefreshAuth}
                />
              )}
              {tab === 'plans' && isAdminUser && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-bold text-[#102846]">
                      All NexaSua Subscription Plans &amp; Dashboard Previews
                    </h2>
                    <p className="text-xs text-[#64748B] mt-1">
                      Inspect every active subscription tier, compare student band pricing, and
                      jump into any plan&apos;s modules or role dashboards.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {(planCatalog.length > 0
                      ? planCatalog
                      : [
                          {
                            code: 'CORE',
                            name: 'NexaSua Core',
                            tagline: 'Academics, assessments, attendance, and QR report cards.',
                            durationLabel: 'Per Term (120 Days)',
                            durationDays: 120,
                            startingPriceLabel: 'From GH₵350 / term',
                            features: [
                              'Student & Teacher Management',
                              'Continuous Assessment & Grading Engine',
                              'Headteacher Approvals & A4 PDF Report Cards',
                              'Student & Parent Portals',
                            ],
                            isFeatured: false,
                            isActive: true,
                          },
                          {
                            code: 'COMPLETE',
                            name: 'NexaSua Complete',
                            tagline: 'Full academics plus fees, Paystack, admissions, staff HR & timetables.',
                            durationLabel: 'Per Term (120 Days)',
                            durationDays: 120,
                            startingPriceLabel: 'From GH₵650 / term',
                            features: [
                              'Everything in NexaSua Core',
                              'Fee Structures, Term Invoices & Paystack Receipts',
                              'Admissions Pipeline & Staff Leave Management',
                              'Conflict-Free Timetables & Announcements',
                            ],
                            isFeatured: true,
                            isActive: true,
                          },
                          {
                            code: 'CUSTOM',
                            name: 'NexaSua Custom',
                            tagline: 'White-label portals, custom domains & bespoke workflows.',
                            durationLabel: 'Project + Annual SLA',
                            durationDays: 365,
                            startingPriceLabel: 'From GH₵2,000 setup',
                            features: [
                              'Custom Domain & Branded School Portal',
                              'Custom Report Card Layouts',
                              'Dedicated Hosting & Multi-Campus Sync',
                            ],
                            isFeatured: false,
                            isActive: true,
                          },
                        ]
                    ).map((plan) => (
                      <div
                        key={plan.code}
                        className={`bg-white rounded-xl p-6 flex flex-col justify-between border ${
                          plan.isFeatured ? 'border-2 border-[#148D82]' : 'border-slate-200'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-lg font-bold text-[#102846]">{plan.name}</h3>
                            <span className="text-xs font-mono font-semibold text-[#148D82]">
                              {plan.startingPriceLabel}
                            </span>
                          </div>
                          <div className="text-xs font-mono text-[#64748B]">
                            {plan.durationLabel} · {plan.isActive ? 'Active' : 'Hidden'}
                          </div>
                          <p className="text-xs text-[#64748B] leading-relaxed">{plan.tagline}</p>
                          <ul className="space-y-1.5 text-xs text-[#102846] pt-2">
                            {plan.features.map((feat) => (
                              <li key={feat}>✓ {feat}</li>
                            ))}
                          </ul>
                        </div>

                        <div className="pt-4 mt-5 border-t border-slate-100 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setPlanPreview(plan.code === 'CORE' ? 'CORE' : 'COMPLETE');
                              setTab(plan.code === 'CORE' ? 'academics' : 'finance');
                            }}
                            className="rounded-lg bg-[#148D82] hover:bg-[#10766c] px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Open {plan.code === 'CORE' ? 'Core Modules' : 'Complete Modules'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTab('settings')}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
                          >
                            Billing &amp; Checkout
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {pricingBands.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-[#FBF8F1] text-[#102846] font-semibold">
                            <th className="py-3 px-4">Student Band</th>
                            <th className="py-3 px-4 text-right">Core (Per Term)</th>
                            <th className="py-3 px-4 text-right">Complete (Per Term)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {pricingBands.map((b) => (
                            <tr key={b.code}>
                              <td className="py-2.5 px-4 font-semibold text-[#102846]">{b.label}</td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                                {b.isCustomQuote ? 'Custom Quote' : formatGhs(b.corePriceGhs)}
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#148D82] font-semibold">
                                {b.isCustomQuote ? 'Custom Quote' : formatGhs(b.completePriceGhs)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
            </>
          )}
        </main>

        {/* Mobile Thumb-Zone Bottom Tab Bar */}
        {!portalClosed && !isStudentOrParent && allowedTabs.length > 1 && (
          <nav
            aria-label="Mobile quick navigation"
            className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
          >
            <div className="grid grid-cols-5 h-14 items-center">
              {(['overview', 'students', 'marks', 'finance', 'settings'] as WorkspaceTab[])
                .filter((id) => allowedTabs.some((t) => t.id === id))
                .slice(0, 4)
                .map((id) => {
                  const item = allowedTabs.find((t) => t.id === id)!;
                  const active = tab === item.id;
                  const shortLabel =
                    id === 'overview'
                      ? 'Home'
                      : id === 'students'
                        ? 'Students'
                        : id === 'marks'
                          ? 'Marks'
                          : id === 'finance'
                            ? 'Fees'
                            : 'Settings';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        selectTab(item.id);
                        setMobileNav(false);
                      }}
                      className={`flex flex-col items-center justify-center min-h-[44px] px-1 transition-colors ${
                        active ? 'text-[#148D82] font-semibold' : 'text-[#64748B]'
                      }`}
                    >
                      {item.icon}
                      <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-full">
                        {shortLabel}
                      </span>
                    </button>
                  );
                })}
              <button
                type="button"
                onClick={() => setMobileNav((p) => !p)}
                className={`flex flex-col items-center justify-center min-h-[44px] px-1 transition-colors ${
                  mobileNav ? 'text-[#148D82] font-semibold' : 'text-[#64748B]'
                }`}
              >
                <Menu className="w-4 h-4" />
                <span className="text-[10px] tracking-tight mt-0.5">All</span>
              </button>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-[#64748B]">{label}</div>
      <div className="text-2xl font-bold font-mono tabular-nums text-[#102846] mt-1">
        {value}
      </div>
    </div>
  );
}
