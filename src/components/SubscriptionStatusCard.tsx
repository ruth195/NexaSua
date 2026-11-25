import React from 'react';
import { AlertTriangle, CheckCircle2, Clock, Lock } from 'lucide-react';
import { formatGhanaDate } from './BrandLogo';
import type { SchoolSummary, SubscriptionSummary, UserRole } from '../types/nexasua';

export type SubscriptionCountdownTone = 'active' | 'approaching' | 'expired';

export interface SubscriptionCountdownState {
  statusLabel: string;
  planLabel: string;
  termEndDate: string;
  daysRemaining: number | null;
  isApproaching: boolean;
  isClosedOrExpired: boolean;
  tone: SubscriptionCountdownTone;
  countdownText: string;
  warningMessage: string;
}

export function getSubscriptionCountdownState(
  subscription: SubscriptionSummary | null,
  school: SchoolSummary | null,
  now: Date = new Date()
): SubscriptionCountdownState {
  const todayStr = now.toISOString().slice(0, 10);
  const termEndDate =
    subscription?.termVacationDate ||
    school?.termVacationDate ||
    (subscription?.currentPeriodEnd ? subscription.currentPeriodEnd.slice(0, 10) : '');

  const daysRemaining = termEndDate
    ? Math.round(
        (Date.parse(`${termEndDate}T00:00:00.000Z`) - Date.parse(`${todayStr}T00:00:00.000Z`)) /
          86_400_000
      )
    : null;

  const status = subscription?.status || 'TRIAL';
  const plan = subscription?.plan || 'CORE';
  const planLabel = `NexaSua ${plan === 'COMPLETE' ? 'Complete' : 'Core'}`;

  const isClosedOrExpired =
    status === 'EXPIRED' ||
    status === 'SUSPENDED' ||
    (daysRemaining !== null && daysRemaining <= 0);

  const isApproaching =
    !isClosedOrExpired &&
    (status === 'GRACE_PERIOD' ||
      (daysRemaining !== null && daysRemaining > 0 && daysRemaining <= 14));

  const statusLabel = isClosedOrExpired
    ? status === 'SUSPENDED'
      ? 'Suspended'
      : 'Expired'
    : status === 'GRACE_PERIOD'
      ? 'Grace Period'
      : status === 'TRIAL'
        ? 'Free Trial'
        : 'Active';

  let countdownText = 'No term vacation date set';
  if (daysRemaining !== null) {
    if (daysRemaining <= 0) {
      countdownText =
        daysRemaining === 0
          ? 'Term vacation date reached today'
          : `Ended ${Math.abs(daysRemaining)} ${Math.abs(daysRemaining) === 1 ? 'day' : 'days'} ago`;
    } else if (daysRemaining === 1) {
      countdownText = '1 day remaining before term vacation';
    } else {
      countdownText = `${daysRemaining} days remaining before term vacation`;
    }
  }

  let warningMessage = '';
  if (isClosedOrExpired) {
    warningMessage =
      subscription?.portalClosedReason ||
      'Term subscription has ended. Renew with your next term vacation date to reopen full portal access.';
  } else if (isApproaching && daysRemaining !== null) {
    warningMessage = `Term end date is approaching (${formatGhanaDate(termEndDate)}). Renew or update your next term vacation date before then to prevent automatic portal closure.`;
  } else if (status === 'TRIAL' && subscription?.trialEndsAt) {
    warningMessage = `7-day school trial active through ${formatGhanaDate(subscription.trialEndsAt)}.`;
  }

  const tone: SubscriptionCountdownTone = isClosedOrExpired
    ? 'expired'
    : isApproaching
      ? 'approaching'
      : 'active';

  return {
    statusLabel,
    planLabel,
    termEndDate,
    daysRemaining,
    isApproaching,
    isClosedOrExpired,
    tone,
    countdownText,
    warningMessage,
  };
}

export function SubscriptionStatusCard({
  subscription,
  school,
  userRole,
  onManageBilling,
}: {
  subscription: SubscriptionSummary | null;
  school: SchoolSummary | null;
  userRole: UserRole;
  onManageBilling?: () => void;
}) {
  const info = getSubscriptionCountdownState(subscription, school);
  const canManageBilling =
    Boolean(onManageBilling) &&
    (userRole === 'SCHOOL_ADMIN' ||
      userRole === 'HEADTEACHER' ||
      userRole === 'BURSAR' ||
      userRole === 'SUPER_ADMIN');

  const containerStyle =
    info.tone === 'expired'
      ? 'border-red-300 bg-red-50/70'
      : info.tone === 'approaching'
        ? 'border-amber-300 bg-amber-50/70'
        : 'border-slate-200 bg-white';

  const statusColor =
    info.tone === 'expired'
      ? 'text-red-700'
      : info.tone === 'approaching'
        ? 'text-amber-800'
        : 'text-[#16A34A]';

  const StatusIcon =
    info.tone === 'expired' ? Lock : info.tone === 'approaching' ? AlertTriangle : CheckCircle2;

  return (
    <section
      aria-label="School Subscription Status"
      className={`rounded-xl border p-5 transition-colors ${containerStyle}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span className={`inline-flex items-center gap-1.5 font-bold ${statusColor}`}>
              <StatusIcon className="w-4 h-4 shrink-0" />
              <span>Subscription: {info.statusLabel}</span>
            </span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="font-semibold text-[#102846]">{info.planLabel}</span>
            {subscription?.studentBand && (
              <>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="text-[#64748B] font-mono tabular-nums">
                  {subscription.studentBand}
                </span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[#102846]">
            <span className="inline-flex items-center gap-1.5 font-semibold font-mono tabular-nums">
              <Clock className="w-4 h-4 text-[#64748B] shrink-0" />
              <span>{info.countdownText}</span>
            </span>
            {info.termEndDate && (
              <span className="text-xs text-[#64748B] font-mono tabular-nums">
                Vacates: {formatGhanaDate(info.termEndDate)} ({info.termEndDate})
              </span>
            )}
          </div>

          {info.warningMessage && (
            <p
              className={`text-xs leading-relaxed ${
                info.tone === 'expired'
                  ? 'text-red-900 font-medium'
                  : info.tone === 'approaching'
                    ? 'text-amber-900 font-medium'
                    : 'text-[#64748B]'
              }`}
            >
              {info.warningMessage}
            </p>
          )}
        </div>

        {canManageBilling && (
          <div className="shrink-0">
            <button
              type="button"
              onClick={onManageBilling}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                info.tone === 'expired'
                  ? 'bg-red-700 text-white hover:bg-red-800'
                  : info.tone === 'approaching'
                    ? 'bg-[#D97706] text-white hover:bg-[#B45309]'
                    : 'border border-slate-300 bg-white text-[#102846] hover:bg-[#FBF8F1]'
              }`}
            >
              {info.isClosedOrExpired
                ? 'Renew Subscription'
                : info.isApproaching
                  ? 'Renew / Update Date'
                  : 'Manage Subscription'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
