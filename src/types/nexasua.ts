export type UserRole =
  | 'SUPER_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'HEADTEACHER'
  | 'CLASS_TEACHER'
  | 'SUBJECT_TEACHER'
  | 'BURSAR'
  | 'ADMIN_STAFF'
  | 'STUDENT'
  | 'PARENT';

export type SubscriptionPlan = 'CORE' | 'COMPLETE';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  schoolId: string | null;
  mfaEnabled: boolean;
  emailVerified: boolean;
  linkedGoogleEmail?: string;
}

export interface DashboardSettings {
  customTitle?: string;
  welcomeMessage?: string;
  primaryColor?: string;
  accentColor?: string;
  defaultLandingTab?:
    | 'overview'
    | 'students'
    | 'academics'
    | 'marks'
    | 'reports'
    | 'attendance'
    | 'analytics'
    | 'finance'
    | 'operations';
  showSubscriptionBanner?: boolean;
  showMetricsCards?: boolean;
  showOnboardingChecklist?: boolean;
  showNotificationsWidget?: boolean;
  showSchoolLogoInSidebar?: boolean;
}

export interface SchoolSummary {
  _id?: string;
  id?: string;
  name: string;
  schoolCode: string;
  schoolType: string;
  educationalLevels: string[];
  country: string;
  region: string;
  town: string;
  address: string;
  email: string;
  phone: string;
  motto?: string;
  logoDataUrl?: string;
  status: string;
  currency: string;
  termVacationDate?: string;
  onboardingSteps?: Record<string, boolean>;
  reportCardSettings?: {
    headteacherName?: string;
    showClassPosition?: boolean;
    showAttendanceSummary?: boolean;
    showQrVerification?: boolean;
    footerNote?: string;
    nextTermReopeningDate?: string;
  };
  dashboardSettings?: DashboardSettings;
  paymentConfig?: {
    paystackPublicKey?: string;
    settlementAccountName?: string;
    mobileMoneyInstructions?: string;
    bankTransferInstructions?: string;
    isConfigured?: boolean;
  };
}

export interface SubscriptionSummary {
  plan: SubscriptionPlan;
  status: 'TRIAL' | 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'SUSPENDED';
  billingCycle: 'TERM' | 'THREE_TERMS';
  trialEndsAt: string;
  currentPeriodEnd: string;
  termVacationDate?: string;
  portalClosedReason?: string;
  studentBand: string;
  unitPriceGhs: number;
  amountDueGhs: number;
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

export interface PricingBand {
  code: string;
  label: string;
  minStudents: number;
  maxStudents: number | null;
  corePriceGhs: number | null;
  completePriceGhs: number | null;
  isCustomQuote: boolean;
}

export interface CouponOffer {
  code: string;
  description: string;
  discountType?: 'PERCENT' | 'FIXED_GHS';
  discountPercent: number;
  discountAmountGhs?: number;
  applicablePlan: 'ALL' | 'CORE' | 'COMPLETE';
  assignedSchoolId?: string | null;
  assignedSchoolName?: string;
  maxUses?: number | null;
  usedCount?: number;
  active: boolean;
  expiresAt?: string | null;
}

export interface IntegrationItem {
  name: string;
  status: 'Not Configured' | 'Testing' | 'Connected' | 'Error';
  detail: string;
}

export interface HealthResponse {
  ok: boolean;
  dbConnected: boolean;
  superAdminInitialized: boolean;
  superAdminManagedBySecrets?: boolean;
  adminManagedBySecrets?: boolean;
  googleOAuthEnabled?: boolean;
  integrations: Record<string, IntegrationItem>;
  pricing: {
    currency: string;
    trialDays: number;
    threeTermDiscountPercent: number;
    bands: PricingBand[];
    plans?: PlanCatalogItem[];
  };
  platformAnnouncement?: string;
}
