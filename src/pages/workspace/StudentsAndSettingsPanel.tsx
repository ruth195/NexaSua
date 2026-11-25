import React, { useEffect, useState } from 'react';
import { Download, FileUp, Palette, Plus } from 'lucide-react';
import { EmptyState, formatGhanaDate, formatGhs } from '../../components/BrandLogo';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import {
  DASHBOARD_THEME_PRESETS,
  DEFAULT_DASHBOARD_SETTINGS,
  resolveDashboardSettings,
} from '../../lib/dashboardTheme';
import type {
  AuthUser,
  DashboardSettings,
  SchoolSummary,
  SubscriptionSummary,
} from '../../types/nexasua';

export function StudentsPanel() {
  const [students, setStudents] = useState<Array<any>>([]);
  const [classes, setClasses] = useState<Array<any>>([]);
  const [years, setYears] = useState<Array<any>>([]);
  const [parents, setParents] = useState<Array<any>>([]);
  const [links, setLinks] = useState<Array<any>>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    fullName: '',
    admissionNumber: '',
    gender: 'Female',
    classId: '',
    academicYearId: '',
    admissionDate: new Date().toISOString().slice(0, 10),
    studentCategory: 'Day',
    guardianName: '',
    guardianPhone: '',
    portalEmail: '',
    portalPassword: '',
  });

  const [importTarget, setImportTarget] = useState({ classId: '', academicYearId: '' });
  const [linkForm, setLinkForm] = useState({ parentUserId: '', studentId: '', relationship: 'Parent/Guardian' });

  const load = async () => {
    const [st, cl, ay, us, ln] = await Promise.all([
      apiFetch<{ students: Array<any> }>(`/api/school/students?search=${encodeURIComponent(search)}`),
      apiFetch<{ classes: Array<any> }>('/api/school/classes'),
      apiFetch<{ academicYears: Array<any> }>('/api/school/academic-years'),
      apiFetch<{ users: Array<any> }>('/api/school/users?role=PARENT'),
      apiFetch<{ links: Array<any> }>('/api/school/guardian-links'),
    ]);
    setStudents(st.students);
    setClasses(cl.classes);
    setYears(ay.academicYears);
    setParents(us.users);
    setLinks(ln.links);
    if (cl.classes[0] && !form.classId) {
      setForm((p) => ({ ...p, classId: cl.classes[0]._id }));
      setImportTarget((p) => ({ ...p, classId: cl.classes[0]._id }));
    }
    if (ay.academicYears[0] && !form.academicYearId) {
      setForm((p) => ({ ...p, academicYearId: ay.academicYears[0]._id }));
      setImportTarget((p) => ({ ...p, academicYearId: ay.academicYears[0]._id }));
    }
  };

  useEffect(() => {
    void load();
  }, [search]);

  const enrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      const payload: Record<string, unknown> = {
        fullName: form.fullName,
        admissionNumber: form.admissionNumber || undefined,
        gender: form.gender,
        classId: form.classId,
        academicYearId: form.academicYearId,
        admissionDate: form.admissionDate,
        studentCategory: form.studentCategory,
        guardianName: form.guardianName,
        guardianPhone: form.guardianPhone,
      };
      if (form.portalEmail && form.portalPassword) {
        payload.portalAccount = { email: form.portalEmail, password: form.portalPassword };
      }
      await apiFetch('/api/school/students', { method: 'POST', body: JSON.stringify(payload) });
      setShowAdd(false);
      setForm({ ...form, fullName: '', admissionNumber: '', portalEmail: '', portalPassword: '' });
      setMsg('Student enrolled.');
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Enrollment failed.');
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !importTarget.classId || !importTarget.academicYearId) return;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('classId', importTarget.classId);
    fd.append('academicYearId', importTarget.academicYearId);
    try {
      const res = await apiFetch<{ imported: number; skippedCount: number }>('/api/school/students/import', {
        method: 'POST',
        body: fd,
      });
      setMsg(`Imported ${res.imported} students (${res.skippedCount} skipped).`);
      setShowImport(false);
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Import failed.');
    }
  };

  const updateStudentStatus = async (id: string, status: string) => {
    await apiFetch(`/api/school/students/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    setMsg(`Student marked as ${status}.`);
    await load();
  };

  const linkGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    try {
      await apiFetch('/api/school/guardian-links', {
        method: 'POST',
        body: JSON.stringify({ ...linkForm, verified: true }),
      });
      setMsg('Verified guardian link saved.');
      await load();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Link failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search students by name or admission number..."
          className="w-full sm:w-80 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#148D82] px-4 py-2 text-xs font-semibold text-white"
          >
            <Plus className="w-4 h-4" /> Add Student
          </button>
          <button
            type="button"
            onClick={() => setShowImport((p) => !p)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#102846]"
          >
            <FileUp className="w-4 h-4" /> Import CSV/Excel
          </button>
          <button
            type="button"
            onClick={() => void downloadProtectedFile('/api/school/students/export', 'nexasua-students.csv')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#102846]"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {showAdd && (
        <form onSubmit={enrollStudent} className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <input required placeholder="Student Full Name *" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Admission No (auto if blank)" value={form.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="Female">Female</option>
            <option value="Male">Male</option>
          </select>
          <select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">Select Class *</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select required value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">Academic Year *</option>
            {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
          </select>
          <select value={form.studentCategory} onChange={(e) => setForm({ ...form, studentCategory: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="Day">Day Student</option>
            <option value="Boarding">Boarding Student</option>
            <option value="Scholarship">Scholarship</option>
          </select>
          <input placeholder="Guardian Name" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input placeholder="Guardian Phone" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="date" value={form.admissionDate} onChange={(e) => setForm({ ...form, admissionDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="email" placeholder="Optional Student Portal Email" value={form.portalEmail} onChange={(e) => setForm({ ...form, portalEmail: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input type="password" placeholder="Optional Student Password" value={form.portalPassword} onChange={(e) => setForm({ ...form, portalPassword: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Enroll Student</button>
        </form>
      )}

      {showImport && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <div className="text-sm font-bold text-[#102846]">Bulk Import Students (CSV or .xlsx)</div>
          <div className="text-xs text-[#64748B]">
            Columns supported: <span className="font-mono">fullName, admissionNumber, gender, guardianName, guardianPhone</span>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <select value={importTarget.classId} onChange={(e) => setImportTarget({ ...importTarget, classId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select value={importTarget.academicYearId} onChange={(e) => setImportTarget({ ...importTarget, academicYearId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
            </select>
            <input type="file" accept=".csv,.xlsx" onChange={handleCsvImport} className="text-xs" />
          </div>
        </div>
      )}

      {students.length === 0 ? (
        <EmptyState
          title="No students have been registered yet."
          description="Add learners individually or upload a CSV/Excel roster once classes and academic years are configured."
          actionLabel="Add First Student"
          onAction={() => setShowAdd(true)}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#FBF8F1] text-xs font-semibold text-[#102846]">
                <th className="py-3 px-4">Admission No</th>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Class</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Lifecycle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {students.map((st) => (
                <tr key={st._id}>
                  <td className="py-2.5 px-4 font-mono text-xs text-[#64748B]">{st.admissionNumber}</td>
                  <td className="py-2.5 px-4 font-semibold text-[#102846]">{st.fullName}</td>
                  <td className="py-2.5 px-4 text-xs text-[#64748B]">{st.currentClassId?.name}</td>
                  <td className="py-2.5 px-4 text-xs text-[#64748B]">{st.studentCategory}</td>
                  <td className="py-2.5 px-4 text-xs font-medium text-[#102846]">{st.status}</td>
                  <td className="py-2.5 px-4 text-right space-x-2 text-xs">
                    <button type="button" onClick={() => void updateStudentStatus(st._id, 'GRADUATED')} className="text-[#148D82] hover:underline">Graduate</button>
                    <button type="button" onClick={() => void updateStudentStatus(st._id, 'TRANSFERRED')} className="text-[#64748B] hover:underline">Transfer</button>
                    <button type="button" onClick={() => void updateStudentStatus(st._id, 'ARCHIVED')} className="text-red-600 hover:underline">Archive</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Guardian Verification Link */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-bold text-[#102846]">Verify Parent / Guardian Links</h3>
        <form onSubmit={linkGuardian} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <select required value={linkForm.parentUserId} onChange={(e) => setLinkForm({ ...linkForm, parentUserId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">Select Parent User</option>
            {parents.map((p) => <option key={p._id} value={p._id}>{p.fullName} ({p.email})</option>)}
          </select>
          <select required value={linkForm.studentId} onChange={(e) => setLinkForm({ ...linkForm, studentId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            <option value="">Select Student</option>
            {students.map((s) => <option key={s._id} value={s._id}>{s.fullName} ({s.admissionNumber})</option>)}
          </select>
          <input value={linkForm.relationship} onChange={(e) => setLinkForm({ ...linkForm, relationship: e.target.value })} placeholder="Relationship" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Verify & Link</button>
        </form>
        {links.length > 0 && (
          <div className="text-xs text-[#64748B] space-y-1">
            {links.map((l) => (
              <div key={l._id}>
                {l.parentUserId?.fullName} ↔ {l.studentId?.fullName} ({l.relationship}) · Verified: {l.verified ? 'Yes' : 'No'}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SettingsAndBillingPanel({
  user,
  school,
  subscription,
  onRefreshAuth,
}: {
  user: AuthUser;
  school: SchoolSummary | null;
  subscription: SubscriptionSummary | null;
  onRefreshAuth: () => void;
}) {
  const [motto, setMotto] = useState(school?.motto || '');
  const [headName, setHeadName] = useState(school?.reportCardSettings?.headteacherName || '');
  const [reopening, setReopening] = useState(school?.reportCardSettings?.nextTermReopeningDate || '');
  const [logoDataUrl, setLogoDataUrl] = useState(school?.logoDataUrl || '');
  const [paystackPub, setPaystackPub] = useState(school?.paymentConfig?.paystackPublicKey || '');
  const [paystackSec, setPaystackSec] = useState('');
  const [vacationDateInput, setVacationDateInput] = useState(
    subscription?.termVacationDate || school?.termVacationDate || ''
  );
  const [vacBusy, setVacBusy] = useState(false);
  const [dashForm, setDashForm] = useState<Required<DashboardSettings>>(() =>
    resolveDashboardSettings(school?.dashboardSettings)
  );
  const [dashBusy, setDashBusy] = useState(false);
  const [subInfo, setSubInfo] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    const nextVac = subscription?.termVacationDate || school?.termVacationDate || '';
    if (nextVac) setVacationDateInput(nextVac);
  }, [subscription?.termVacationDate, school?.termVacationDate]);

  useEffect(() => {
    setDashForm(resolveDashboardSettings(school?.dashboardSettings));
  }, [school?.dashboardSettings]);

  useEffect(() => {
    if (
      user.role === 'SUPER_ADMIN' ||
      user.role === 'SCHOOL_ADMIN' ||
      user.role === 'HEADTEACHER' ||
      user.role === 'BURSAR'
    ) {
      apiFetch('/api/school/subscription').then(setSubInfo).catch(() => null);
    }
  }, [user.role]);

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setErr('Logo must be under 500KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    try {
      await apiFetch('/api/school/settings', {
        method: 'PUT',
        body: JSON.stringify({
          motto,
          logoDataUrl,
          reportCardSettings: {
            headteacherName: headName,
            nextTermReopeningDate: reopening,
          },
          paymentConfig: {
            paystackPublicKey: paystackPub,
            paystackSecretKey: paystackSec || undefined,
          },
        }),
      });
      setPaystackSec('');
      setMsg('School settings updated.');
      onRefreshAuth();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed.');
    }
  };

  const saveVacationDate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!vacationDateInput) {
      setErr('Please choose the date your school vacates this term.');
      return;
    }
    setVacBusy(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/school/term-vacation-date', {
        method: 'PUT',
        body: JSON.stringify({ termVacationDate: vacationDateInput }),
      });
      setMsg(res.message);
      onRefreshAuth();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Unable to save vacation date.');
    } finally {
      setVacBusy(false);
    }
  };

  const saveDashboardCustomization = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');
    setDashBusy(true);
    try {
      await apiFetch('/api/school/settings', {
        method: 'PUT',
        body: JSON.stringify({ dashboardSettings: dashForm }),
      });
      setMsg('School dashboard customization saved.');
      onRefreshAuth();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Unable to save dashboard customization.');
    } finally {
      setDashBusy(false);
    }
  };

  const resetDashboardCustomization = async () => {
    setErr('');
    setMsg('');
    setDashBusy(true);
    try {
      setDashForm(DEFAULT_DASHBOARD_SETTINGS);
      await apiFetch('/api/school/settings', {
        method: 'PUT',
        body: JSON.stringify({ dashboardSettings: DEFAULT_DASHBOARD_SETTINGS }),
      });
      setMsg('Dashboard customization reset to NexaSua defaults.');
      onRefreshAuth();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Unable to reset dashboard customization.');
    } finally {
      setDashBusy(false);
    }
  };

  const startCheckout = async (plan: 'CORE' | 'COMPLETE', billingCycle: 'TERM' | 'THREE_TERMS') => {
    setErr('');
    setMsg('');
    const todayStr = new Date().toISOString().slice(0, 10);
    try {
      const res = await apiFetch<{
        paystackConfigured: boolean;
        authorizationUrl?: string;
        message?: string;
        invoice: { invoiceNumber: string; amountGhs: number };
      }>('/api/school/subscription/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan,
          billingCycle,
          ...(vacationDateInput && vacationDateInput > todayStr
            ? { nextTermVacationDate: vacationDateInput }
            : {}),
        }),
      });
      if (res.paystackConfigured && res.authorizationUrl) {
        window.location.assign(res.authorizationUrl);
        return;
      }
      setMsg(
        `${res.message || 'Invoice created.'} (${res.invoice.invoiceNumber} · ${formatGhs(res.invoice.amountGhs)})`
      );
      apiFetch('/api/school/subscription').then(setSubInfo);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Checkout failed.');
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[#102846]">School Subscription Status</h3>
            <div className="text-xs text-[#64748B] mt-1">
              Plan: <strong className="text-[#102846]">NexaSua {subscription?.plan}</strong> · Status:{' '}
              <strong className="text-[#148D82]">{subscription?.status}</strong> · Band:{' '}
              {subscription?.studentBand} · Vacates:{' '}
              <strong className="font-mono text-[#102846]">
                {subscription?.termVacationDate || school?.termVacationDate || 'Not set'}
              </strong>{' '}
              · Period Ends: {formatGhanaDate(subscription?.currentPeriodEnd)}
            </div>
          </div>
          {(user.role === 'SCHOOL_ADMIN' || user.role === 'SUPER_ADMIN') && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void startCheckout('CORE', 'TERM')}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846]"
              >
                Renew Core (1 Term)
              </button>
              <button
                type="button"
                onClick={() => void startCheckout('COMPLETE', 'TERM')}
                className="rounded-lg bg-[#148D82] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Upgrade / Renew Complete (1 Term)
              </button>
              <button
                type="button"
                onClick={() => void startCheckout('COMPLETE', 'THREE_TERMS')}
                className="rounded-lg bg-[#102846] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Complete 3 Terms (-10%)
              </button>
            </div>
          )}
        </div>

        {(user.role === 'SCHOOL_ADMIN' ||
          user.role === 'HEADTEACHER' ||
          user.role === 'SUPER_ADMIN') && (
          <form
            onSubmit={saveVacationDate}
            className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-end justify-between gap-3"
          >
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#102846]">
                When does your school vacate this term? (Term Vacation Date)
              </label>
              <p className="text-[11px] text-[#64748B]">
                Once this vacation date is reached, your school portal closes automatically until
                renewed for the new term.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                required
                type="date"
                min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                value={vacationDateInput > todayStr ? vacationDateInput : ''}
                onChange={(e) => setVacationDateInput(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono"
              />
              <button
                type="submit"
                disabled={vacBusy}
                className="rounded-lg bg-[#102846] px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                {vacBusy ? 'Saving...' : 'Save Vacation Date'}
              </button>
            </div>
          </form>
        )}

        {subInfo?.planCatalog?.filter((p: any) => p.isActive !== false).length > 0 && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
            {subInfo.planCatalog
              .filter((p: any) => p.isActive !== false)
              .map((p: any) => (
                <div key={p.code} className="rounded-lg border border-slate-200 p-3 bg-[#FBF8F1]">
                  <div className="flex items-center justify-between text-xs font-bold text-[#102846]">
                    <span>{p.name}</span>
                    <span className="font-mono text-[#148D82]">{p.startingPriceLabel}</span>
                  </div>
                  <div className="text-[11px] text-[#64748B] mt-0.5">{p.durationLabel}</div>
                </div>
              ))}
          </div>
        )}

        {subInfo?.invoices?.length > 0 && (
          <div className="text-xs text-[#64748B] space-y-1 pt-2 border-t border-slate-100">
            {subInfo.invoices.map((inv: any) => (
              <div key={inv._id} className="font-mono">
                {inv.invoiceNumber} · {inv.plan} · {formatGhs(inv.amountGhs)} · {inv.status}
              </div>
            ))}
          </div>
        )}
      </div>

      {(user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN' || user.role === 'HEADTEACHER') && (
        <form
          onSubmit={saveDashboardCustomization}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#102846] inline-flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#148D82]" /> Customize School Dashboard
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Personalize your school&apos;s workspace colors, welcome message, default landing
                module, and visible overview widgets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Dashboard Welcome Headline
              </label>
              <input
                maxLength={120}
                value={dashForm.customTitle}
                onChange={(e) => setDashForm((p) => ({ ...p, customTitle: e.target.value }))}
                placeholder={`e.g. Welcome to ${school?.name || 'Our School'} Portal`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Default Landing Workspace Tab
              </label>
              <select
                value={dashForm.defaultLandingTab}
                onChange={(e) =>
                  setDashForm((p) => ({
                    ...p,
                    defaultLandingTab: e.target.value as NonNullable<
                      DashboardSettings['defaultLandingTab']
                    >,
                  }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
              >
                <option value="overview">Dashboard Overview</option>
                <option value="students">Students &amp; Guardians</option>
                <option value="academics">Classes, Staff &amp; Setup</option>
                <option value="marks">Marks Entry</option>
                <option value="reports">Approvals &amp; Report Cards</option>
                <option value="attendance">Attendance</option>
                <option value="analytics">Academic Analytics</option>
                <option value="finance">School Fees &amp; Finance</option>
                <option value="operations">Admissions, Staff &amp; Timetable</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                School Dashboard Welcome Notice
              </label>
              <textarea
                rows={2}
                maxLength={400}
                value={dashForm.welcomeMessage}
                onChange={(e) => setDashForm((p) => ({ ...p, welcomeMessage: e.target.value }))}
                placeholder="Optional note for staff, teachers, and administrators on the overview screen."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#102846]">
              Sidebar &amp; Highlight Colour Theme
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DASHBOARD_THEME_PRESETS.map((preset) => {
                const selected =
                  dashForm.primaryColor.toUpperCase() === preset.primaryColor.toUpperCase() &&
                  dashForm.accentColor.toUpperCase() === preset.accentColor.toUpperCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setDashForm((p) => ({
                        ...p,
                        primaryColor: preset.primaryColor,
                        accentColor: preset.accentColor,
                      }))
                    }
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      selected
                        ? 'border-2 border-[#148D82] bg-[#FBF8F1]'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1 shrink-0">
                      <span
                        className={`w-6 h-6 rounded-md border border-black/10 ${preset.sidebarBgClass}`}
                      />
                      <span
                        className={`w-4 h-6 rounded-md border border-black/10 ${preset.accentBgClass}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#102846] truncate">
                        {preset.label}
                      </div>
                      <div className="text-[11px] font-mono text-[#64748B]">
                        {preset.primaryColor} · {preset.accentColor}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-[#102846]">
              Visible Dashboard Sections &amp; Branding
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-[#102846]">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dashForm.showSchoolLogoInSidebar}
                  onChange={(e) =>
                    setDashForm((p) => ({ ...p, showSchoolLogoInSidebar: e.target.checked }))
                  }
                />
                <span>Show school crest &amp; motto in sidebar</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dashForm.showSubscriptionBanner}
                  onChange={(e) =>
                    setDashForm((p) => ({ ...p, showSubscriptionBanner: e.target.checked }))
                  }
                />
                <span>Show subscription status card</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dashForm.showMetricsCards}
                  onChange={(e) =>
                    setDashForm((p) => ({ ...p, showMetricsCards: e.target.checked }))
                  }
                />
                <span>Show key school metric cards</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dashForm.showOnboardingChecklist}
                  onChange={(e) =>
                    setDashForm((p) => ({ ...p, showOnboardingChecklist: e.target.checked }))
                  }
                />
                <span>Show onboarding checklist</span>
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dashForm.showNotificationsWidget}
                  onChange={(e) =>
                    setDashForm((p) => ({ ...p, showNotificationsWidget: e.target.checked }))
                  }
                />
                <span>Show recent notifications feed</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={dashBusy}
              className="rounded-lg bg-[#148D82] hover:bg-[#10766c] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {dashBusy ? 'Saving...' : 'Save Dashboard Customization'}
            </button>
            <button
              type="button"
              disabled={dashBusy}
              onClick={() => void resetDashboardCustomization()}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#102846] hover:bg-[#FBF8F1] disabled:opacity-60"
            >
              Reset to Defaults
            </button>
          </div>
        </form>
      )}

      {(user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN' || user.role === 'HEADTEACHER') && (
        <form onSubmit={saveSettings} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h3 className="text-base font-bold text-[#102846]">School Profile, Report Layout & Paystack Merchant</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">School Motto</label>
              <input value={motto} onChange={(e) => setMotto(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Headteacher Name (for Report Cards)</label>
              <input value={headName} onChange={(e) => setHeadName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">Next Term Reopening Date</label>
              <input type="date" value={reopening} onChange={(e) => setReopening(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">School Crest / Logo (PNG/JPG, max 500KB)</label>
              <input type="file" accept="image/png,image/jpeg" onChange={handleLogoFile} className="text-xs" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">School Paystack Public Key</label>
              <input value={paystackPub} onChange={(e) => setPaystackPub(e.target.value)} placeholder="pk_test_... or pk_live_..." className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                School Paystack Secret Key (encrypted on server)
              </label>
              <input type="password" value={paystackSec} onChange={(e) => setPaystackSec(e.target.value)} placeholder="Leave blank to keep existing" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="rounded-lg bg-[#148D82] px-5 py-2 text-sm font-semibold text-white">
              Save School Settings
            </button>
            <button
              type="button"
              onClick={() => void downloadProtectedFile('/api/school/data-export', 'nexasua-school-data-export.json')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-[#102846]"
            >
              Export School Data (Act 843)
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
