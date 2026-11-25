import React, { useEffect, useState } from 'react';
import { Shield, Lock, CheckCircle2 } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { apiFetch, setMemoryAuthToken } from '../lib/api';
import type { AuthUser, HealthResponse, SchoolSummary, SubscriptionPlan, SubscriptionSummary } from '../types/nexasua';

const GHANA_REGIONS = [
  'Greater Accra',
  'Ashanti',
  'Central',
  'Eastern',
  'Western',
  'Western North',
  'Volta',
  'Oti',
  'Northern',
  'Savannah',
  'North East',
  'Upper East',
  'Upper West',
  'Bono',
  'Bono East',
  'Ahafo',
];

function GoogleMarkIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function GoogleAuthButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-[#102846] hover:bg-slate-50 transition-colors disabled:opacity-60"
    >
      <GoogleMarkIcon />
      <span>{label}</span>
    </button>
  );
}

function isAllowedOAuthOrigin(origin: string): boolean {
  return origin === window.location.origin;
}

export function SchoolRegisterPage({
  initialPlan = 'COMPLETE',
  initialPopulation = 200,
  health,
  googleOnboarding,
  onClearGoogleOnboarding,
  onGoogleOnboardingReceived,
  onNavigate,
}: {
  initialPlan?: SubscriptionPlan;
  initialPopulation?: number;
  health: HealthResponse | null;
  googleOnboarding?: { email: string; fullName: string; googleOnboardingToken: string } | null;
  onClearGoogleOnboarding?: () => void;
  onGoogleOnboardingReceived?: (data: {
    email: string;
    fullName: string;
    googleOnboardingToken: string;
  }) => void;
  onNavigate: (p: string) => void;
}) {
  const [form, setForm] = useState({
    schoolName: '',
    schoolType: 'Private' as 'Private' | 'Public' | 'Mission' | 'International',
    educationalLevels: ['Primary', 'Junior High School'] as string[],
    country: 'Ghana',
    region: 'Greater Accra',
    town: '',
    address: '',
    schoolEmail: '',
    schoolPhone: '',
    adminName: googleOnboarding?.fullName || '',
    adminEmail: googleOnboarding?.email || '',
    adminPassword: '',
    studentPopulation: initialPopulation,
    selectedPlan: initialPlan,
    termVacationDate: '',
    dataConsentAccepted: false,
  });

  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (googleOnboarding) {
      setForm((prev) => ({
        ...prev,
        adminName: googleOnboarding.fullName || prev.adminName,
        adminEmail: googleOnboarding.email,
      }));
    }
  }, [googleOnboarding]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (!isAllowedOAuthOrigin(event.origin)) return;
      const d = event.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'NEXASUA_GOOGLE_NEW_USER' && d.googleOnboardingToken) {
        setGoogleBusy(false);
        setError('');
        onGoogleOnboardingReceived?.({
          email: d.email,
          fullName: d.fullName || '',
          googleOnboardingToken: d.googleOnboardingToken,
        });
      } else if (d.type === 'NEXASUA_GOOGLE_AUTH_SUCCESS') {
        setGoogleBusy(false);
        setError('This Google account already belongs to an existing school user. Sign in on the Portal Login page.');
      } else if (d.type === 'NEXASUA_GOOGLE_ERROR') {
        setGoogleBusy(false);
        setError(d.error || 'Google verification failed.');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [onGoogleOnboardingReceived]);

  const startGoogleRegister = async () => {
    setError('');
    setGoogleBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>('/api/auth/google/url?intent=register');
      const popup = window.open(url, 'nexasua_google_auth', 'width=520,height=640');
      if (!popup) {
        setGoogleBusy(false);
        setError('Please allow popups for this site to continue with Google.');
      }
    } catch (err) {
      setGoogleBusy(false);
      setError(err instanceof Error ? err.message : 'Unable to start Google Sign-In.');
    }
  };

  const toggleLevel = (lvl: string) => {
    setForm((prev) => ({
      ...prev,
      educationalLevels: prev.educationalLevels.includes(lvl)
        ? prev.educationalLevels.filter((l) => l !== lvl)
        : [...prev.educationalLevels, lvl],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.educationalLevels.length === 0) {
      setError('Select at least one educational level.');
      return;
    }
    if (!form.termVacationDate) {
      setError('Please select the date your school vacates this term.');
      return;
    }
    if (!form.dataConsentAccepted) {
      setError('Please accept the data protection consent notice.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch<{ message: string; emailVerificationStatus: string }>(
        '/api/public/register-school',
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            googleOnboardingToken: googleOnboarding?.googleOnboardingToken || undefined,
          }),
        }
      );
      onClearGoogleOnboarding?.();
      setSuccessMsg(`${res.message} ${res.emailVerificationStatus}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#102846]">Register Your School on NexaSua</h1>
        <p className="mt-2 text-sm text-[#64748B]">
          Applications are reviewed by NexaFlow Technologies. Approved schools receive a unique
          school code and a 7-day free trial.
        </p>
      </div>

      {health && !health.dbConnected && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <strong>Database Setup Required:</strong> MongoDB Atlas is currently{' '}
          <span className="font-mono">{health.integrations?.mongodb?.status || 'Not Configured'}</span>.
          Configure <span className="font-mono">MONGODB_URI</span> in environment secrets to persist
          school applications.
        </div>
      )}

      {successMsg ? (
        <div className="bg-white border border-emerald-200 rounded-xl p-8 space-y-4">
          <div className="flex items-center gap-2 text-emerald-700 font-bold text-lg">
            <CheckCircle2 className="w-6 h-6" /> Application Submitted
          </div>
          <p className="text-sm text-[#102846] leading-relaxed">{successMsg}</p>
          <p className="text-xs text-[#64748B]">
            Once NexaFlow Technologies approves your school, sign in with your administrator
            email and password to begin school onboarding.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="rounded-lg bg-[#148D82] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Go to Portal Login
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Official School Name *
              </label>
              <input
                required
                value={form.schoolName}
                onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                placeholder="e.g. Osu Ridge Preparatory & JHS"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                School Type *
              </label>
              <select
                value={form.schoolType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    schoolType: e.target.value as typeof form.schoolType,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="Private">Private</option>
                <option value="Public">Public</option>
                <option value="Mission">Mission</option>
                <option value="International">International</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Selected Subscription Plan *
              </label>
              <select
                value={form.selectedPlan}
                onChange={(e) =>
                  setForm({
                    ...form,
                    selectedPlan: e.target.value as SubscriptionPlan,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="CORE">NexaSua Core (Academics & Report Cards)</option>
                <option value="COMPLETE">NexaSua Complete (Full Academics + Finance & Ops)</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-[#102846] mb-2">
                Educational Levels Offered *
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['Kindergarten', 'Primary', 'Junior High School', 'Senior High School'].map(
                  (lvl) => (
                    <label
                      key={lvl}
                      className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium cursor-pointer hover:bg-[#FBF8F1]"
                    >
                      <input
                        type="checkbox"
                        checked={form.educationalLevels.includes(lvl)}
                        onChange={() => toggleLevel(lvl)}
                        className="accent-[#148D82]"
                      />
                      <span>{lvl}</span>
                    </label>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Country</label>
              <input
                required
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Region *</label>
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                {GHANA_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Town / City *
              </label>
              <input
                required
                value={form.town}
                onChange={(e) => setForm({ ...form, town: e.target.value })}
                placeholder="e.g. Accra"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Estimated Student Population *
              </label>
              <input
                required
                type="number"
                min={1}
                value={form.studentPopulation}
                onChange={(e) =>
                  setForm({ ...form, studentPopulation: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Physical School Address *
              </label>
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Official School Email *
              </label>
              <input
                required
                type="email"
                value={form.schoolEmail}
                onChange={(e) => setForm({ ...form, schoolEmail: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                School Telephone *
              </label>
              <input
                required
                value={form.schoolPhone}
                onChange={(e) => setForm({ ...form, schoolPhone: e.target.value })}
                placeholder="+233 ..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                When does your school vacate this term? (Term Vacation Date) *
              </label>
              <input
                required
                type="date"
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                value={form.termVacationDate}
                onChange={(e) => setForm({ ...form, termVacationDate: e.target.value })}
                className="w-full sm:w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
              <p className="text-[11px] text-[#64748B] mt-1">
                Your school portal stays active until this vacation date and closes automatically
                when the term ends until renewed for the next term.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-[#102846]">
                Primary School Administrator Account
              </h2>
              {googleOnboarding ? (
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-semibold text-[#148D82]">
                    Verified via Google ({googleOnboarding.email})
                  </span>
                  <button
                    type="button"
                    onClick={() => onClearGoogleOnboarding?.()}
                    className="text-[#64748B] hover:text-[#102846] underline"
                  >
                    Use password instead
                  </button>
                </div>
              ) : (
                <div className="w-full sm:w-auto">
                  <GoogleAuthButton
                    label={googleBusy ? 'Connecting Google...' : 'Continue with Google'}
                    busy={googleBusy}
                    onClick={() => void startGoogleRegister()}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Administrator Name *
                </label>
                <input
                  required
                  value={form.adminName}
                  onChange={(e) => setForm({ ...form, adminName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Administrator Email *
                </label>
                <input
                  required
                  type="email"
                  disabled={Boolean(googleOnboarding)}
                  value={form.adminEmail}
                  onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  {googleOnboarding ? 'Password (optional with Google)' : 'Password (min 8 chars) *'}
                </label>
                <input
                  required={!googleOnboarding}
                  type="password"
                  minLength={googleOnboarding ? undefined : 8}
                  value={form.adminPassword}
                  onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                  placeholder={googleOnboarding ? 'Optional fallback password' : ''}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-[#64748B] cursor-pointer">
            <input
              type="checkbox"
              checked={form.dataConsentAccepted}
              onChange={(e) => setForm({ ...form, dataConsentAccepted: e.target.checked })}
              className="mt-0.5 accent-[#148D82]"
            />
            <span>
              I confirm I am authorized to register this school and accept the NexaSua Privacy
              Policy and Data Processing terms aligned with the Ghana Data Protection Act, 2012
              (Act 843).
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full sm:w-auto rounded-lg bg-[#148D82] px-6 py-3 text-sm font-semibold text-white hover:bg-[#10766c] disabled:opacity-60"
          >
            {busy ? 'Submitting Application...' : 'Submit School Application'}
          </button>
        </form>
      )}
    </div>
  );
}

export function LoginPage({
  googleOAuthEnabled,
  onStartGoogleRegistration,
  onLoginSuccess,
  onNavigate,
}: {
  googleOAuthEnabled: boolean;
  onStartGoogleRegistration: (data: {
    email: string;
    fullName: string;
    googleOnboardingToken: string;
  }) => void;
  onLoginSuccess: (data: {
    token: string;
    user: AuthUser;
    school: SchoolSummary | null;
    subscription: SubscriptionSummary | null;
  }) => void;
  onNavigate: (p: string) => void;
}) {
  const params = new URLSearchParams(window.location.search);
  const verifyTokenParam = params.get('verifyToken');
  const resetTokenParam = params.get('resetToken');

  const [mode, setMode] = useState<'login' | 'mfa' | 'forgot' | 'reset'>(
    resetTokenParam ? 'reset' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaChallengeToken, setMfaChallengeToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [resetToken, setResetToken] = useState(resetTokenParam || '');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [newGoogleUser, setNewGoogleUser] = useState<{
    email: string;
    fullName: string;
    googleOnboardingToken: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (verifyTokenParam) {
      apiFetch<{ email: string }>('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyTokenParam }),
      })
        .then((res) => setMessage(`Email verified for ${res.email}. You may now sign in.`))
        .catch((err) => setError(err instanceof Error ? err.message : 'Verification failed.'));
    }
  }, [verifyTokenParam]);

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (!isAllowedOAuthOrigin(event.origin)) return;
      const d = event.data;
      if (!d || typeof d !== 'object') return;

      if (d.type === 'NEXASUA_GOOGLE_AUTH_SUCCESS' && d.token && d.user) {
        setGoogleBusy(false);
        setError('');
        setMemoryAuthToken(d.token);
        onLoginSuccess({
          token: d.token,
          user: d.user,
          school: d.school || null,
          subscription: d.subscription || null,
        });
      } else if (d.type === 'NEXASUA_GOOGLE_MFA_REQUIRED' && d.mfaChallengeToken) {
        setGoogleBusy(false);
        setMfaChallengeToken(d.mfaChallengeToken);
        setMode('mfa');
      } else if (d.type === 'NEXASUA_GOOGLE_NEW_USER') {
        setGoogleBusy(false);
        setNewGoogleUser({
          email: d.email,
          fullName: d.fullName || '',
          googleOnboardingToken: d.googleOnboardingToken,
        });
        setError('');
      } else if (d.type === 'NEXASUA_GOOGLE_ERROR') {
        setGoogleBusy(false);
        setError(d.error || 'Google sign-in failed.');
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [onLoginSuccess]);

  const handleGoogleSignIn = async () => {
    setError('');
    setMessage('');
    setNewGoogleUser(null);
    setGoogleBusy(true);
    try {
      const { url } = await apiFetch<{ url: string }>('/api/auth/google/url?intent=login');
      const popup = window.open(url, 'nexasua_google_auth', 'width=520,height=640');
      if (!popup) {
        setGoogleBusy(false);
        setError('Please allow popups for this site to sign in with Google.');
      }
    } catch (err) {
      setGoogleBusy(false);
      setError(err instanceof Error ? err.message : 'Unable to start Google Sign-In.');
    }
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    setNewGoogleUser(null);
    try {
      const res = await apiFetch<{
        mfaRequired?: boolean;
        mfaChallengeToken?: string;
        token?: string;
        user?: AuthUser;
        school?: SchoolSummary | null;
        subscription?: SubscriptionSummary | null;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (res.mfaRequired && res.mfaChallengeToken) {
        setMfaChallengeToken(res.mfaChallengeToken);
        setMode('mfa');
        return;
      }

      if (res.token && res.user) {
        setMemoryAuthToken(res.token);
        onLoginSuccess({
          token: res.token,
          user: res.user,
          school: res.school || null,
          subscription: res.subscription || null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{
        token: string;
        user: AuthUser;
        school: SchoolSummary | null;
        subscription: SubscriptionSummary | null;
      }>('/api/auth/mfa/verify-login', {
        method: 'POST',
        body: JSON.stringify({ mfaChallengeToken, code: mfaCode }),
      });
      setMemoryAuthToken(res.token);
      onLoginSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid verification code.');
    } finally {
      setBusy(false);
    }
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setMessage(res.message);
      setMode('login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size="md" />
          <h1 className="text-xl font-bold text-[#102846] pt-2">
            {mode === 'login' && 'School Portal Sign In'}
            {mode === 'mfa' && 'Two-Factor Verification'}
            {mode === 'forgot' && 'Reset Your Password'}
            {mode === 'reset' && 'Set New Password'}
          </h1>
          <p className="text-xs text-[#64748B]">
            Administrators, Headteachers, Teachers, Bursars, Students & Guardians
          </p>
        </div>

        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-900">
            {error}
          </div>
        )}

        {newGoogleUser && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950 space-y-2.5">
            <p className="leading-relaxed">
              No school portal account was found for{' '}
              <strong className="font-mono">{newGoogleUser.email}</strong>. If your school is already
              on NexaSua, ask your School Administrator to add this email to your staff, student, or
              guardian profile.
            </p>
            <button
              type="button"
              onClick={() => onStartGoogleRegistration(newGoogleUser)}
              className="rounded-lg bg-[#148D82] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#10766c]"
            >
              Register a New School with {newGoogleUser.email}
            </button>
          </div>
        )}

        {mode === 'login' && (
          <div className="space-y-4">
            <form onSubmit={submitLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">Password</label>
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-[#148D82] py-2.5 text-sm font-semibold text-white hover:bg-[#10766c] disabled:opacity-60"
              >
                {busy ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-slate-200" />
              <span className="mx-3 text-xs text-[#64748B]">or</span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <GoogleAuthButton
              label={googleBusy ? 'Connecting to Google...' : 'Sign in with Google'}
              busy={googleBusy}
              onClick={() => void handleGoogleSignIn()}
            />
            {!googleOAuthEnabled && (
              <p className="text-[11px] text-[#64748B] text-center">
                Requires <span className="font-mono">GOOGLE_CLIENT_ID</span> and{' '}
                <span className="font-mono">GOOGLE_CLIENT_SECRET</span> in environment secrets.
              </p>
            )}

            <div className="flex items-center justify-between text-xs pt-2">
              <button
                type="button"
                onClick={() => {
                  setNewGoogleUser(null);
                  setMode('forgot');
                }}
                className="text-[#64748B] hover:text-[#102846]"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/register')}
                className="text-[#148D82] font-semibold hover:underline"
              >
                Register a school
              </button>
            </div>
          </div>
        )}

        {mode === 'mfa' && (
          <form onSubmit={submitMfa} className="space-y-4">
            <p className="text-xs text-[#64748B]">
              Enter the 6-digit code from your authenticator app or one of your backup codes.
            </p>
            <input
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              placeholder="000000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono text-lg tracking-widest"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#102846] py-2.5 text-sm font-semibold text-white"
            >
              {busy ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={submitForgot} className="space-y-4">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Account email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#148D82] py-2.5 text-sm font-semibold text-white"
            >
              {busy ? 'Sending...' : 'Request Reset Link'}
            </button>
            <button
              type="button"
              onClick={() => setMode('login')}
              className="w-full text-xs text-[#64748B]"
            >
              Back to Sign In
            </button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={submitReset} className="space-y-4">
            <input
              required
              value={resetToken}
              onChange={(e) => setResetToken(e.target.value)}
              placeholder="Reset token"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
            />
            <input
              required
              type="password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#148D82] py-2.5 text-sm font-semibold text-white"
            >
              Update Password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function SuperAdminPortalLoginPage({
  onLoginSuccess,
  onNavigate,
}: {
  onLoginSuccess: (data: { token: string; user: AuthUser }) => void;
  onNavigate?: (p: string) => void;
}) {
  const [status, setStatus] = useState<{
    dbConnected: boolean;
    superAdminInitialized: boolean;
    superAdminManagedBySecrets?: boolean;
    setupKeyRequired: boolean;
  } | null>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [setupKey, setSetupKey] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<NonNullable<typeof status>>('/api/auth/super-admin-status')
      .then(setStatus)
      .catch(() =>
        setStatus({
          dbConnected: false,
          superAdminInitialized: false,
          superAdminManagedBySecrets: false,
          setupKeyRequired: false,
        })
      );
  }, []);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>(
        '/api/auth/super-admin-bootstrap',
        {
          method: 'POST',
          body: JSON.stringify({ fullName, email, password, setupKey }),
        }
      );
      setMemoryAuthToken(res.token);
      onLoginSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bootstrap failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{
        mfaRequired?: boolean;
        mfaChallengeToken?: string;
        token?: string;
        user?: AuthUser;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      if (res.mfaRequired && res.mfaChallengeToken) {
        setMfaToken(res.mfaChallengeToken);
        return;
      }
      if (res.user && res.user.role !== 'SUPER_ADMIN') {
        setError('This portal is restricted to NexaFlow Platform Super Administrators.');
        return;
      }
      if (res.token && res.user) {
        setMemoryAuthToken(res.token);
        onLoginSuccess({ token: res.token, user: res.user });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<{ token: string; user: AuthUser }>(
        '/api/auth/mfa/verify-login',
        {
          method: 'POST',
          body: JSON.stringify({ mfaChallengeToken: mfaToken, code: mfaCode }),
        }
      );
      if (res.user.role !== 'SUPER_ADMIN') {
        setError('Restricted to Super Administrators.');
        return;
      }
      setMemoryAuthToken(res.token);
      onLoginSuccess(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MFA failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#102846] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 p-8 space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <BrandLogo size="md" />
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#148D82] pt-2">
            <Shield className="w-4 h-4" />
            <span>NexaFlow Technologies · Platform Governance</span>
          </div>
          <h1 className="text-xl font-bold text-[#102846]">
            {status && !status.superAdminInitialized && !status.superAdminManagedBySecrets
              ? 'First-Time Super Admin Setup'
              : 'Super Admin Authentication'}
          </h1>
        </div>

        {!status ? (
          <div className="text-center text-sm text-[#64748B]">Checking platform status...</div>
        ) : !status.dbConnected ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 space-y-2">
            <div className="font-bold">MongoDB Atlas Not Connected</div>
            <p className="text-xs leading-relaxed">
              Add your <span className="font-mono">MONGODB_URI</span> connection string in
              AI Studio Secrets, then reload. You may also set{' '}
              <span className="font-mono">SUPER_ADMIN_EMAIL</span> and{' '}
              <span className="font-mono">SUPER_ADMIN_PASSWORD</span> in Secrets anytime.
            </p>
          </div>
        ) : mfaToken ? (
          <form onSubmit={handleMfa} className="space-y-4">
            <p className="text-xs text-[#64748B]">Enter your 6-digit TOTP authenticator code.</p>
            <input
              required
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center font-mono text-lg"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#102846] py-2.5 text-sm font-semibold text-white"
            >
              Verify MFA
            </button>
          </form>
        ) : !status.superAdminInitialized && !status.superAdminManagedBySecrets ? (
          <form onSubmit={handleBootstrap} className="space-y-4">
            <p className="text-xs text-[#64748B]">
              Create the primary NexaFlow Super Admin account below, or configure{' '}
              <span className="font-mono">SUPER_ADMIN_EMAIL</span> and{' '}
              <span className="font-mono">SUPER_ADMIN_PASSWORD</span> in Secrets.
            </p>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Full Name *</label>
              <input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Email *</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Password (min 10 characters) *
              </label>
              <input
                required
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {status.setupKeyRequired && (
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Super Admin Setup Key *
                </label>
                <input
                  required
                  type="password"
                  value={setupKey}
                  onChange={(e) => setSetupKey(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                />
              </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-[#148D82] py-2.5 text-sm font-semibold text-white"
            >
              {busy ? 'Initializing...' : 'Initialize Super Admin Account'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignIn} className="space-y-4">
            {status.superAdminManagedBySecrets && (
              <div className="rounded-lg border border-slate-200 bg-[#FBF8F1] p-3 text-xs text-[#64748B]">
                Managed via Environment Secrets (<span className="font-mono">SUPER_ADMIN_EMAIL</span>{' '}
                &amp; <span className="font-mono">SUPER_ADMIN_PASSWORD</span>). Update those secrets
                anytime in AI Studio to change credentials.
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#102846] py-2.5 text-sm font-semibold text-white"
            >
              <Lock className="w-4 h-4" />
              {busy ? 'Authenticating...' : 'Sign In to Super Admin'}
            </button>
          </form>
        )}

        {onNavigate && (
          <div className="pt-2 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => onNavigate('/')}
              className="text-xs text-[#64748B] hover:text-[#102846] hover:underline"
            >
              ← Return to NexaSua Website
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
