import React, { useEffect, useState } from 'react';
import { Copy, Download, Lock, Pause, Play, Ticket, Trash2 } from 'lucide-react';
import { EmptyState, formatGhanaDate, formatGhs } from '../../components/BrandLogo';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import type { AuthUser, SubscriptionSummary } from '../../types/nexasua';

export function CompletePlanGate({
  subscription,
  bypassGate = false,
  onGoToBilling,
  children,
}: {
  subscription: SubscriptionSummary | null;
  bypassGate?: boolean;
  onGoToBilling: () => void;
  children: React.ReactNode;
}) {
  if (!bypassGate && (!subscription || subscription.plan !== 'COMPLETE')) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4">
        <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[#FBF8F1] text-[#102846]">
          <Lock className="w-5 h-5" />
        </div>
        <h3 className="text-lg font-bold text-[#102846]">NexaSua Complete Plan Required</h3>
        <p className="text-sm text-[#64748B] max-w-lg mx-auto">
          School fees, Paystack invoicing, fee reminders, announcements, admissions, staff
          management, and timetables are part of NexaSua Complete. Core subscribers maintain full
          access to academics and terminal report cards.
        </p>
        <button
          type="button"
          onClick={onGoToBilling}
          className="rounded-lg bg-[#148D82] px-5 py-2.5 text-sm font-semibold text-white"
        >
          Upgrade to NexaSua Complete
        </button>
      </div>
    );
  }
  return <>{children}</>;
}

export function FinancePanel({ user }: { user: AuthUser }) {
  const [structures, setStructures] = useState<Array<any>>([]);
  const [invoices, setInvoices] = useState<Array<any>>([]);
  const [payments, setPayments] = useState<Array<any>>([]);
  const [reminders, setReminders] = useState<Array<any>>([]);
  const [feeCoupons, setFeeCoupons] = useState<Array<any>>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [students, setStudents] = useState<Array<any>>([]);
  const [years, setYears] = useState<Array<any>>([]);
  const [terms, setTerms] = useState<Array<any>>([]);
  const [copiedCode, setCopiedCode] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [feeForm, setFeeForm] = useState({
    academicYearId: '',
    termId: '',
    name: '',
    category: 'Tuition',
    amountGhs: 850,
  });

  const [invForm, setInvForm] = useState({
    studentId: '',
    academicYearId: '',
    termId: '',
    dueDate: new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10),
    description: 'Term Tuition Fee',
    category: 'Tuition',
    amountGhs: 850,
    discountGhs: 0,
    waiverGhs: 0,
    couponCode: '',
  });

  const [couponForm, setCouponForm] = useState({
    code: '',
    description: '',
    discountType: 'PERCENT' as 'PERCENT' | 'FIXED_GHS',
    discountPercent: 15,
    discountAmountGhs: 100,
    maxUses: '',
    expiresAt: '',
  });

  const [payForm, setPayForm] = useState({
    invoiceId: '',
    amountGhs: 0,
    channel: 'OFFLINE_MOMO',
    externalReference: '',
  });

  const [remForm, setRemForm] = useState({
    invoiceId: '',
    channel: 'IN_APP',
    subject: 'School Fees Payment Reminder',
    message: 'Dear Guardian, kindly settle the outstanding school fee balance before the due date.',
  });

  const load = async () => {
    const [stRes, ayRes, fsRes, invRes, payRes, remRes, anRes, cpRes] = await Promise.all([
      apiFetch<{ students: Array<any> }>('/api/school/students?limit=100'),
      apiFetch<{ academicYears: Array<any>; terms: Array<any> }>('/api/school/academic-years'),
      apiFetch<{ structures: Array<any> }>('/api/complete/fee-structures'),
      apiFetch<{ invoices: Array<any> }>('/api/complete/invoices'),
      apiFetch<{ payments: Array<any> }>('/api/complete/payments'),
      apiFetch<{ reminders: Array<any> }>('/api/complete/reminders'),
      apiFetch('/api/complete/analytics'),
      apiFetch<{ coupons: Array<any> }>('/api/complete/fee-coupons').catch(() => ({ coupons: [] })),
    ]);
    setStudents(stRes.students);
    setYears(ayRes.academicYears);
    setTerms(ayRes.terms);
    setStructures(fsRes.structures);
    setInvoices(invRes.invoices);
    setPayments(payRes.payments);
    setReminders(remRes.reminders);
    setAnalytics(anRes);
    setFeeCoupons(cpRes.coupons || []);

    if (ayRes.academicYears[0] && !feeForm.academicYearId) {
      setFeeForm((p) => ({ ...p, academicYearId: ayRes.academicYears[0]._id }));
      setInvForm((p) => ({ ...p, academicYearId: ayRes.academicYears[0]._id }));
    }
    if (ayRes.terms[0] && !feeForm.termId) {
      setFeeForm((p) => ({ ...p, termId: ayRes.terms[0]._id }));
      setInvForm((p) => ({ ...p, termId: ayRes.terms[0]._id }));
    }
    if (stRes.students[0] && !invForm.studentId) {
      setInvForm((p) => ({ ...p, studentId: stRes.students[0]._id }));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const canMutate =
    user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN' || user.role === 'BURSAR';

  const run = async (fn: () => Promise<void>, success: string) => {
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(success);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Finance action failed.');
    }
  };

  return (
    <div className="space-y-6">
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {/* Financial Summary */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-[#64748B]">Total Billed</div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#102846] mt-1">
              {formatGhs(analytics.finance.totalBilledGhs)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-[#64748B]">Total Collected</div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#148D82] mt-1">
              {formatGhs(analytics.finance.totalCollectedGhs)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-[#64748B]">Outstanding Balance</div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#102846] mt-1">
              {formatGhs(analytics.finance.outstandingGhs)}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-[#64748B]">Collection Rate</div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#102846] mt-1">
              {analytics.finance.collectionRatePercent}%
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void downloadProtectedFile('/api/complete/analytics/export/pdf', 'nexasua-financial-summary.pdf')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#102846]"
        >
          <Download className="w-3.5 h-3.5" /> Export Financial PDF
        </button>
        <button
          type="button"
          onClick={() => void downloadProtectedFile('/api/complete/analytics/export/csv', 'nexasua-financial-summary.csv')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#102846]"
        >
          <Download className="w-3.5 h-3.5" /> Export Financial CSV
        </button>
      </div>

      {canMutate && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fee Structure */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await apiFetch('/api/complete/fee-structures', {
                  method: 'POST',
                  body: JSON.stringify(feeForm),
                });
                setFeeForm({ ...feeForm, name: '' });
              }, 'Fee item added.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
          >
            <h3 className="text-base font-bold text-[#102846]">Configure Fee Structure</h3>
            <div className="grid grid-cols-2 gap-3">
              <select value={feeForm.academicYearId} onChange={(e) => setFeeForm({ ...feeForm, academicYearId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
              </select>
              <select value={feeForm.termId} onChange={(e) => setFeeForm({ ...feeForm, termId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
              <input required placeholder="Fee Name (e.g. JHS Tuition)" value={feeForm.name} onChange={(e) => setFeeForm({ ...feeForm, name: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <select value={feeForm.category} onChange={(e) => setFeeForm({ ...feeForm, category: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {['Tuition', 'Examination', 'Feeding', 'Transport', 'Boarding', 'Development Levy', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input required type="number" min={0} step="0.01" placeholder="Amount GH₵" value={feeForm.amountGhs} onChange={(e) => setFeeForm({ ...feeForm, amountGhs: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Add Fee Item</button>
            </div>
            {structures.length > 0 && (
              <div className="text-xs text-[#64748B] pt-2 space-y-1">
                {structures.map((s) => (
                  <div key={s._id}>{s.name} ({s.category}) · {formatGhs(s.amountGhs)}</div>
                ))}
              </div>
            )}
          </form>

          {/* Create Student Invoice */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await apiFetch('/api/complete/invoices', {
                  method: 'POST',
                  body: JSON.stringify({
                    studentId: invForm.studentId,
                    academicYearId: invForm.academicYearId,
                    termId: invForm.termId,
                    dueDate: invForm.dueDate,
                    discountGhs: invForm.discountGhs,
                    waiverGhs: invForm.waiverGhs,
                    ...(invForm.couponCode.trim()
                      ? { couponCode: invForm.couponCode.trim().toUpperCase() }
                      : {}),
                    items: [
                      {
                        description: invForm.description,
                        category: invForm.category,
                        amountGhs: invForm.amountGhs,
                      },
                    ],
                  }),
                });
                setInvForm((p) => ({ ...p, couponCode: '' }));
              }, 'Student fee invoice created.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
          >
            <h3 className="text-base font-bold text-[#102846]">Issue Student Fee Invoice</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select required value={invForm.studentId} onChange={(e) => setInvForm({ ...invForm, studentId: e.target.value })} className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                <option value="">Select Student</option>
                {students.map((st) => <option key={st._id} value={st._id}>{st.fullName} ({st.admissionNumber})</option>)}
              </select>
              <input required placeholder="Line Item Description" value={invForm.description} onChange={(e) => setInvForm({ ...invForm, description: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required type="number" min={1} step="0.01" placeholder="Amount GH₵" value={invForm.amountGhs} onChange={(e) => setInvForm({ ...invForm, amountGhs: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              <input type="number" min={0} placeholder="Discount GH₵" value={invForm.discountGhs} onChange={(e) => setInvForm({ ...invForm, discountGhs: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              <input type="date" value={invForm.dueDate} onChange={(e) => setInvForm({ ...invForm, dueDate: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <div className="sm:col-span-2 flex flex-col sm:flex-row gap-2">
                <input
                  placeholder="Fee Coupon Code (optional)"
                  value={invForm.couponCode}
                  onChange={(e) =>
                    setInvForm({
                      ...invForm,
                      couponCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                    })
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                />
                {feeCoupons.filter((c) => c.active).length > 0 && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setInvForm((p) => ({ ...p, couponCode: e.target.value }));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white"
                  >
                    <option value="">Pick active coupon...</option>
                    {feeCoupons
                      .filter((c) => c.active)
                      .map((c) => (
                        <option key={c._id} value={c.code}>
                          {c.code} (
                          {c.discountType === 'FIXED_GHS'
                            ? `${formatGhs(c.discountAmountGhs)}`
                            : `${c.discountPercent}%`}
                          )
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <button type="submit" className="sm:col-span-2 rounded-lg bg-[#148D82] px-4 py-2.5 text-sm font-semibold text-white">Issue Invoice</button>
            </div>
          </form>
        </div>
      )}

      {canMutate && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-[#102846] inline-flex items-center gap-2">
                <Ticket className="w-4 h-4 text-[#148D82]" /> Student Fee Coupons &amp; Vouchers
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Create school fee discount vouchers (e.g. sibling, PTA, or bursary grants) and apply
                them when issuing invoices.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await apiFetch('/api/complete/fee-coupons', {
                  method: 'POST',
                  body: JSON.stringify({
                    code: couponForm.code.trim().toUpperCase(),
                    description: couponForm.description.trim(),
                    discountType: couponForm.discountType,
                    discountPercent:
                      couponForm.discountType === 'PERCENT' ? Number(couponForm.discountPercent) : 0,
                    discountAmountGhs:
                      couponForm.discountType === 'FIXED_GHS'
                        ? Number(couponForm.discountAmountGhs)
                        : 0,
                    maxUses: couponForm.maxUses ? Number(couponForm.maxUses) : null,
                    expiresAt: couponForm.expiresAt || null,
                  }),
                });
                setCouponForm({
                  code: '',
                  description: '',
                  discountType: 'PERCENT',
                  discountPercent: 15,
                  discountAmountGhs: 100,
                  maxUses: '',
                  expiresAt: '',
                });
              }, 'Student fee coupon created.');
            }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
          >
            <div className="flex gap-1.5">
              <input
                required
                placeholder="Code (e.g. SIBLING15)"
                value={couponForm.code}
                onChange={(e) =>
                  setCouponForm({
                    ...couponForm,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''),
                  })
                }
                className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
              />
              <button
                type="button"
                onClick={() => {
                  const s = Math.random().toString(36).slice(2, 6).toUpperCase();
                  setCouponForm((p) => ({ ...p, code: `FEE-${s}` }));
                }}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-semibold text-[#102846] hover:bg-[#FBF8F1]"
              >
                Auto
              </button>
            </div>

            <select
              value={couponForm.discountType}
              onChange={(e) =>
                setCouponForm({
                  ...couponForm,
                  discountType: e.target.value as 'PERCENT' | 'FIXED_GHS',
                })
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              <option value="PERCENT">Percentage (% off)</option>
              <option value="FIXED_GHS">Fixed Amount (GH₵ off)</option>
            </select>

            {couponForm.discountType === 'PERCENT' ? (
              <input
                required
                type="number"
                min={1}
                max={100}
                placeholder="Discount %"
                value={couponForm.discountPercent}
                onChange={(e) =>
                  setCouponForm({ ...couponForm, discountPercent: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            ) : (
              <input
                required
                type="number"
                min={1}
                step="0.01"
                placeholder="Amount GH₵"
                value={couponForm.discountAmountGhs}
                onChange={(e) =>
                  setCouponForm({ ...couponForm, discountAmountGhs: Number(e.target.value) })
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            )}

            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                placeholder="Max uses"
                value={couponForm.maxUses}
                onChange={(e) => setCouponForm({ ...couponForm, maxUses: e.target.value })}
                className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs font-mono"
              />
              <input
                type="date"
                value={couponForm.expiresAt}
                onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                className="rounded-lg border border-slate-300 px-2 py-2 text-xs font-mono"
              />
            </div>

            <input
              required
              placeholder="Coupon Reason (e.g. PTA Merit Voucher)"
              value={couponForm.description}
              onChange={(e) => setCouponForm({ ...couponForm, description: e.target.value })}
              className="sm:col-span-2 lg:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white hover:bg-[#193a63]"
            >
              Create Fee Coupon
            </button>
          </form>

          {feeCoupons.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {feeCoupons.map((c) => (
                <div
                  key={c._id}
                  className="rounded-lg border border-slate-200 bg-[#FBF8F1] p-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-[#102846]">{c.code}</span>
                      <span className="font-semibold text-[#148D82]">
                        {c.discountType === 'FIXED_GHS'
                          ? `${formatGhs(c.discountAmountGhs)} off`
                          : `${c.discountPercent}% off`}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          c.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {c.active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="text-[#64748B] mt-0.5">
                      {c.description} · Used {c.usedCount ?? 0}
                      {c.maxUses ? `/${c.maxUses}` : ''}
                      {c.expiresAt ? ` · Exp ${formatGhanaDate(c.expiresAt)}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (navigator.clipboard?.writeText) {
                          void navigator.clipboard.writeText(c.code);
                        }
                        setCopiedCode(c.code);
                        window.setTimeout(() => setCopiedCode(''), 2000);
                      }}
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-[#102846]"
                    >
                      <Copy className="w-3 h-3 inline mr-1" />
                      {copiedCode === c.code ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () =>
                            apiFetch(`/api/complete/fee-coupons/${c._id}/toggle`, {
                              method: 'PATCH',
                              body: JSON.stringify({}),
                            }),
                          `Fee coupon ${c.code} updated.`
                        )
                      }
                      className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-[#102846]"
                    >
                      {c.active ? (
                        <>
                          <Pause className="w-3 h-3 inline mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 inline mr-1" />
                          Activate
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void run(
                          () =>
                            apiFetch(`/api/complete/fee-coupons/${c._id}`, {
                              method: 'DELETE',
                            }),
                          `Fee coupon ${c.code} deleted.`
                        )
                      }
                      className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700"
                    >
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Invoices List + Offline Payment Recording + Reminders */}
      {invoices.length === 0 ? (
        <EmptyState
          title="No fee invoices issued yet"
          description="Issue term fee invoices to students to track balances, record payments, and send reminders."
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-[#FBF8F1] text-xs font-semibold text-[#102846]">
                <th className="py-3 px-4">Invoice #</th>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-right">Paid</th>
                <th className="py-3 px-4 text-right">Balance</th>
                <th className="py-3 px-4">Status</th>
                {canMutate && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.map((inv) => (
                <tr key={inv._id}>
                  <td className="py-2.5 px-4 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="py-2.5 px-4 font-medium text-[#102846]">{inv.studentId?.fullName}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{formatGhs(inv.totalGhs)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-[#148D82]">{formatGhs(inv.amountPaidGhs)}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">{formatGhs(inv.balanceGhs)}</td>
                  <td className="py-2.5 px-4 text-xs text-[#64748B]">{inv.status}</td>
                  {canMutate && (
                    <td className="py-2.5 px-4 text-right space-x-2 text-xs">
                      {inv.balanceGhs > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setPayForm({ ...payForm, invoiceId: inv._id, amountGhs: inv.balanceGhs })}
                            className="font-semibold text-[#148D82] hover:underline"
                          >
                            Record Payment
                          </button>
                          <button
                            type="button"
                            onClick={() => setRemForm({ ...remForm, invoiceId: inv._id })}
                            className="font-semibold text-[#102846] hover:underline"
                          >
                            Remind
                          </button>
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canMutate && payForm.invoiceId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiFetch('/api/complete/payments/offline', {
                method: 'POST',
                body: JSON.stringify(payForm),
              });
              setPayForm({ ...payForm, invoiceId: '', amountGhs: 0, externalReference: '' });
            }, 'Verified offline payment recorded and ledger updated.');
          }}
          className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
        >
          <div>
            <label className="block text-xs font-semibold text-[#102846] mb-1">Amount (GH₵)</label>
            <input required type="number" step="0.01" min={0.01} value={payForm.amountGhs} onChange={(e) => setPayForm({ ...payForm, amountGhs: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#102846] mb-1">Channel</label>
            <select value={payForm.channel} onChange={(e) => setPayForm({ ...payForm, channel: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="OFFLINE_MOMO">Offline Mobile Money</option>
              <option value="OFFLINE_CASH">Cash at Bursar Office</option>
              <option value="OFFLINE_BANK">Bank Deposit / Transfer</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#102846] mb-1">External Receipt / MoMo ID</label>
            <input value={payForm.externalReference} onChange={(e) => setPayForm({ ...payForm, externalReference: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <button type="submit" className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Post Payment</button>
        </form>
      )}

      {canMutate && remForm.invoiceId && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await apiFetch('/api/complete/reminders', { method: 'POST', body: JSON.stringify(remForm) });
              setRemForm({ ...remForm, invoiceId: '' });
            }, 'Fee reminder processed.');
          }}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
        >
          <h4 className="text-sm font-bold text-[#102846]">Send Fee Reminder</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={remForm.channel} onChange={(e) => setRemForm({ ...remForm, channel: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="IN_APP">In-App Guardian Notification</option>
              <option value="EMAIL">Email (if SMTP configured)</option>
              <option value="SMS">SMS (if Gateway configured)</option>
            </select>
            <input value={remForm.subject} onChange={(e) => setRemForm({ ...remForm, subject: e.target.value })} className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <textarea rows={2} value={remForm.message} onChange={(e) => setRemForm({ ...remForm, message: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-xs font-semibold text-white">Dispatch Reminder</button>
        </form>
      )}

      {/* Posted Payments & Receipts */}
      {payments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h3 className="text-base font-bold text-[#102846]">Verified Receipts & Payments</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[#64748B]">
                  <th className="py-2 pr-4">Receipt #</th>
                  <th className="py-2 pr-4">Student</th>
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4 text-right">Amount</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 text-right">Receipt PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p._id}>
                    <td className="py-2 pr-4 font-mono">{p.receiptNumber}</td>
                    <td className="py-2 pr-4 font-medium text-[#102846]">{p.studentId?.fullName}</td>
                    <td className="py-2 pr-4 text-[#64748B]">{p.channel}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatGhs(p.amountGhs)}</td>
                    <td className="py-2 pr-4">{p.status}</td>
                    <td className="py-2 text-right">
                      {p.status === 'VERIFIED' && (
                        <button
                          type="button"
                          onClick={() =>
                            void downloadProtectedFile(
                              `/api/complete/payments/${p._id}/receipt/pdf`,
                              `${p.receiptNumber}.pdf`
                            )
                          }
                          className="font-semibold text-[#148D82] hover:underline"
                        >
                          Download PDF
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reminders.length > 0 && (
            <div className="pt-3 border-t border-slate-100 text-xs text-[#64748B]">
              Recent reminders: {reminders.slice(0, 5).map((r) => `${r.channel} (${r.status})`).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OperationsCompletePanel({ user }: { user: AuthUser }) {
  const [announcements, setAnnouncements] = useState<Array<any>>([]);
  const [admissions, setAdmissions] = useState<Array<any>>([]);
  const [staff, setStaff] = useState<Array<any>>([]);
  const [slots, setSlots] = useState<Array<any>>([]);
  const [classes, setClasses] = useState<Array<any>>([]);
  const [subjects, setSubjects] = useState<Array<any>>([]);
  const [teachers, setTeachers] = useState<Array<any>>([]);
  const [years, setYears] = useState<Array<any>>([]);
  const [terms, setTerms] = useState<Array<any>>([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [annForm, setAnnForm] = useState({ title: '', body: '', category: 'Notice', audience: 'ALL', status: 'PUBLISHED', scheduledFor: '' });
  const [admForm, setAdmForm] = useState({ applicantName: '', gender: 'Female', applyingForClassId: '', academicYearId: '', guardianName: '', guardianPhone: '', previousSchool: '' });
  const [staffForm, setStaffForm] = useState({ fullName: '', department: 'Administration', jobRole: 'Secretary', phone: '', dateJoined: new Date().toISOString().slice(0, 10) });
  const [slotForm, setSlotForm] = useState({ academicYearId: '', termId: '', classId: '', subjectId: '', teacherId: '', dayOfWeek: 'Monday', periodNumber: 1, startTime: '08:00', endTime: '08:45', room: '' });

  const load = async () => {
    const [ann, cl, sb, ay, us] = await Promise.all([
      apiFetch<{ announcements: Array<any> }>('/api/complete/announcements'),
      apiFetch<{ classes: Array<any> }>('/api/school/classes'),
      apiFetch<{ subjects: Array<any> }>('/api/school/subjects'),
      apiFetch<{ academicYears: Array<any>; terms: Array<any> }>('/api/school/academic-years'),
      apiFetch<{ users: Array<any> }>('/api/school/users'),
    ]);
    setAnnouncements(ann.announcements);
    setClasses(cl.classes);
    setSubjects(sb.subjects);
    setYears(ay.academicYears);
    setTerms(ay.terms);
    setTeachers(us.users.filter((u) => ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'HEADTEACHER'].includes(u.role)));

    const [adm, stf, tt] = await Promise.all([
      apiFetch<{ applications: Array<any> }>('/api/complete/admissions').catch(() => ({ applications: [] })),
      apiFetch<{ staff: Array<any> }>('/api/complete/staff').catch(() => ({ staff: [] })),
      apiFetch<{ slots: Array<any> }>('/api/complete/timetables').catch(() => ({ slots: [] })),
    ]);
    setAdmissions(adm.applications);
    setStaff(stf.staff);
    setSlots(tt.slots);

    if (cl.classes[0] && !admForm.applyingForClassId) {
      setAdmForm((p) => ({ ...p, applyingForClassId: cl.classes[0]._id }));
      setSlotForm((p) => ({ ...p, classId: cl.classes[0]._id }));
    }
    if (ay.academicYears[0] && !admForm.academicYearId) {
      setAdmForm((p) => ({ ...p, academicYearId: ay.academicYears[0]._id }));
      setSlotForm((p) => ({ ...p, academicYearId: ay.academicYears[0]._id }));
    }
    if (ay.terms[0] && !slotForm.termId) {
      setSlotForm((p) => ({ ...p, termId: ay.terms[0]._id }));
    }
    if (sb.subjects[0] && !slotForm.subjectId) {
      setSlotForm((p) => ({ ...p, subjectId: sb.subjects[0]._id }));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const act = async (fn: () => Promise<void>, text: string) => {
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(text);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Operation failed.');
    }
  };

  const isAdmin = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'].includes(user.role);

  return (
    <div className="space-y-8">
      {msg && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{msg}</div>}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {/* Announcements */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h3 className="text-base font-bold text-[#102846]">School Announcements</h3>
        {isAdmin && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await apiFetch('/api/complete/announcements', {
                  method: 'POST',
                  body: JSON.stringify({
                    ...annForm,
                    scheduledFor: annForm.scheduledFor || null,
                  }),
                });
                setAnnForm({ ...annForm, title: '', body: '' });
              }, 'Announcement saved.');
            }}
            className="grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <input required placeholder="Announcement Title" value={annForm.title} onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })} className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={annForm.audience} onChange={(e) => setAnnForm({ ...annForm, audience: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="ALL">All Users</option>
              <option value="PARENTS">Parents Only</option>
              <option value="TEACHERS">Teachers Only</option>
              <option value="STUDENTS">Students Only</option>
            </select>
            <select value={annForm.status} onChange={(e) => setAnnForm({ ...annForm, status: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              <option value="PUBLISHED">Publish Now</option>
              <option value="SCHEDULED">Schedule</option>
              <option value="DRAFT">Save Draft</option>
            </select>
            {annForm.status === 'SCHEDULED' && (
              <input type="datetime-local" value={annForm.scheduledFor} onChange={(e) => setAnnForm({ ...annForm, scheduledFor: e.target.value })} className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            )}
            <textarea required rows={2} placeholder="Announcement message..." value={annForm.body} onChange={(e) => setAnnForm({ ...annForm, body: e.target.value })} className="sm:col-span-3 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Post Announcement</button>
          </form>
        )}
        <div className="space-y-2 text-sm">
          {announcements.length === 0 ? (
            <div className="text-xs text-[#64748B]">No announcements published yet.</div>
          ) : (
            announcements.map((a) => (
              <div key={a._id} className="border border-slate-100 rounded-lg p-3">
                <div className="font-semibold text-[#102846]">{a.title}</div>
                <div className="text-xs text-[#64748B]">
                  {a.category} · {a.audience} · {a.status} · {formatGhanaDate(a.publishedAt || a.createdAt)}
                </div>
                <p className="text-xs text-[#102846] mt-1">{a.body}</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Admissions */}
      {isAdmin && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-bold text-[#102846]">Admissions Pipeline</h3>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await apiFetch('/api/complete/admissions', { method: 'POST', body: JSON.stringify(admForm) });
                setAdmForm({ ...admForm, applicantName: '', guardianName: '', guardianPhone: '' });
              }, 'Admission application logged.');
            }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-3"
          >
            <input required placeholder="Applicant Name" value={admForm.applicantName} onChange={(e) => setAdmForm({ ...admForm, applicantName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <select value={admForm.applyingForClassId} onChange={(e) => setAdmForm({ ...admForm, applyingForClassId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <select value={admForm.academicYearId} onChange={(e) => setAdmForm({ ...admForm, academicYearId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
              {years.map((y) => <option key={y._id} value={y._id}>{y.name}</option>)}
            </select>
            <input required placeholder="Guardian Name" value={admForm.guardianName} onChange={(e) => setAdmForm({ ...admForm, guardianName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input required placeholder="Guardian Phone" value={admForm.guardianPhone} onChange={(e) => setAdmForm({ ...admForm, guardianPhone: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Log Application</button>
          </form>

          {admissions.length > 0 && (
            <div className="space-y-2 text-xs">
              {admissions.map((ap) => (
                <div key={ap._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2">
                  <div>
                    <span className="font-mono">{ap.applicationNumber}</span> · <strong>{ap.applicantName}</strong> → {ap.applyingForClassId?.name} · <span>{ap.status}</span>
                  </div>
                  <div className="space-x-2">
                    {ap.status === 'SUBMITTED' && (
                      <button type="button" onClick={() => void act(() => apiFetch(`/api/complete/admissions/${ap._id}/status`, { method: 'POST', body: JSON.stringify({ status: 'ACCEPTED' }) }), 'Applicant accepted.')} className="text-[#148D82] font-semibold">Accept</button>
                    )}
                    {ap.status === 'ACCEPTED' && (
                      <button type="button" onClick={() => void act(() => apiFetch(`/api/complete/admissions/${ap._id}/enroll`, { method: 'POST' }), 'Applicant enrolled into Student DB.')} className="text-[#102846] font-semibold">Enroll as Student</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Staff & Timetable */}
      {isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#102846]">Administrative Staff Directory</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  await apiFetch('/api/complete/staff', { method: 'POST', body: JSON.stringify(staffForm) });
                  setStaffForm({ ...staffForm, fullName: '' });
                }, 'Staff record added.');
              }}
              className="grid grid-cols-2 gap-3"
            >
              <input required placeholder="Full Name" value={staffForm.fullName} onChange={(e) => setStaffForm({ ...staffForm, fullName: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required placeholder="Department" value={staffForm.department} onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input required placeholder="Job Role" value={staffForm.jobRole} onChange={(e) => setStaffForm({ ...staffForm, jobRole: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-[#102846] px-4 py-2 text-sm font-semibold text-white">Add Staff</button>
            </form>
            <div className="text-xs text-[#64748B] space-y-1">
              {staff.map((st) => (
                <div key={st._id}>{st.staffNumber} · {st.fullName} · {st.department} ({st.jobRole}) · {st.employmentStatus}</div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#102846]">Timetable Builder (Conflict-Checked)</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  () => apiFetch('/api/complete/timetables', { method: 'POST', body: JSON.stringify(slotForm) }),
                  'Timetable slot added.'
                );
              }}
              className="grid grid-cols-2 gap-3"
            >
              <select value={slotForm.classId} onChange={(e) => setSlotForm({ ...slotForm, classId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <select value={slotForm.subjectId} onChange={(e) => setSlotForm({ ...slotForm, subjectId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <select value={slotForm.teacherId} onChange={(e) => setSlotForm({ ...slotForm, teacherId: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                <option value="">Teacher (optional)</option>
                {teachers.map((t) => <option key={t._id} value={t._id}>{t.fullName}</option>)}
              </select>
              <select value={slotForm.dayOfWeek} onChange={(e) => setSlotForm({ ...slotForm, dayOfWeek: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d) => <option key={d}>{d}</option>)}
              </select>
              <input type="number" min={1} max={12} value={slotForm.periodNumber} onChange={(e) => setSlotForm({ ...slotForm, periodNumber: Number(e.target.value) })} placeholder="Period" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
              <input placeholder="Room" value={slotForm.room} onChange={(e) => setSlotForm({ ...slotForm, room: e.target.value })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <button type="submit" className="col-span-2 rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white">Schedule Period</button>
            </form>
            <div className="text-xs text-[#64748B] max-h-40 overflow-y-auto space-y-1">
              {slots.map((sl) => (
                <div key={sl._id}>
                  {sl.dayOfWeek} P{sl.periodNumber} · {sl.classId?.name} · {sl.subjectId?.name || sl.breakLabel} {sl.teacherId ? `(${sl.teacherId.fullName})` : ''}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
