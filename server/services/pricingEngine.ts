import { SystemConfigModel } from '../models/index.js';
import type { SubscriptionPlan } from '../models/index.js';

export interface PricingBand {
  code: string;
  label: string;
  minStudents: number;
  maxStudents: number | null;
  corePriceGhs: number | null;
  completePriceGhs: number | null;
  isCustomQuote: boolean;
}

export interface PlanCatalogItem {
  code: string;
  name: string;
  tagline: string;
  durationLabel: string;
  durationDays: number;
  startingPriceLabel: string;
  features: string[];
  isFeatured: boolean;
  isActive: boolean;
}

export const DEFAULT_PLAN_CATALOG: PlanCatalogItem[] = [
  {
    code: 'CORE',
    name: 'NexaSua Core',
    tagline: 'Academic Operations Tier for Ghanaian KG, Primary, JHS & SHS Schools',
    durationLabel: '1 Academic Term (Closes on Term Vacation Date)',
    durationDays: 110,
    startingPriceLabel: 'From GH₵ 350 / term',
    features: [
      'Student enrollment & verified guardian linking',
      'Academic years, terms, classes & subjects setup',
      'Continuous Assessment (CA) & end-of-term grading (30/70 & custom)',
      'Teacher mark submission, review & headteacher approval lock',
      'A4 PDF Terminal Report Cards with QR verification',
      'Daily attendance tracking & academic analytics',
      'Bulk CSV/Excel student & score import/export',
    ],
    isFeatured: false,
    isActive: true,
  },
  {
    code: 'COMPLETE',
    name: 'NexaSua Complete',
    tagline: 'Full School Administration, Finance, HR & Operations Suite',
    durationLabel: '1 Academic Term or 3-Term Bundle (Closes on Term Vacation Date)',
    durationDays: 110,
    startingPriceLabel: 'From GH₵ 650 / term',
    features: [
      'Everything in NexaSua Core',
      'Fee structures, term invoices, waivers & discounts',
      'Paystack online payments + verified offline MoMo/bank/cash ledger',
      'Official PDF payment receipts & scheduled fee reminders (In-App/Email/SMS)',
      'Online admissions pipeline with 1-click applicant enrollment',
      'Staff directory, leave requests & conflict-free school timetables',
      'School announcements & dedicated student/parent portals',
    ],
    isFeatured: true,
    isActive: true,
  },
  {
    code: 'CUSTOM',
    name: 'NexaSua Custom',
    tagline: 'Bespoke White-Label & Multi-Campus School Systems by NexaFlow',
    durationLabel: 'Annual / Custom Institutional Agreement',
    durationDays: 365,
    startingPriceLabel: 'Setup from GH₵ 2,000',
    features: [
      'Custom school branding, portal domain & official school website',
      'Bespoke report card layouts & institutional workflows',
      'Multi-campus consolidation & dedicated SLA support',
      'Custom integrations with existing finance or biometric systems',
    ],
    isFeatured: false,
    isActive: true,
  },
];

export const DEFAULT_PRICING_BANDS: PricingBand[] = [
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

export interface PriceQuoteResult {
  band: PricingBand;
  plan: SubscriptionPlan;
  billingCycle: 'TERM' | 'THREE_TERMS';
  studentCount: number;
  isCustomQuote: boolean;
  unitTermPriceGhs: number | null;
  termsCount: number;
  grossAmountGhs: number | null;
  threeTermDiscountPercent: number;
  threeTermDiscountGhs: number;
  promoDiscountPercent: number;
  promoDiscountGhs: number;
  netPayableGhs: number | null;
}

export function calculateSubscriptionPrice(params: {
  studentCount: number;
  plan: SubscriptionPlan;
  billingCycle: 'TERM' | 'THREE_TERMS';
  bands?: PricingBand[];
  threeTermDiscountPercent?: number;
  promoDiscountPercent?: number;
  promoFixedDiscountGhs?: number;
}): PriceQuoteResult {
  const count = Math.max(1, Math.floor(params.studentCount));
  const bands = params.bands?.length ? params.bands : DEFAULT_PRICING_BANDS;
  const band =
    bands.find(
      (b) => count >= b.minStudents && (b.maxStudents === null || count <= b.maxStudents)
    ) || bands[bands.length - 1];

  const termsCount = params.billingCycle === 'THREE_TERMS' ? 3 : 1;
  const threeTermDiscountPercent =
    params.billingCycle === 'THREE_TERMS'
      ? Math.max(0, Math.min(50, params.threeTermDiscountPercent ?? 10))
      : 0;
  const promoDiscountPercent = Math.max(0, Math.min(100, params.promoDiscountPercent ?? 0));
  const promoFixedDiscountGhs = Math.max(0, params.promoFixedDiscountGhs ?? 0);

  if (band.isCustomQuote) {
    return {
      band,
      plan: params.plan,
      billingCycle: params.billingCycle,
      studentCount: count,
      isCustomQuote: true,
      unitTermPriceGhs: null,
      termsCount,
      grossAmountGhs: null,
      threeTermDiscountPercent,
      threeTermDiscountGhs: 0,
      promoDiscountPercent,
      promoDiscountGhs: 0,
      netPayableGhs: null,
    };
  }

  const unitTermPriceGhs =
    params.plan === 'CORE' ? band.corePriceGhs ?? 0 : band.completePriceGhs ?? 0;
  const grossAmountGhs = roundCurrency(unitTermPriceGhs * termsCount);
  const threeTermDiscountGhs = roundCurrency(grossAmountGhs * (threeTermDiscountPercent / 100));
  const afterThreeTerm = roundCurrency(grossAmountGhs - threeTermDiscountGhs);
  const percentOff = roundCurrency(afterThreeTerm * (promoDiscountPercent / 100));
  const promoDiscountGhs = roundCurrency(
    Math.min(afterThreeTerm, percentOff + promoFixedDiscountGhs)
  );
  const netPayableGhs = roundCurrency(Math.max(0, afterThreeTerm - promoDiscountGhs));

  return {
    band,
    plan: params.plan,
    billingCycle: params.billingCycle,
    studentCount: count,
    isCustomQuote: false,
    unitTermPriceGhs,
    termsCount,
    grossAmountGhs,
    threeTermDiscountPercent,
    threeTermDiscountGhs,
    promoDiscountPercent,
    promoDiscountGhs,
    netPayableGhs,
  };
}

export interface CouponCandidate {
  code: string;
  description?: string;
  discountType?: 'PERCENT' | 'FIXED_GHS' | string;
  discountPercent?: number;
  discountAmountGhs?: number;
  applicablePlan?: 'ALL' | 'CORE' | 'COMPLETE' | string;
  assignedSchoolId?: unknown;
  maxUses?: number | null;
  usedCount?: number;
  active?: boolean;
  expiresAt?: Date | string | null;
}

export function validateCouponForSchool(params: {
  coupons: CouponCandidate[];
  code: string;
  plan: SubscriptionPlan;
  schoolId: string;
  now?: Date;
}):
  | {
      valid: true;
      coupon: CouponCandidate;
      promoDiscountPercent: number;
      promoFixedDiscountGhs: number;
    }
  | { valid: false; error: string } {
  const normalized = params.code.trim().toUpperCase();
  if (!normalized) {
    return { valid: false, error: 'Please enter a coupon code.' };
  }
  const coupon = params.coupons.find((c) => c.code.toUpperCase() === normalized);
  if (!coupon) {
    return { valid: false, error: 'Coupon code not found.' };
  }
  if (!coupon.active) {
    return { valid: false, error: 'This coupon is currently paused or inactive.' };
  }
  const now = params.now ?? new Date();
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < now.getTime()) {
    return { valid: false, error: 'This coupon has expired.' };
  }
  if (
    typeof coupon.maxUses === 'number' &&
    coupon.maxUses > 0 &&
    (coupon.usedCount ?? 0) >= coupon.maxUses
  ) {
    return { valid: false, error: 'This coupon has reached its maximum redemption limit.' };
  }
  if (
    coupon.assignedSchoolId &&
    String(coupon.assignedSchoolId) !== String(params.schoolId)
  ) {
    return { valid: false, error: 'This coupon is assigned to another school.' };
  }
  if (
    coupon.applicablePlan &&
    coupon.applicablePlan !== 'ALL' &&
    coupon.applicablePlan !== params.plan
  ) {
    return {
      valid: false,
      error: `This coupon only applies to the NexaSua ${coupon.applicablePlan} plan.`,
    };
  }

  const isFixed = coupon.discountType === 'FIXED_GHS';
  return {
    valid: true,
    coupon,
    promoDiscountPercent: isFixed ? 0 : Number(coupon.discountPercent || 0),
    promoFixedDiscountGhs: isFixed ? Number(coupon.discountAmountGhs || 0) : 0,
  };
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function ensureSystemConfig() {
  let config = await SystemConfigModel.findOne({ key: 'GLOBAL_SETTINGS' });
  if (!config) {
    config = await SystemConfigModel.create({
      key: 'GLOBAL_SETTINGS',
      superAdminInitialized: false,
      trialDays: 7,
      trialPolicyVersion: 2,
      threeTermDiscountPercent: 10,
      gracePeriodDays: 7,
      defaultCountry: 'Ghana',
      defaultCurrency: 'GH₵',
      defaultTimezone: 'Africa/Accra',
      pricingBands: DEFAULT_PRICING_BANDS,
      planCatalog: DEFAULT_PLAN_CATALOG,
      promotionalOffers: [],
    });
  } else {
    let dirty = false;
    if (config.trialPolicyVersion !== 2) {
      if (config.trialDays === 14) {
        config.trialDays = 7;
      }
      config.trialPolicyVersion = 2;
      dirty = true;
    }
    if (!config.pricingBands || config.pricingBands.length === 0) {
      config.pricingBands = DEFAULT_PRICING_BANDS;
      dirty = true;
    }
    if (!config.planCatalog || config.planCatalog.length === 0) {
      config.planCatalog = DEFAULT_PLAN_CATALOG as unknown as typeof config.planCatalog;
      dirty = true;
    }
    if (dirty) {
      await config.save();
    }
  }
  return config;
}
