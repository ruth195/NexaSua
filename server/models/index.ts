import mongoose, { Schema, Types } from 'mongoose';

export const USER_ROLES = [
  'SUPER_ADMIN',
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'CLASS_TEACHER',
  'SUBJECT_TEACHER',
  'BURSAR',
  'ADMIN_STAFF',
  'STUDENT',
  'PARENT',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const EDUCATIONAL_LEVELS = [
  'Kindergarten',
  'Primary',
  'Junior High School',
  'Senior High School',
] as const;

export type EducationalLevel = (typeof EDUCATIONAL_LEVELS)[number];

export const SUBSCRIPTION_PLANS = ['CORE', 'COMPLETE'] as const;
export type SubscriptionPlan = (typeof SUBSCRIPTION_PLANS)[number];

// 1. System Config (Pricing bands, trial settings, super admin initialization lock)
const pricingBandSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    minStudents: { type: Number, required: true },
    maxStudents: { type: Number, default: null },
    corePriceGhs: { type: Number, default: null },
    completePriceGhs: { type: Number, default: null },
    isCustomQuote: { type: Boolean, default: false },
  },
  { _id: false }
);

const promoOfferSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, required: true },
    discountType: { type: String, enum: ['PERCENT', 'FIXED_GHS'], default: 'PERCENT' },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmountGhs: { type: Number, default: 0, min: 0 },
    applicablePlan: { type: String, enum: ['ALL', 'CORE', 'COMPLETE'], default: 'ALL' },
    assignedSchoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null },
    assignedSchoolName: { type: String, default: '' },
    maxUses: { type: Number, default: null, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const planCatalogSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    tagline: { type: String, default: '' },
    durationLabel: { type: String, default: '1 Academic Term (Vacation-Based)' },
    durationDays: { type: Number, default: 110, min: 1, max: 1095 },
    startingPriceLabel: { type: String, default: 'GH₵ 350 / term' },
    features: { type: [String], default: [] },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const systemConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'GLOBAL_SETTINGS' },
    superAdminInitialized: { type: Boolean, default: false },
    trialDays: { type: Number, default: 7, min: 1, max: 90 },
    trialPolicyVersion: { type: Number, default: 1 },
    threeTermDiscountPercent: { type: Number, default: 10, min: 0, max: 50 },
    gracePeriodDays: { type: Number, default: 7, min: 0, max: 30 },
    defaultCountry: { type: String, default: 'Ghana' },
    defaultCurrency: { type: String, default: 'GH₵' },
    defaultTimezone: { type: String, default: 'Africa/Accra' },
    pricingBands: { type: [pricingBandSchema], default: [] },
    planCatalog: { type: [planCatalogSchema], default: [] },
    promotionalOffers: { type: [promoOfferSchema], default: [] },
    maintenanceMode: { type: Boolean, default: false },
    platformAnnouncement: { type: String, default: '' },
  },
  { timestamps: true }
);

// 2. School (Tenant)
const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    schoolType: {
      type: String,
      enum: ['Private', 'Public', 'Mission', 'International'],
      required: true,
    },
    educationalLevels: {
      type: [{ type: String, enum: EDUCATIONAL_LEVELS }],
      required: true,
    },
    country: { type: String, required: true, default: 'Ghana' },
    region: { type: String, required: true, trim: true },
    town: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    motto: { type: String, default: '', trim: true },
    logoDataUrl: { type: String, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'],
      default: 'PENDING',
      index: true,
    },
    rejectionReason: { type: String, default: '' },
    suspensionReason: { type: String, default: '' },
    studentPopulationEstimate: { type: Number, required: true, min: 1 },
    requestedPlan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    termVacationDate: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    onboardingSteps: {
      profileCompleted: { type: Boolean, default: false },
      logoUploaded: { type: Boolean, default: false },
      academicYearSet: { type: Boolean, default: false },
      termSet: { type: Boolean, default: false },
      classesCreated: { type: Boolean, default: false },
      subjectsConfigured: { type: Boolean, default: false },
      teachersInvited: { type: Boolean, default: false },
      studentsEnrolled: { type: Boolean, default: false },
      gradingConfigured: { type: Boolean, default: false },
      reportCardCustomized: { type: Boolean, default: false },
    },
    reportCardSettings: {
      headteacherName: { type: String, default: '' },
      showClassPosition: { type: Boolean, default: true },
      showAttendanceSummary: { type: Boolean, default: true },
      showQrVerification: { type: Boolean, default: true },
      footerNote: { type: String, default: 'Official Terminal Report issued via NexaSua.' },
      nextTermReopeningDate: { type: String, default: '' },
    },
    dashboardSettings: {
      customTitle: { type: String, default: '' },
      welcomeMessage: { type: String, default: '' },
      primaryColor: { type: String, default: '#102846' },
      accentColor: { type: String, default: '#148D82' },
      defaultLandingTab: { type: String, default: 'overview' },
      showSubscriptionBanner: { type: Boolean, default: true },
      showMetricsCards: { type: Boolean, default: true },
      showOnboardingChecklist: { type: Boolean, default: true },
      showNotificationsWidget: { type: Boolean, default: true },
      showSchoolLogoInSidebar: { type: Boolean, default: true },
    },
    paymentConfig: {
      paystackPublicKey: { type: String, default: '' },
      paystackSecretEncrypted: { type: String, default: '' },
      settlementAccountName: { type: String, default: '' },
      mobileMoneyInstructions: { type: String, default: '' },
      bankTransferInstructions: { type: String, default: '' },
      isConfigured: { type: Boolean, default: false },
    },
    currency: { type: String, default: 'GH₵' },
    timezone: { type: String, default: 'Africa/Accra' },
    branches: {
      type: [
        {
          name: String,
          town: String,
          address: String,
          isMain: Boolean,
        },
      ],
      default: [],
    },
    dataProtectionConsentAt: { type: Date, default: null },
    dataRetentionYears: { type: Number, default: 7, min: 1, max: 25 },
  },
  { timestamps: true }
);

// 3. User
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: '' },
    googleId: { type: String, default: '', index: true },
    linkedGoogleEmail: { type: String, default: '', lowercase: true, trim: true, index: true },
    authProvider: { type: String, enum: ['LOCAL', 'GOOGLE', 'HYBRID'], default: 'LOCAL' },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, default: '', trim: true },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, default: '' },
    mfaBackupCodesHash: { type: [String], default: [] },
    emailVerified: { type: Boolean, default: false },
    verificationTokenHash: { type: String, default: '' },
    resetTokenHash: { type: String, default: '' },
    resetTokenExpires: { type: Date, default: null },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'INVITED'], default: 'ACTIVE' },
    lastLoginAt: { type: Date, default: null },
    dataConsentAcceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 4. Subscription & Invoices
const subscriptionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, unique: true },
    plan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    status: {
      type: String,
      enum: ['TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED'],
      default: 'TRIAL',
      index: true,
    },
    billingCycle: { type: String, enum: ['TERM', 'THREE_TERMS'], default: 'TERM' },
    trialEndsAt: { type: Date, required: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    studentBand: { type: String, required: true },
    unitPriceGhs: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    amountDueGhs: { type: Number, default: 0 },
    gracePeriodDays: { type: Number, default: 7 },
    termVacationDate: { type: String, default: '' },
    portalClosedReason: { type: String, default: '' },
    overrideNote: { type: String, default: '' },
    lastReminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const subscriptionInvoiceSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true },
    plan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    billingCycle: { type: String, enum: ['TERM', 'THREE_TERMS'], required: true },
    studentCountAtBilling: { type: Number, required: true },
    amountGhs: { type: Number, required: true },
    discountAppliedGhs: { type: Number, default: 0 },
    promoCode: { type: String, default: '' },
    status: { type: String, enum: ['PENDING', 'PAID', 'FAILED', 'VOID'], default: 'PENDING' },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    paystackReference: { type: String, default: '', index: true },
    paymentMethod: { type: String, default: '' },
  },
  { timestamps: true }
);

// 5. Academic Year & Term
const academicYearSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    isCurrent: { type: Boolean, default: false },
  },
  { timestamps: true }
);
academicYearSchema.index({ schoolId: 1, name: 1 }, { unique: true });

const termSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    reopeningDate: { type: String, default: '' },
    isCurrent: { type: Boolean, default: false },
  },
  { timestamps: true }
);
termSchema.index({ schoolId: 1, academicYearId: 1, name: 1 }, { unique: true });

// 6. ClassRoom & Subject & TeacherAssignment
const classRoomSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    level: { type: String, enum: EDUCATIONAL_LEVELS, required: true },
    capacity: { type: Number, default: 45 },
    room: { type: String, default: '' },
    classTeacherId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
classRoomSchema.index({ schoolId: 1, name: 1 }, { unique: true });

const subjectSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    level: { type: String, enum: [...EDUCATIONAL_LEVELS, 'All'], default: 'All' },
    isCore: { type: Boolean, default: true },
  },
  { timestamps: true }
);
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });

const teacherAssignmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    isClassTeacher: { type: Boolean, default: false },
  },
  { timestamps: true }
);
teacherAssignmentSchema.index(
  { schoolId: 1, teacherId: 1, classId: 1, subjectId: 1, academicYearId: 1 },
  { unique: true }
);

// 7. Student & GuardianLink
const studentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    admissionNumber: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    dateOfBirth: { type: String, default: '' },
    currentClassId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    admissionDate: { type: String, required: true },
    status: {
      type: String,
      enum: ['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'ARCHIVED'],
      default: 'ACTIVE',
      index: true,
    },
    studentCategory: { type: String, enum: ['Day', 'Boarding', 'Scholarship'], default: 'Day' },
    guardianSummary: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      relationship: { type: String, default: 'Parent/Guardian' },
    },
    academicHistory: {
      type: [
        {
          academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear' },
          academicYearName: String,
          classId: { type: Schema.Types.ObjectId, ref: 'ClassRoom' },
          className: String,
          status: String,
          recordedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);
studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });

const guardianLinkSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    parentUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    relationship: { type: String, default: 'Parent/Guardian' },
    verified: { type: Boolean, default: false, index: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
guardianLinkSchema.index({ schoolId: 1, parentUserId: 1, studentId: 1 }, { unique: true });

// 8. Assessment Configuration & Scores & Report Cards
const assessmentCategorySchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'CLASS_EXERCISE',
        'QUIZ',
        'ASSIGNMENT',
        'PROJECT',
        'CLASS_TEST',
        'PRACTICAL',
        'CONTINUOUS_ASSESSMENT',
        'END_OF_TERM_EXAM',
      ],
      required: true,
    },
    maxMarks: { type: Number, required: true, min: 1 },
    weightPercent: { type: Number, required: true, min: 0, max: 100 },
    isExam: { type: Boolean, default: false },
  },
  { _id: false }
);

const gradingScaleRuleSchema = new Schema(
  {
    grade: { type: String, required: true },
    minScore: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    remark: { type: String, required: true },
  },
  { _id: false }
);

const assessmentConfigSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    name: { type: String, required: true, trim: true },
    level: { type: String, enum: [...EDUCATIONAL_LEVELS, 'All'], default: 'All' },
    isDefault: { type: Boolean, default: false },
    passMark: { type: Number, default: 50, min: 0, max: 100 },
    roundingMode: {
      type: String,
      enum: ['NEAREST_INT', 'ONE_DECIMAL', 'TWO_DECIMAL'],
      default: 'ONE_DECIMAL',
    },
    showClassPosition: { type: Boolean, default: true },
    missingMarkPolicy: { type: String, enum: ['TREAT_AS_INCOMPLETE', 'TREAT_AS_ZERO'], default: 'TREAT_AS_INCOMPLETE' },
    categories: { type: [assessmentCategorySchema], required: true },
    gradingScale: { type: [gradingScaleRuleSchema], required: true },
  },
  { timestamps: true }
);

const assessmentScoreSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentConfigId: { type: Schema.Types.ObjectId, ref: 'AssessmentConfig', required: true },
    categoryScores: {
      type: Map,
      of: new Schema(
        {
          rawScore: { type: Number, default: null },
          maxMarks: { type: Number, required: true },
          isMissing: { type: Boolean, default: true },
        },
        { _id: false }
      ),
      default: {},
    },
    caScore: { type: Number, default: null },
    examScore: { type: Number, default: null },
    finalScore: { type: Number, default: null },
    grade: { type: String, default: '' },
    remark: { type: String, default: '' },
    hasMissingMarks: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'REVIEWED', 'APPROVED', 'PUBLISHED'],
      default: 'DRAFT',
      index: true,
    },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    correctionReason: { type: String, default: '' },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
assessmentScoreSchema.index(
  { schoolId: 1, academicYearId: 1, termId: 1, classId: 1, subjectId: 1, studentId: 1 },
  { unique: true }
);

const reportCardSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
    referenceNumber: { type: String, required: true, unique: true },
    verificationToken: { type: String, required: true, unique: true },
    overallAverage: { type: Number, required: true },
    classPosition: { type: Number, default: null },
    totalStudentsInClass: { type: Number, required: true },
    attendanceSummary: {
      present: { type: Number, default: 0 },
      absent: { type: Number, default: 0 },
      late: { type: Number, default: 0 },
      excused: { type: Number, default: 0 },
      totalDays: { type: Number, default: 0 },
    },
    classTeacherRemarks: { type: String, default: '' },
    headteacherRemarks: { type: String, default: '' },
    promotionStatus: { type: String, default: '' },
    reopeningDate: { type: String, default: '' },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
reportCardSchema.index(
  { schoolId: 1, studentId: 1, academicYearId: 1, termId: 1 },
  { unique: true }
);

// 9. Attendance
const attendanceSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    date: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'], required: true },
    note: { type: String, default: '' },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    correctionApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
attendanceSchema.index({ schoolId: 1, classId: 1, date: 1, studentId: 1 }, { unique: true });

// 10. COMPLETE PLAN: School Fees, Invoices, Payments, Ledger, Reminders
const feeStructureSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['Tuition', 'Examination', 'Feeding', 'Transport', 'Boarding', 'Development Levy', 'Other'],
      required: true,
    },
    amountGhs: { type: Number, required: true, min: 0 },
    targetClassId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', default: null },
    targetStudentCategory: { type: String, enum: ['All', 'Day', 'Boarding', 'Scholarship'], default: 'All' },
  },
  { timestamps: true }
);

const feeInvoiceSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    invoiceNumber: { type: String, required: true },
    items: {
      type: [
        {
          description: { type: String, required: true },
          category: { type: String, required: true },
          amountGhs: { type: Number, required: true, min: 0 },
        },
      ],
      required: true,
    },
    subtotalGhs: { type: Number, required: true, min: 0 },
    discountGhs: { type: Number, default: 0, min: 0 },
    waiverGhs: { type: Number, default: 0, min: 0 },
    totalGhs: { type: Number, required: true, min: 0 },
    amountPaidGhs: { type: Number, default: 0, min: 0 },
    balanceGhs: { type: Number, required: true, min: 0 },
    dueDate: { type: String, required: true },
    status: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID'],
      default: 'UNPAID',
      index: true,
    },
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
feeInvoiceSchema.index({ schoolId: 1, invoiceNumber: 1 }, { unique: true });

const feePaymentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'FeeInvoice', required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    receiptNumber: { type: String, required: true },
    reference: { type: String, required: true, unique: true },
    amountGhs: { type: Number, required: true, min: 0.01 },
    channel: {
      type: String,
      enum: ['OFFLINE_CASH', 'OFFLINE_MOMO', 'OFFLINE_BANK', 'PAYSTACK_CARD', 'PAYSTACK_MOMO'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'FAILED', 'REVERSED'],
      default: 'PENDING',
      index: true,
    },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    verifiedAt: { type: Date, default: null },
    paystackData: { type: Schema.Types.Mixed, default: null },
    reversalReason: { type: String, default: '' },
  },
  { timestamps: true }
);
feePaymentSchema.index({ schoolId: 1, receiptNumber: 1 }, { unique: true });

const financialLedgerSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    entryType: {
      type: String,
      enum: ['INVOICE_CHARGE', 'PAYMENT_CREDIT', 'DISCOUNT', 'WAIVER', 'CREDIT_NOTE', 'REFUND', 'REVERSAL'],
      required: true,
    },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'FeeInvoice', required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: 'FeePayment', default: null },
    amountGhs: { type: Number, required: true },
    description: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const feeReminderSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'FeeInvoice', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'Student', required: true },
    guardianUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    channel: { type: String, enum: ['IN_APP', 'EMAIL', 'SMS'], required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ['SCHEDULED', 'SENT', 'DELIVERED', 'FAILED'], default: 'SCHEDULED' },
    sentAt: { type: Date, default: null },
    errorMessage: { type: String, default: '' },
    dedupeKey: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

const feeCouponSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, required: true, trim: true },
    discountType: { type: String, enum: ['PERCENT', 'FIXED_GHS'], default: 'PERCENT' },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmountGhs: { type: Number, default: 0, min: 0 },
    maxUses: { type: Number, default: null, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);
feeCouponSchema.index({ schoolId: 1, code: 1 }, { unique: true });

// 11. Announcements & Notifications
const announcementSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    category: {
      type: String,
      enum: ['Reopening', 'Exams', 'Parent Meeting', 'Event', 'Emergency', 'Holiday', 'Fees', 'Notice'],
      default: 'Notice',
    },
    audience: { type: String, enum: ['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'CLASS'], default: 'ALL' },
    targetClassId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', default: null },
    status: { type: String, enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' },
    scheduledFor: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

const notificationSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: 'INFO' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// 12. Admissions, Staff, Timetable
const admissionApplicationSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    applicationNumber: { type: String, required: true },
    applicantName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['Male', 'Female'], required: true },
    dateOfBirth: { type: String, default: '' },
    applyingForClassId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    guardianName: { type: String, required: true },
    guardianPhone: { type: String, required: true },
    guardianEmail: { type: String, default: '' },
    previousSchool: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED', 'ENROLLED'],
      default: 'SUBMITTED',
      index: true,
    },
    enrolledStudentId: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
admissionApplicationSchema.index({ schoolId: 1, applicationNumber: 1 }, { unique: true });

const staffRecordSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    staffNumber: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    jobRole: { type: String, required: true, trim: true },
    employmentStatus: {
      type: String,
      enum: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'RESIGNED'],
      default: 'ACTIVE',
    },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    dateJoined: { type: String, required: true },
    responsibilities: { type: String, default: '' },
    leaveRequests: {
      type: [
        {
          startDate: { type: String, required: true },
          endDate: { type: String, required: true },
          reason: { type: String, required: true },
          status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], default: 'PENDING' },
          reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
          reviewedAt: { type: Date, default: null },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);
staffRecordSchema.index({ schoolId: 1, staffNumber: 1 }, { unique: true });

const timetableSlotSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: 'AcademicYear', required: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    classId: { type: Schema.Types.ObjectId, ref: 'ClassRoom', required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    dayOfWeek: {
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      required: true,
    },
    periodNumber: { type: Number, required: true, min: 1, max: 12 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, default: '' },
    isBreak: { type: Boolean, default: false },
    breakLabel: { type: String, default: '' },
  },
  { timestamps: true }
);

// 13. NexaSua Custom Projects, Support Tickets, Audit Logs
const customProjectRequestSchema = new Schema(
  {
    referenceNumber: { type: String, required: true, unique: true },
    schoolName: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    studentPopulation: { type: String, required: true },
    requestedFeatures: { type: [String], default: [] },
    budgetRange: { type: String, required: true },
    timeline: { type: String, required: true },
    requirements: { type: String, default: '' },
    status: {
      type: String,
      enum: [
        'NEW',
        'REQUIREMENTS_REVIEW',
        'CONSULTATION',
        'QUOTATION_PREPARED',
        'QUOTATION_APPROVED',
        'DEVELOPMENT',
        'TESTING',
        'DEPLOYMENT',
        'MAINTENANCE',
        'COMPLETED',
      ],
      default: 'NEW',
    },
    quotationAmountGhs: { type: Number, default: null },
    maintenanceFeeGhs: { type: Number, default: null },
    milestones: {
      type: [
        {
          title: String,
          dueDate: String,
          completed: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    internalNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

const supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    contactName: { type: String, required: true },
    contactEmail: { type: String, required: true },
    subject: { type: String, required: true },
    category: { type: String, default: 'General' },
    priority: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
    description: { type: String, required: true },
    status: { type: String, enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], default: 'OPEN' },
    responses: {
      type: [
        {
          authorName: String,
          role: String,
          message: String,
          createdAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

const auditLogSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    userEmail: { type: String, default: '' },
    userRole: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: '' },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

export const SystemConfigModel =
  mongoose.models.SystemConfig || mongoose.model('SystemConfig', systemConfigSchema);
export const SchoolModel = mongoose.models.School || mongoose.model('School', schoolSchema);
export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
export const SubscriptionModel =
  mongoose.models.Subscription || mongoose.model('Subscription', subscriptionSchema);
export const SubscriptionInvoiceModel =
  mongoose.models.SubscriptionInvoice ||
  mongoose.model('SubscriptionInvoice', subscriptionInvoiceSchema);
export const AcademicYearModel =
  mongoose.models.AcademicYear || mongoose.model('AcademicYear', academicYearSchema);
export const TermModel = mongoose.models.Term || mongoose.model('Term', termSchema);
export const ClassRoomModel =
  mongoose.models.ClassRoom || mongoose.model('ClassRoom', classRoomSchema);
export const SubjectModel = mongoose.models.Subject || mongoose.model('Subject', subjectSchema);
export const TeacherAssignmentModel =
  mongoose.models.TeacherAssignment ||
  mongoose.model('TeacherAssignment', teacherAssignmentSchema);
export const StudentModel = mongoose.models.Student || mongoose.model('Student', studentSchema);
export const GuardianLinkModel =
  mongoose.models.GuardianLink || mongoose.model('GuardianLink', guardianLinkSchema);
export const AssessmentConfigModel =
  mongoose.models.AssessmentConfig ||
  mongoose.model('AssessmentConfig', assessmentConfigSchema);
export const AssessmentScoreModel =
  mongoose.models.AssessmentScore || mongoose.model('AssessmentScore', assessmentScoreSchema);
export const ReportCardModel =
  mongoose.models.ReportCard || mongoose.model('ReportCard', reportCardSchema);
export const AttendanceModel =
  mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
export const FeeStructureModel =
  mongoose.models.FeeStructure || mongoose.model('FeeStructure', feeStructureSchema);
export const FeeInvoiceModel =
  mongoose.models.FeeInvoice || mongoose.model('FeeInvoice', feeInvoiceSchema);
export const FeePaymentModel =
  mongoose.models.FeePayment || mongoose.model('FeePayment', feePaymentSchema);
export const FinancialLedgerModel =
  mongoose.models.FinancialLedger || mongoose.model('FinancialLedger', financialLedgerSchema);
export const FeeReminderModel =
  mongoose.models.FeeReminder || mongoose.model('FeeReminder', feeReminderSchema);
export const FeeCouponModel =
  mongoose.models.FeeCoupon || mongoose.model('FeeCoupon', feeCouponSchema);
export const AnnouncementModel =
  mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
export const AdmissionApplicationModel =
  mongoose.models.AdmissionApplication ||
  mongoose.model('AdmissionApplication', admissionApplicationSchema);
export const StaffRecordModel =
  mongoose.models.StaffRecord || mongoose.model('StaffRecord', staffRecordSchema);
export const TimetableSlotModel =
  mongoose.models.TimetableSlot || mongoose.model('TimetableSlot', timetableSlotSchema);
export const CustomProjectRequestModel =
  mongoose.models.CustomProjectRequest ||
  mongoose.model('CustomProjectRequest', customProjectRequestSchema);
export const SupportTicketModel =
  mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);
export const AuditLogModel =
  mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

export type ObjectId = Types.ObjectId;
