import React, { useMemo, useState } from 'react';
import type { PricingBand, SubscriptionPlan } from '../types/nexasua';
import { formatGhs } from './BrandLogo';

export const DEFAULT_GHANA_BANDS: PricingBand[] = [
  {
    code: 'BAND_1_150',
    label: '1–150 Students',
    minStudents: 1,
    maxStudents: 150,
    corePriceGhs: 350,
    completePriceGhs: 650,
    isCustomQuote: false,
  },
  {
    code: 'BAND_151_400',
    label: '151–400 Students',
    minStudents: 151,
    maxStudents: 400,
    corePriceGhs: 700,
    completePriceGhs: 1200,
    isCustomQuote: false,
  },
  {
    code: 'BAND_401_800',
    label: '401–800 Students',
    minStudents: 401,
    maxStudents: 800,
    corePriceGhs: 1200,
    completePriceGhs: 2100,
    isCustomQuote: false,
  },
  {
    code: 'BAND_801_1500',
    label: '801–1,500 Students',
    minStudents: 801,
    maxStudents: 1500,
    corePriceGhs: 2000,
    completePriceGhs: 3500,
    isCustomQuote: false,
  },
  {
    code: 'BAND_1501_PLUS',
    label: 'Above 1,500 Students',
    minStudents: 1501,
    maxStudents: null,
    corePriceGhs: null,
    completePriceGhs: null,
    isCustomQuote: true,
  },
];

export function PricingCalculator({
  bands = DEFAULT_GHANA_BANDS,
  threeTermDiscountPercent = 10,
  trialDays = 7,
  onSelectPlan,
}: {
  bands?: PricingBand[];
  threeTermDiscountPercent?: number;
  trialDays?: number;
  onSelectPlan: (plan: SubscriptionPlan, studentCount: number) => void;
}) {
  const [studentCount, setStudentCount] = useState<number>(250);
  const [plan, setPlan] = useState<SubscriptionPlan>('COMPLETE');
  const [billingCycle, setBillingCycle] = useState<'TERM' | 'THREE_TERMS'>('TERM');

  const calculation = useMemo(() => {
    const count = Math.max(1, studentCount);
    const band =
      bands.find(
        (b) => count >= b.minStudents && (b.maxStudents === null || count <= b.maxStudents)
      ) || bands[bands.length - 1];

    if (band.isCustomQuote) {
      return { band, isCustom: true, unitPrice: null, gross: null, discount: 0, net: null };
    }
    const unitPrice = plan === 'CORE' ? band.corePriceGhs ?? 0 : band.completePriceGhs ?? 0;
    const terms = billingCycle === 'THREE_TERMS' ? 3 : 1;
    const gross = unitPrice * terms;
    const discount =
      billingCycle === 'THREE_TERMS' ? Math.round(gross * (threeTermDiscountPercent / 100)) : 0;
    const net = gross - discount;

    return { band, isCustom: false, unitPrice, gross, discount, net };
  }, [studentCount, plan, billingCycle, bands, threeTermDiscountPercent]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div>
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor="calc-population"
                className="text-sm font-semibold text-[#102846]"
              >
                Active Student Population
              </label>
              <input
                id="calc-population-num"
                type="number"
                min={1}
                max={5000}
                value={studentCount}
                onChange={(e) => setStudentCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-right font-mono text-sm tabular-nums text-[#102846]"
              />
            </div>
            <input
              id="calc-population"
              type="range"
              min={20}
              max={1800}
              step={10}
              value={Math.min(1800, studentCount)}
              onChange={(e) => setStudentCount(Number(e.target.value))}
              className="mt-3 w-full accent-[#148D82] cursor-pointer"
            />
            <div className="flex justify-between text-xs text-[#64748B] mt-1 tabular-nums">
              <span>1</span>
              <span>150</span>
              <span>400</span>
              <span>800</span>
              <span>1,500+</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-[#64748B] mb-2">
                Subscription Plan
              </span>
              <div className="flex p-1 bg-[#FBF8F1] border border-slate-200 rounded-lg">
                {(['CORE', 'COMPLETE'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      plan === p
                        ? 'bg-[#102846] text-white'
                        : 'text-[#102846] hover:bg-white'
                    }`}
                  >
                    {p === 'CORE' ? 'NexaSua Core' : 'NexaSua Complete'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#64748B] mb-2">
                Billing Cadence
              </span>
              <div className="flex p-1 bg-[#FBF8F1] border border-slate-200 rounded-lg">
                <button
                  type="button"
                  onClick={() => setBillingCycle('TERM')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    billingCycle === 'TERM'
                      ? 'bg-[#102846] text-white'
                      : 'text-[#102846] hover:bg-white'
                  }`}
                >
                  Per Term
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('THREE_TERMS')}
                  className={`flex-1 py-2 px-3 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                    billingCycle === 'THREE_TERMS'
                      ? 'bg-[#102846] text-white'
                      : 'text-[#102846] hover:bg-white'
                  }`}
                >
                  3 Terms (-{threeTermDiscountPercent}%)
                </button>
              </div>
            </div>
          </div>

          <p className="text-xs text-[#64748B]">
            Students are never charged individually. Every approved school begins with a{' '}
            <strong className="text-[#102846]">{trialDays}-day free trial</strong>.
          </p>
        </div>

        <div className="lg:col-span-5 bg-[#FBF8F1] border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="text-xs text-[#64748B] flex items-center gap-2">
            <span>Pricing Band</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[#102846]">{calculation.band.label}</span>
          </div>

          {calculation.isCustom ? (
            <div className="space-y-3">
              <div className="text-2xl font-bold text-[#102846]">Custom Quotation</div>
              <p className="text-sm text-[#64748B]">
                Institutions above 1,500 active learners receive tailored multi-campus deployment
                and volume pricing from NexaFlow Technologies.
              </p>
              <button
                type="button"
                onClick={() => onSelectPlan(plan, studentCount)}
                className="w-full rounded-lg bg-[#102846] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#193c66] transition-colors"
              >
                Request Custom Quote
              </button>
            </div>
          ) : (
            <>
              <div>
                <div className="text-3xl font-bold text-[#102846] font-mono tabular-nums">
                  {formatGhs(calculation.net)}
                </div>
                <div className="text-xs text-[#64748B] mt-1">
                  {billingCycle === 'THREE_TERMS'
                    ? `Total for 3 terms (${formatGhs(calculation.unitPrice)}/term before ${threeTermDiscountPercent}% prepay discount)`
                    : 'Billed per academic term'}
                </div>
              </div>

              {calculation.discount > 0 && (
                <div className="text-xs font-medium text-[#148D82] tabular-nums">
                  Prepay savings: {formatGhs(calculation.discount)} saved across 3 terms
                </div>
              )}

              <button
                type="button"
                onClick={() => onSelectPlan(plan, studentCount)}
                className="w-full rounded-lg bg-[#148D82] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#10766c] transition-colors"
              >
                Start {trialDays}-Day Free Trial ({plan === 'CORE' ? 'Core' : 'Complete'})
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
