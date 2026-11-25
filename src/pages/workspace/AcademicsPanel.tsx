import React, { useEffect, useState } from 'react';
import { Download, FileUp, Sparkles } from 'lucide-react';
import { EmptyState } from '../../components/BrandLogo';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import type { AuthUser } from '../../types/nexasua';

export function AcademicsSetupPanel({
  onChanged,
}: {
  onChanged: () => void;
}) {
  const [years, setYears] = useState<Array<any>>([]);
  const [terms, setTerms] = useState<Array<any>>([]);
  const [classes, setClasses] = useState<Array<any>>([]);
  const [subjects, setSubjects] = useState<Array<any>>([]);
  const [users, setUsers] = useState<Array<any>>([]);
  const [assignments, setAssignments] = useState<Array<any>>([]);
  const [configs, setConfigs] = useState<Array<any>>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [yearForm, setYearForm] = useState({ name: '2026/2027', startDate: '2026-09-01', endDate: '2027-07-31', isCurrent: true });
  const [termForm, setTermForm] = useState({ academicYearId: '', name: 'Term 1', startDate: '2026-09-07', endDate: '2026-12-18', reopeningDate: '2027-01-11', isCurrent: true });
  const [clsForm, setClsForm] = useState({ name: '', level: 'Junior High School', capacity: 45, room: '' });
  const [subjForm, setSubjForm] = useState({ name: '', code: '', level: 'All', isCore: true });
  const [userForm, setUserForm] = useState({ fullName: '', email: '', phone: '', password: '', role: 'SUBJECT_TEACHER' });
  const [assignForm, setAssignForm] = useState({ teacherId: '', classId: '', subjectId: '', academicYearId: '', isClassTeacher: false });

  const load = async () => {
    const [ay, cl, sb, us, asg, cfg] = await Promise.all([
      apiFetch<{ academicYears: Array<any>; terms: Array<any> }>('/api/school/academic-years'),
      apiFetch<{ classes: Array<any> }>('/api/school/classes'),
      apiFetch<{ subjects: Array<any> }>('/api/school/subjects'),
      apiFetch<{ users: Array<any> }>('/api/school/users'),
      apiFetch<{ assignments: Array<any> }>('/api/school/teacher-assignments'),
      apiFetch<{ configs: Array<any> }>('/api/academics/configs'),
    ]);
    setYears(ay.academicYears);
    setTerms(ay.terms);
    setClasses(cl.classes);
    setSubjects(sb.subjects);
    setUsers(us.users);
    setAssignments(asg.assignments);
    setConfigs(cfg.configs);

    if (ay.academicYears[0] && !termForm.academicYearId) {
      setTermForm((p) => ({ ...p, academicYearId: ay.academicYears[0]._id }));
      setAssignForm((p) => ({ ...p, academicYearId: ay.academicYears[0]._id }));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (fn: () => Promise<void>, successText: string) => {
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(successText);
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Operation failed.');
    }
  };

  const teachers = users.filter((u) =>
    ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'HEADTEACHER'].includes(u.role)
  );

  return (
    <div className="space-y-8">
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {/* Academic Years & Terms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Academic Years</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                () => apiFetch('/api/school/academic-years', { method: 'POST', body: JSON.stringify(yearForm) }),
                'Academic year created.'
              );
            }}
            className="grid grid-cols-2 gap-3"
          >
            <input required placeholder="2026/2027" value={yearForm.name} onChange={(e) => setYearForm({ ...yearForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="date" value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="date" value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Add Year</button>
          </form>
          <div className="text-xs text-[#64748B] space-y-1">
            {years.map((y) => (
              <div key={y._id}>{y.name} ({y.startDate} to {y.endDate}) {y.isCurrent ? '· Current' : ''}</div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Academic Terms</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                () => apiFetch('/api/school/terms', { method: 'POST', body: JSON.stringify(termForm) }),
                'Term created.'
              );
            }}
            className="grid grid-cols-2 gap-3"
          >
            <select required value={termForm.academicYearId} onChange={(e) => setTermForm({ ...termForm, academicYearId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Select Year</option>
              {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
            </select>
            <input required placeholder="Term 1" value={termForm.name} onChange={(e) => setTermForm({ ...termForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="date" value={termForm.startDate} onChange={(e) => setTermForm({ ...termForm, startDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="date" value={termForm.endDate} onChange={(e) => setTermForm({ ...termForm, endDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Reopening Date (YYYY-MM-DD)" value={termForm.reopeningDate} onChange={(e) => setTermForm({ ...termForm, reopeningDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Add Term</button>
          </form>
          <div className="text-xs text-[#64748B] space-y-1">
            {terms.map((t) => (
              <div key={t._id}>{t.name} ({t.startDate} to {t.endDate}) {t.isCurrent ? '· Current' : ''}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Classes & Subjects */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Classes</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await apiFetch('/api/school/classes', { method: 'POST', body: JSON.stringify(clsForm) });
                setClsForm({ name: '', level: 'Junior High School', capacity: 45, room: '' });
              }, 'Class created.');
            }}
            className="grid grid-cols-2 gap-3"
          >
            <input required placeholder="e.g. JHS 2A" value={clsForm.name} onChange={(e) => setClsForm({ ...clsForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={clsForm.level} onChange={(e) => setClsForm({ ...clsForm, level: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option>Kindergarten</option>
              <option>Primary</option>
              <option>Junior High School</option>
              <option>Senior High School</option>
            </select>
            <input placeholder="Room (optional)" value={clsForm.room} onChange={(e) => setClsForm({ ...clsForm, room: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Add Class</button>
          </form>
          <div className="text-xs text-[#64748B] space-y-1">
            {classes.map((c) => (
              <div key={c._id}>{c.name} · {c.level} {c.classTeacherId ? `· Class Teacher: ${c.classTeacherId.fullName}` : ''}</div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Subjects</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await apiFetch('/api/school/subjects', { method: 'POST', body: JSON.stringify(subjForm) });
                setSubjForm({ name: '', code: '', level: 'All', isCore: true });
              }, 'Subject added.');
            }}
            className="grid grid-cols-2 gap-3"
          >
            <input required placeholder="e.g. Integrated Science" value={subjForm.name} onChange={(e) => setSubjForm({ ...subjForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required placeholder="Code (e.g. SCI101)" value={subjForm.code} onChange={(e) => setSubjForm({ ...subjForm, code: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase font-mono" />
            <select value={subjForm.level} onChange={(e) => setSubjForm({ ...subjForm, level: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="All">All Levels</option>
              <option>Kindergarten</option>
              <option>Primary</option>
              <option>Junior High School</option>
              <option>Senior High School</option>
            </select>
            <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Add Subject</button>
          </form>
          <div className="text-xs text-[#64748B] space-y-1">
            {subjects.map((s) => (
              <div key={s._id}><span className="font-mono">{s.code}</span> · {s.name} ({s.level})</div>
            ))}
          </div>
        </div>
      </div>

      {/* School User Accounts & Teacher Assignments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Create Teacher / Staff / Parent Account</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await apiFetch('/api/school/users', { method: 'POST', body: JSON.stringify(userForm) });
                setUserForm({ fullName: '', email: '', phone: '', password: '', role: 'SUBJECT_TEACHER' });
              }, 'Account created.');
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <input required placeholder="Full Name" value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="email" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input placeholder="Phone" value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required type="password" minLength={8} placeholder="Password (min 8)" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="SUBJECT_TEACHER">Subject Teacher</option>
              <option value="CLASS_TEACHER">Class Teacher</option>
              <option value="HEADTEACHER">Headteacher / Principal</option>
              <option value="BURSAR">Bursar / Finance Officer</option>
              <option value="ADMIN_STAFF">Administrative Staff</option>
              <option value="PARENT">Parent / Guardian</option>
            </select>
            <button type="submit" className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Create Account</button>
          </form>
          <div className="text-xs text-[#64748B] max-h-36 overflow-y-auto space-y-1">
            {users.map((u) => (
              <div key={u._id}>{u.fullName} · {u.email} · {u.role}</div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Assign Teacher to Class & Subject</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(
                () => apiFetch('/api/school/teacher-assignments', { method: 'POST', body: JSON.stringify(assignForm) }),
                'Teacher assigned.'
              );
            }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            <select required value={assignForm.academicYearId} onChange={(e) => setAssignForm({ ...assignForm, academicYearId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Academic Year</option>
              {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
            </select>
            <select required value={assignForm.teacherId} onChange={(e) => setAssignForm({ ...assignForm, teacherId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Select Teacher</option>
              {teachers.map((t) => <option key={t._id} value={t._id}>{t.fullName} ({t.role})</option>)}
            </select>
            <select required value={assignForm.classId} onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Select Class</option>
              {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select required value={assignForm.subjectId} onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="">Select Subject</option>
              {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-xs text-[#102846] sm:col-span-2">
              <input type="checkbox" checked={assignForm.isClassTeacher} onChange={(e) => setAssignForm({ ...assignForm, isClassTeacher: e.target.checked })} className="accent-[#148D82]" />
              <span>Designate as Class Teacher for this class</span>
            </label>
            <button type="submit" className="sm:col-span-2 rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Save Assignment</button>
          </form>
          <div className="text-xs text-[#64748B] max-h-36 overflow-y-auto space-y-1">
            {assignments.map((a) => (
              <div key={a._id}>
                {a.teacherId?.fullName} → {a.classId?.name} · {a.subjectId?.name} {a.isClassTeacher ? '(Class Teacher)' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Assessment Config Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="text-base font-bold text-[#102846]">Active Assessment & Grading Schemes</h3>
        {configs.map((cfg) => (
          <div key={cfg._id} className="border border-slate-200 rounded-lg p-4 text-xs space-y-1.5">
            <div className="font-bold text-sm text-[#102846]">{cfg.name} {cfg.isDefault ? '· Default' : ''}</div>
            <div className="text-[#64748B]">
              Pass mark: {cfg.passMark}% · Rounding: {cfg.roundingMode} · Categories:{' '}
              {cfg.categories.map((c: any) => `${c.label} (${c.weightPercent}% / max ${c.maxMarks})`).join(', ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarksEntryPanel({ user }: { user: AuthUser }) {
  const [years, setYears] = useState<Array<any>>([]);
  const [terms, setTerms] = useState<Array<any>>([]);
  const [classes, setClasses] = useState<Array<any>>([]);
  const [subjects, setSubjects] = useState<Array<any>>([]);
  const [assignments, setAssignments] = useState<Array<any>>([]);
  const [configs, setConfigs] = useState<Array<any>>([]);

  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [configId, setConfigId] = useState('');

  const [rows, setRows] = useState<Array<any>>([]);
  const [inputs, setInputs] = useState<Record<string, Record<string, string>>>({});
  const [correctionReason, setCorrectionReason] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [aiDraft, setAiDraft] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ academicYears: Array<any>; terms: Array<any> }>('/api/school/academic-years'),
      apiFetch<{ classes: Array<any> }>('/api/school/classes'),
      apiFetch<{ subjects: Array<any> }>('/api/school/subjects'),
      apiFetch<{ assignments: Array<any> }>('/api/school/teacher-assignments'),
      apiFetch<{ configs: Array<any> }>('/api/academics/configs'),
    ]).then(([ay, cl, sb, asg, cfg]) => {
      setYears(ay.academicYears);
      setTerms(ay.terms);
      setClasses(cl.classes);
      setSubjects(sb.subjects);
      setAssignments(asg.assignments);
      setConfigs(cfg.configs);

      const curYear = ay.academicYears.find((y) => y.isCurrent) || ay.academicYears[0];
      const curTerm = ay.terms.find((t) => t.isCurrent) || ay.terms[0];
      const defCfg = cfg.configs.find((c) => c.isDefault) || cfg.configs[0];
      if (curYear) setYearId(curYear._id);
      if (curTerm) setTermId(curTerm._id);
      if (defCfg) setConfigId(defCfg._id);
    });
  }, []);

  const isTeacher = user.role === 'CLASS_TEACHER' || user.role === 'SUBJECT_TEACHER';
  const selectableClasses = isTeacher
    ? classes.filter((c) => assignments.some((a) => String(a.classId?._id || a.classId) === String(c._id)))
    : classes;

  const selectableSubjects = isTeacher
    ? subjects.filter((s) =>
        assignments.some(
          (a) =>
            String(a.subjectId?._id || a.subjectId) === String(s._id) &&
            (!classId || String(a.classId?._id || a.classId) === classId)
        )
      )
    : subjects;

  const activeConfig = configs.find((c) => c._id === configId);

  const loadRoster = async () => {
    if (!yearId || !termId || !classId || !subjectId) return;
    setErr('');
    setMsg('');
    try {
      const data = await apiFetch<{ rows: Array<any> }>(
        `/api/academics/scores?academicYearId=${yearId}&termId=${termId}&classId=${classId}&subjectId=${subjectId}`
      );
      setRows(data.rows);
      const nextInputs: Record<string, Record<string, string>> = {};
      data.rows.forEach((r) => {
        const map: Record<string, string> = {};
        const catScores = r.scoreRecord?.categoryScores || {};
        activeConfig?.categories?.forEach((cat: any) => {
          const entry = catScores[cat.key];
          map[cat.key] =
            entry && !entry.isMissing && entry.rawScore !== null && entry.rawScore !== undefined
              ? String(entry.rawScore)
              : '';
        });
        nextInputs[r.student._id] = map;
      });
      setInputs(nextInputs);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load marks sheet.');
    }
  };

  useEffect(() => {
    if (yearId && termId && classId && subjectId && activeConfig) {
      void loadRoster();
    }
  }, [yearId, termId, classId, subjectId, configId]);

  const saveScores = async (submitForReview: boolean) => {
    if (!activeConfig) return;
    setErr('');
    setMsg('');
    try {
      const entries = rows.map((r) => {
        const studentInputs = inputs[r.student._id] || {};
        const scores: Record<string, number | null> = {};
        activeConfig.categories.forEach((cat: any) => {
          const val = studentInputs[cat.key];
          scores[cat.key] = val === '' || val === undefined ? null : Number(val);
        });
        return { studentId: r.student._id, scores };
      });

      const res = await apiFetch<{ savedCount: number; errors: string[] }>('/api/academics/scores', {
        method: 'POST',
        body: JSON.stringify({
          academicYearId: yearId,
          termId,
          classId,
          subjectId,
          assessmentConfigId: configId,
          submitForReview,
          correctionReason: correctionReason || undefined,
          entries,
        }),
      });
      setMsg(
        submitForReview
          ? `Submitted ${res.savedCount} student marks for review.`
          : `Saved ${res.savedCount} student marks as draft.`
      );
      if (res.errors?.length) setErr(res.errors.join(' '));
      await loadRoster();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Saving scores failed.');
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !yearId || !termId || !classId || !subjectId || !configId) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('academicYearId', yearId);
    formData.append('termId', termId);
    formData.append('classId', classId);
    formData.append('subjectId', subjectId);
    formData.append('assessmentConfigId', configId);
    try {
      const res = await apiFetch<{ imported: number; errors: string[] }>('/api/academics/scores/import', {
        method: 'POST',
        body: formData,
      });
      setMsg(`Imported ${res.imported} marks rows.`);
      if (res.errors?.length) setErr(res.errors.join(' · '));
      await loadRoster();
    } catch (err2) {
      setErr(err2 instanceof Error ? err2.message : 'Bulk import failed.');
    }
  };

  const requestAiRemark = async () => {
    try {
      const res = await apiFetch<{ draft: string }>('/api/academics/ai-draft', {
        method: 'POST',
        body: JSON.stringify({
          task: 'TEACHER_REMARK',
          context: { average: 72, attendancePercent: 95, grade: 'B2' },
        }),
      });
      setAiDraft(res.draft);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'AI draft unavailable.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid grid-cols-1 sm:grid-cols-5 gap-3">
        <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Academic Year</option>
          {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
        </select>
        <select value={termId} onChange={(e) => setTermId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Term</option>
          {terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Select Class</option>
          {selectableClasses.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          <option value="">Select Subject</option>
          {selectableSubjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select value={configId} onChange={(e) => setConfigId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          {configs.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
      </div>

      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {!classId || !subjectId ? (
        <EmptyState
          title="Select a class and subject"
          description="Choose an academic year, term, assigned class, and subject above to enter or upload examination marks."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No active students in this class"
          description="Enroll students into this class first before entering assessment scores."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#64748B]">
              Leave a cell blank for missing marks; enter <span className="font-mono">0</span> for an earned zero.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846] cursor-pointer hover:bg-[#FBF8F1]">
                <FileUp className="w-3.5 h-3.5" />
                <span>Upload CSV/XLSX</span>
                <input type="file" accept=".csv,.xlsx" onChange={handleBulkUpload} className="hidden" />
              </label>
              <button
                type="button"
                onClick={() => void requestAiRemark()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#E2A83B]" />
                <span>Optional Remark Draft</span>
              </button>
            </div>
          </div>

          {aiDraft && (
            <div className="px-4 py-2 bg-[#FBF8F1] border-b border-slate-200 text-xs text-[#102846]">
              AI Draft Remark (review before use): {aiDraft}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-[#FBF8F1] text-xs font-semibold text-[#102846]">
                  <th className="py-3 px-4">Admission No</th>
                  <th className="py-3 px-4">Student Name</th>
                  {activeConfig?.categories?.map((cat: any) => (
                    <th key={cat.key} className="py-3 px-3 text-right">
                      {cat.label} (/{cat.maxMarks})
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right">Final %</th>
                  <th className="py-3 px-3">Grade</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.map((r) => {
                  const sc = r.scoreRecord;
                  return (
                    <tr key={r.student._id}>
                      <td className="py-2.5 px-4 font-mono text-xs text-[#64748B]">
                        {r.student.admissionNumber}
                      </td>
                      <td className="py-2.5 px-4 font-medium text-[#102846]">
                        {r.student.fullName}
                      </td>
                      {activeConfig?.categories?.map((cat: any) => (
                        <td key={cat.key} className="py-2 px-3 text-right">
                          <input
                            type="number"
                            min={0}
                            max={cat.maxMarks}
                            step="0.5"
                            placeholder="—"
                            value={inputs[r.student._id]?.[cat.key] ?? ''}
                            onChange={(e) =>
                              setInputs((prev) => ({
                                ...prev,
                                [r.student._id]: {
                                  ...(prev[r.student._id] || {}),
                                  [cat.key]: e.target.value,
                                },
                              }))
                            }
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right font-mono text-xs tabular-nums"
                          />
                        </td>
                      ))}
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                        {sc?.finalScore !== null && sc?.finalScore !== undefined ? `${sc.finalScore}%` : 'INC'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#102846]">
                        {sc?.grade || '—'}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-[#64748B]">
                        {sc?.status || 'NOT ENTERED'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            {(user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN' || user.role === 'HEADTEACHER') && (
              <input
                placeholder="Correction reason (required only when editing published grades)"
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                className="flex-1 min-w-[240px] rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            )}
            <div className="flex gap-3 ml-auto">
              <button
                type="button"
                onClick={() => void saveScores(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-[#102846] hover:bg-[#FBF8F1]"
              >
                Save Draft
              </button>
              <button
                type="button"
                onClick={() => void saveScores(true)}
                className="rounded-lg bg-[#148D82] px-5 py-2 text-sm font-semibold text-white hover:bg-[#10766c]"
              >
                Submit for Approval
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApprovalsAndReportsPanel({ user }: { user: AuthUser }) {
  const [years, setYears] = useState<Array<any>>([]);
  const [terms, setTerms] = useState<Array<any>>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [summary, setSummary] = useState<Array<any>>([]);
  const [reportCards, setReportCards] = useState<Array<any>>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch<{ academicYears: Array<any>; terms: Array<any> }>('/api/school/academic-years').then(
      (ay) => {
        setYears(ay.academicYears);
        setTerms(ay.terms);
        const cy = ay.academicYears.find((y) => y.isCurrent) || ay.academicYears[0];
        const ct = ay.terms.find((t) => t.isCurrent) || ay.terms[0];
        if (cy) setYearId(cy._id);
        if (ct) setTermId(ct._id);
      }
    );
  }, []);

  const loadSummary = async () => {
    if (!yearId || !termId) return;
    const [sum, rc] = await Promise.all([
      apiFetch<{ summary: Array<any> }>(
        `/api/academics/review-summary?academicYearId=${yearId}&termId=${termId}`
      ),
      apiFetch<{ reportCards: Array<any> }>(
        `/api/academics/report-cards?academicYearId=${yearId}&termId=${termId}`
      ),
    ]);
    setSummary(sum.summary);
    setReportCards(rc.reportCards);
  };

  useEffect(() => {
    void loadSummary();
  }, [yearId, termId]);

  const runWorkflow = async (classId: string, action: 'REVIEW' | 'APPROVE' | 'PUBLISH') => {
    setErr('');
    setMsg('');
    try {
      const res = await apiFetch<{ modifiedCount: number }>('/api/academics/workflow', {
        method: 'POST',
        body: JSON.stringify({ academicYearId: yearId, termId, classId, action }),
      });
      setMsg(`Action ${action} updated ${res.modifiedCount} score records.`);
      await loadSummary();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Workflow failed.');
    }
  };

  const generateReports = async (classId: string) => {
    setErr('');
    setMsg('');
    try {
      const res = await apiFetch<{ generatedCount: number }>('/api/academics/report-cards/generate', {
        method: 'POST',
        body: JSON.stringify({ academicYearId: yearId, termId, classId }),
      });
      setMsg(`Generated ${res.generatedCount} terminal report cards.`);
      await loadSummary();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Report generation failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3">
        <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
        </select>
        <select value={termId} onChange={(e) => setTermId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          {terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
      </div>

      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {summary.length === 0 ? (
        <EmptyState
          title="No classes configured yet"
          description="Create classes and assign teachers to review subject submissions and publish report cards."
        />
      ) : (
        summary.map((cls) => (
          <div key={cls.classId} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-[#102846]">{cls.className}</h3>
                <div className="text-xs text-[#64748B]">
                  {cls.level} · {cls.expectedStudents} active learners
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void runWorkflow(cls.classId, 'REVIEW')}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846]"
                >
                  Mark Reviewed
                </button>
                {(user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN' || user.role === 'HEADTEACHER') && (
                  <>
                    <button
                      type="button"
                      onClick={() => void runWorkflow(cls.classId, 'APPROVE')}
                      className="rounded-lg bg-[#102846] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => void runWorkflow(cls.classId, 'PUBLISH')}
                      className="rounded-lg bg-[#148D82] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Publish Results
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void generateReports(cls.classId)}
                  className="rounded-lg bg-[#E2A83B] px-3 py-1.5 text-xs font-bold text-[#102846]"
                >
                  Generate Report Cards
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void downloadProtectedFile(
                      `/api/academics/report-cards/bulk/pdf?classId=${cls.classId}&academicYearId=${yearId}&termId=${termId}`,
                      `${cls.className}-report-cards.pdf`
                    ).catch((e) => setErr(e.message))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-[#102846]"
                >
                  <Download className="w-3.5 h-3.5" /> Bulk PDF
                </button>
              </div>
            </div>

            {cls.subjects.length === 0 ? (
              <div className="text-xs text-[#64748B]">No subjects assigned to this class yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[#64748B]">
                      <th className="py-2 pr-4">Subject</th>
                      <th className="py-2 pr-4">Teacher</th>
                      <th className="py-2 pr-4 text-right">Entered</th>
                      <th className="py-2 pr-4 text-right">Missing</th>
                      <th className="py-2">Statuses</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cls.subjects.map((sub: any) => (
                      <tr key={sub.subjectId}>
                        <td className="py-2 pr-4 font-semibold text-[#102846]">{sub.subjectName}</td>
                        <td className="py-2 pr-4 text-[#64748B]">{sub.teacherName}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">
                          {sub.enteredCount} / {sub.expectedStudents}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums text-amber-700">
                          {sub.missingCount}
                        </td>
                        <td className="py-2 text-[#64748B]">
                          Draft: {sub.statusCounts.DRAFT} · Submitted: {sub.statusCounts.SUBMITTED} ·
                          Reviewed: {sub.statusCounts.REVIEWED} · Published: {sub.statusCounts.PUBLISHED}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}

      {reportCards.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h3 className="text-base font-bold text-[#102846]">Issued Terminal Report Cards</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[#64748B]">
                  <th className="py-2 pr-4">Reference</th>
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Class</th>
                  <th className="py-2 pr-4 text-right">Average</th>
                  <th className="py-2 pr-4 text-right">Position</th>
                  <th className="py-2 text-right">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportCards.map((rc) => (
                  <tr key={rc._id}>
                    <td className="py-2.5 pr-4 font-mono">{rc.referenceNumber}</td>
                    <td className="py-2.5 pr-4 font-semibold text-[#102846]">
                      {rc.studentId?.fullName}
                    </td>
                    <td className="py-2.5 pr-4 text-[#64748B]">{rc.classId?.name}</td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                      {rc.overallAverage?.toFixed(1)}%
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                      {rc.classPosition ? `${rc.classPosition} / ${rc.totalStudentsInClass}` : '—'}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(
                            `/api/academics/report-cards/${rc._id}/pdf`,
                            `${rc.referenceNumber}.pdf`
                          )
                        }
                        className="font-semibold text-[#148D82] hover:underline"
                      >
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function AttendancePanel() {
  const [years, setYears] = useState<Array<any>>([]);
  const [terms, setTerms] = useState<Array<any>>([]);
  const [classes, setClasses] = useState<Array<any>>([]);
  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [students, setStudents] = useState<Array<any>>([]);
  const [marks, setMarks] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch<{ academicYears: Array<any>; terms: Array<any> }>('/api/school/academic-years'),
      apiFetch<{ classes: Array<any> }>('/api/school/classes'),
    ]).then(([ay, cl]) => {
      setYears(ay.academicYears);
      setTerms(ay.terms);
      setClasses(cl.classes);
      if (ay.academicYears[0]) setYearId(ay.academicYears[0]._id);
      if (ay.terms[0]) setTermId(ay.terms[0]._id);
      if (cl.classes[0]) setClassId(cl.classes[0]._id);
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    Promise.all([
      apiFetch<{ students: Array<any> }>(`/api/school/students?classId=${classId}&limit=100`),
      apiFetch<{ records: Array<any> }>(`/api/school/attendance?classId=${classId}&date=${date}`),
    ]).then(([stRes, attRes]) => {
      setStudents(stRes.students);
      const map: Record<string, 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'> = {};
      stRes.students.forEach((s) => {
        const found = attRes.records.find((r) => String(r.studentId?._id || r.studentId) === String(s._id));
        map[s._id] = found ? found.status : 'PRESENT';
      });
      setMarks(map);
    });
  }, [classId, date]);

  const saveAttendance = async () => {
    const entries = students.map((s) => ({
      studentId: s._id,
      status: marks[s._id] || 'PRESENT',
    }));
    const res = await apiFetch<{ saved: number }>('/api/school/attendance', {
      method: 'POST',
      body: JSON.stringify({ classId, academicYearId: yearId, termId, date, entries }),
    });
    setMsg(`Saved attendance for ${res.saved} learners on ${date}.`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-4 gap-3">
        <select value={yearId} onChange={(e) => setYearId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
        </select>
        <select value={termId} onChange={(e) => setTermId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          {terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
          {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}

      {students.length === 0 ? (
        <EmptyState
          title="No students in selected class"
          description="Select a class with enrolled learners to mark daily attendance."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#FBF8F1] text-xs font-semibold text-[#102846]">
                <th className="py-3 px-4">Admission No</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {students.map((st) => (
                <tr key={st._id}>
                  <td className="py-2.5 px-4 font-mono text-xs text-[#64748B]">{st.admissionNumber}</td>
                  <td className="py-2.5 px-4 font-medium text-[#102846]">{st.fullName}</td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="inline-flex gap-1">
                      {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((statusOpt) => (
                        <button
                          key={statusOpt}
                          type="button"
                          onClick={() => setMarks((p) => ({ ...p, [st._id]: statusOpt }))}
                          className={`px-2.5 py-1 rounded text-xs font-semibold border ${
                            marks[st._id] === statusOpt
                              ? 'bg-[#102846] text-white border-[#102846]'
                              : 'bg-white text-[#64748B] border-slate-200'
                          }`}
                        >
                          {statusOpt}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-4 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={() => void saveAttendance()}
              className="rounded-lg bg-[#148D82] px-5 py-2 text-sm font-semibold text-white"
            >
              Save Attendance Register
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AcademicAnalyticsPanel() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/academics/analytics').then(setData);
  }, []);

  if (!data) return <div className="text-sm text-[#64748B]">Loading academic analytics...</div>;
  if (!data.hasData) {
    return (
      <EmptyState
        title="No published results to analyze yet"
        description="Once teachers submit examination scores and the headteacher publishes them, real pass rates, grade distributions, and learner support insights will appear here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-[#64748B]">Overall Mean Score</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#102846] mt-1">
            {data.overallMean}%
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-[#64748B]">Overall Pass Rate</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#148D82] mt-1">
            {data.passRate}%
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="text-xs text-[#64748B]">Published Subject Scores</div>
          <div className="text-3xl font-bold font-mono tabular-nums text-[#102846] mt-1">
            {data.totalEvaluated}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h3 className="text-base font-bold text-[#102846]">Performance by Subject</h3>
          {data.bySubject.map((s: any) => (
            <div key={s.name} className="space-y-1">
              <div className="flex justify-between text-xs font-medium text-[#102846]">
                <span>{s.name}</span>
                <span className="font-mono tabular-nums">{s.average}% ({s.count} learners)</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#148D82]" style={{ width: `${Math.min(100, s.average)}%` }} />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h3 className="text-base font-bold text-[#102846]">Learners Needing Academic Support (&lt; 50%)</h3>
          {data.studentsNeedingSupport.length === 0 ? (
            <p className="text-xs text-[#64748B]">All evaluated learners are currently above the pass mark.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {data.studentsNeedingSupport.map((st: any) => (
                <div key={st.admissionNumber} className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="font-medium text-[#102846]">{st.fullName} ({st.admissionNumber})</span>
                  <span className="font-mono text-red-700 font-semibold">{st.average}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
