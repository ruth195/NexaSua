import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { EmptyState, formatGhanaDate, formatGhs } from '../../components/BrandLogo';
import { apiFetch, downloadProtectedFile } from '../../lib/api';
import type { AuthUser, SubscriptionSummary } from '../../types/nexasua';

export function StudentParentPortalPanel({
  user,
  subscription,
  previewRole,
  forceComplete = false,
  isAdminPreview = false,
}: {
  user: AuthUser;
  subscription: SubscriptionSummary | null;
  previewRole?: 'STUDENT' | 'PARENT';
  forceComplete?: boolean;
  isAdminPreview?: boolean;
}) {
  const effectiveRole = previewRole || user.role;
  const isParent = effectiveRole === 'PARENT';
  const isComplete = forceComplete || subscription?.plan === 'COMPLETE';

  const [overview, setOverview] = useState<any>(null);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [results, setResults] = useState<Array<any>>([]);
  const [reportCards, setReportCards] = useState<Array<any>>([]);
  const [attendance, setAttendance] = useState<Array<any>>([]);
  const [invoices, setInvoices] = useState<Array<any>>([]);
  const [payments, setPayments] = useState<Array<any>>([]);
  const [announcements, setAnnouncements] = useState<Array<any>>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    apiFetch('/api/school/overview')
      .then((ov: any) => {
        setOverview(ov);
        if (isParent && ov?.children?.[0]) {
          setSelectedChildId(ov.children[0]._id);
        }
      })
      .catch(() => null);
  }, [effectiveRole]);

  useEffect(() => {
    if (isParent && !selectedChildId && !isAdminPreview) return;
    const childParam = isParent && selectedChildId ? `?studentId=${selectedChildId}` : '';
    apiFetch<{ results: Array<any> }>(`/api/academics/published-results${childParam}`)
      .then((r) => setResults(r.results))
      .catch(() => setResults([]));

    apiFetch<{ reportCards: Array<any> }>('/api/academics/report-cards')
      .then((r) => setReportCards(r.reportCards))
      .catch(() => setReportCards([]));

    apiFetch<{ records: Array<any> }>(`/api/school/attendance${childParam}`)
      .then((r) => setAttendance(r.records))
      .catch(() => setAttendance([]));

    if (isComplete) {
      apiFetch<{ invoices: Array<any> }>('/api/complete/invoices')
        .then((r) => setInvoices(r.invoices))
        .catch(() => setInvoices([]));
      apiFetch<{ payments: Array<any> }>('/api/complete/payments')
        .then((r) => setPayments(r.payments))
        .catch(() => setPayments([]));
      apiFetch<{ announcements: Array<any> }>('/api/complete/announcements')
        .then((r) => setAnnouncements(r.announcements))
        .catch(() => setAnnouncements([]));
    }
  }, [selectedChildId, isComplete, isParent, isAdminPreview]);

  const initiatePaystack = async (invoiceId: string, balanceGhs: number) => {
    setErr('');
    try {
      const res = await apiFetch<{ authorizationUrl: string }>(
        '/api/complete/payments/paystack/initialize',
        {
          method: 'POST',
          body: JSON.stringify({ invoiceId, amountGhs: balanceGhs }),
        }
      );
      if (res.authorizationUrl) {
        window.location.assign(res.authorizationUrl);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Online payment unavailable.');
    }
  };

  return (
    <div className="space-y-6">
      {isAdminPreview && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-[#64748B]">
          Previewing the <strong className="text-[#102846]">{isParent ? 'Parent / Guardian' : 'Student'} Dashboard</strong>{' '}
          ({isComplete ? 'Complete Plan View' : 'Core Plan View'}). School-wide results, invoices,
          attendance, and announcements below reflect your admin workspace view.
        </div>
      )}
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">{err}</div>}

      {isParent && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-[#102846]">Verified Linked Learners</h3>
            <p className="text-xs text-[#64748B]">
              Only children verified by your school administrator appear here.
            </p>
          </div>
          {overview?.children?.length > 0 ? (
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
            >
              {overview.children.map((c: any) => (
                <option key={c._id} value={c._id}>
                  {c.fullName} ({c.admissionNumber}) · {c.currentClassId?.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-amber-800">
              No verified child accounts linked yet. Contact your school administrator.
            </div>
          )}
        </div>
      )}

      {/* Published Results */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="text-base font-bold text-[#102846]">Published Examination Results</h3>
        {results.length === 0 ? (
          <EmptyState
            title="No published examination results yet"
            description="Unpublished draft or pending marks are hidden until approved and published by your headteacher."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs text-[#64748B]">
                  <th className="py-2 pr-4">Term</th>
                  <th className="py-2 pr-4">Subject</th>
                  <th className="py-2 pr-4 text-right">CA</th>
                  <th className="py-2 pr-4 text-right">Exam</th>
                  <th className="py-2 pr-4 text-right">Final %</th>
                  <th className="py-2 pr-4">Grade</th>
                  <th className="py-2">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((r) => (
                  <tr key={r._id}>
                    <td className="py-2 pr-4 text-xs text-[#64748B]">
                      {r.academicYearId?.name} · {r.termId?.name}
                    </td>
                    <td className="py-2 pr-4 font-semibold text-[#102846]">{r.subjectId?.name}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{r.caScore ?? '—'}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{r.examScore ?? '—'}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums font-bold">{r.finalScore ?? 'INC'}%</td>
                    <td className="py-2 pr-4 font-mono font-bold text-[#148D82]">{r.grade}</td>
                    <td className="py-2 text-xs text-[#64748B]">{r.remark}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Report Cards */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <h3 className="text-base font-bold text-[#102846]">Terminal Report Cards</h3>
        {reportCards.length === 0 ? (
          <div className="text-xs text-[#64748B]">No terminal report cards issued yet.</div>
        ) : (
          <div className="space-y-2">
            {reportCards.map((rc) => (
              <div key={rc._id} className="flex flex-wrap items-center justify-between gap-2 border border-slate-100 rounded-lg p-3 text-sm">
                <div>
                  <strong>{rc.studentId?.fullName}</strong> · {rc.academicYearId?.name} {rc.termId?.name} · Avg:{' '}
                  <span className="font-mono">{rc.overallAverage?.toFixed(1)}%</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void downloadProtectedFile(`/api/academics/report-cards/${rc._id}/pdf`, `${rc.referenceNumber}.pdf`)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#148D82] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Download className="w-3.5 h-3.5" /> Download PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attendance */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
        <h3 className="text-base font-bold text-[#102846]">Recent Attendance</h3>
        {attendance.length === 0 ? (
          <div className="text-xs text-[#64748B]">No attendance records logged yet.</div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {attendance.slice(0, 12).map((a) => (
              <div key={a._id} className="border border-slate-100 rounded p-2 font-mono">
                {a.date}: <strong>{a.status}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Complete Plan: Fees, Receipts & Announcements */}
      {isComplete && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h3 className="text-base font-bold text-[#102846]">School Fee Invoices & Receipts</h3>
            {invoices.length === 0 ? (
              <div className="text-xs text-[#64748B]">No fee invoices issued yet.</div>
            ) : (
              invoices.map((inv) => (
                <div key={inv._id} className="border border-slate-100 rounded-lg p-3 text-xs space-y-1.5">
                  <div className="flex justify-between font-semibold text-[#102846]">
                    <span className="font-mono">{inv.invoiceNumber}</span>
                    <span>Balance: {formatGhs(inv.balanceGhs)}</span>
                  </div>
                  <div className="text-[#64748B]">
                    Total: {formatGhs(inv.totalGhs)} · Paid: {formatGhs(inv.amountPaidGhs)} · Status: {inv.status}
                  </div>
                  {inv.balanceGhs > 0 && isParent && (
                    <button
                      type="button"
                      onClick={() => void initiatePaystack(inv._id, inv.balanceGhs)}
                      className="mt-1 rounded bg-[#148D82] px-3 py-1 text-white font-semibold"
                    >
                      Pay Online via Paystack
                    </button>
                  )}
                </div>
              ))
            )}
            {payments.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1">
                {payments.map((p) => (
                  <div key={p._id} className="flex justify-between text-xs">
                    <span className="font-mono">{p.receiptNumber} · {formatGhs(p.amountGhs)}</span>
                    {p.status === 'VERIFIED' && (
                      <button
                        type="button"
                        onClick={() =>
                          void downloadProtectedFile(`/api/complete/payments/${p._id}/receipt/pdf`, `${p.receiptNumber}.pdf`)
                        }
                        className="text-[#148D82] font-semibold"
                      >
                        Receipt PDF
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <h3 className="text-base font-bold text-[#102846]">School Announcements</h3>
            {announcements.length === 0 ? (
              <div className="text-xs text-[#64748B]">No announcements published yet.</div>
            ) : (
              announcements.map((a) => (
                <div key={a._id} className="border border-slate-100 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-[#102846]">{a.title}</div>
                  <div className="text-[#64748B]">{formatGhanaDate(a.publishedAt)}</div>
                  <p className="mt-1 text-[#102846]">{a.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
