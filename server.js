// server.ts
import express9 from "express";
import path2 from "path";
import { fileURLToPath } from "url";

// server/app.ts
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express8 from "express";

// server/db.ts
import mongoose from "mongoose";
var dbState = {
  status: "Not Configured"
};
var globalForDb = globalThis;
function getDbState() {
  if (!process.env.MONGODB_URI?.trim()) {
    return { status: "Not Configured", error: "MONGODB_URI environment variable is not set." };
  }
  if (mongoose.connection.readyState === 1) {
    return { status: "Connected", lastCheckedAt: /* @__PURE__ */ new Date() };
  }
  return dbState;
}
function isDbConnected() {
  return mongoose.connection.readyState === 1;
}
async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    dbState.status = "Not Configured";
    dbState.error = "MONGODB_URI environment variable is not set.";
    return false;
  }
  if (mongoose.connection.readyState === 1) {
    dbState.status = "Connected";
    dbState.error = void 0;
    return true;
  }
  if (globalForDb.__nexasuaConnectPromise) {
    return globalForDb.__nexasuaConnectPromise;
  }
  globalForDb.__nexasuaConnectPromise = (async () => {
    try {
      dbState.status = "Testing";
      dbState.error = void 0;
      mongoose.set("strictQuery", true);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5e3,
        maxPoolSize: 10
      });
      dbState.status = "Connected";
      dbState.lastCheckedAt = /* @__PURE__ */ new Date();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to connect to MongoDB Atlas";
      dbState.status = "Error";
      dbState.error = message;
      dbState.lastCheckedAt = /* @__PURE__ */ new Date();
      return false;
    } finally {
      globalForDb.__nexasuaConnectPromise = null;
    }
  })();
  return globalForDb.__nexasuaConnectPromise;
}
async function ensureDatabaseConnection() {
  if (isDbConnected()) return true;
  return connectDatabase();
}
async function pingDatabase() {
  if (!isDbConnected() || !mongoose.connection.db) {
    return { ok: false, error: getDbState().error || "Database not connected" };
  }
  const start = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Ping failed" };
  }
}

// server/routes/academicsRoutes.ts
import crypto3 from "crypto";
import express from "express";
import mongoose5 from "mongoose";
import multer from "multer";
import { z } from "zod";

// server/middleware/auth.ts
import mongoose3 from "mongoose";

// server/models/index.ts
import mongoose2, { Schema } from "mongoose";
var USER_ROLES = [
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "HEADTEACHER",
  "CLASS_TEACHER",
  "SUBJECT_TEACHER",
  "BURSAR",
  "ADMIN_STAFF",
  "STUDENT",
  "PARENT"
];
var EDUCATIONAL_LEVELS = [
  "Kindergarten",
  "Primary",
  "Junior High School",
  "Senior High School"
];
var SUBSCRIPTION_PLANS = ["CORE", "COMPLETE"];
var pricingBandSchema = new Schema(
  {
    code: { type: String, required: true },
    label: { type: String, required: true },
    minStudents: { type: Number, required: true },
    maxStudents: { type: Number, default: null },
    corePriceGhs: { type: Number, default: null },
    completePriceGhs: { type: Number, default: null },
    isCustomQuote: { type: Boolean, default: false }
  },
  { _id: false }
);
var promoOfferSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    description: { type: String, required: true },
    discountPercent: { type: Number, required: true, min: 1, max: 100 },
    applicablePlan: { type: String, enum: ["ALL", "CORE", "COMPLETE"], default: "ALL" },
    active: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);
var planCatalogSchema = new Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    tagline: { type: String, default: "" },
    durationLabel: { type: String, default: "1 Academic Term (Vacation-Based)" },
    durationDays: { type: Number, default: 110, min: 1, max: 1095 },
    startingPriceLabel: { type: String, default: "GH\u20B5 350 / term" },
    features: { type: [String], default: [] },
    isFeatured: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true }
  },
  { _id: false }
);
var systemConfigSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "GLOBAL_SETTINGS" },
    superAdminInitialized: { type: Boolean, default: false },
    trialDays: { type: Number, default: 7, min: 1, max: 90 },
    trialPolicyVersion: { type: Number, default: 1 },
    threeTermDiscountPercent: { type: Number, default: 10, min: 0, max: 50 },
    gracePeriodDays: { type: Number, default: 7, min: 0, max: 30 },
    defaultCountry: { type: String, default: "Ghana" },
    defaultCurrency: { type: String, default: "GH\u20B5" },
    defaultTimezone: { type: String, default: "Africa/Accra" },
    pricingBands: { type: [pricingBandSchema], default: [] },
    planCatalog: { type: [planCatalogSchema], default: [] },
    promotionalOffers: { type: [promoOfferSchema], default: [] },
    maintenanceMode: { type: Boolean, default: false },
    platformAnnouncement: { type: String, default: "" }
  },
  { timestamps: true }
);
var schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    schoolCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    schoolType: {
      type: String,
      enum: ["Private", "Public", "Mission", "International"],
      required: true
    },
    educationalLevels: {
      type: [{ type: String, enum: EDUCATIONAL_LEVELS }],
      required: true
    },
    country: { type: String, required: true, default: "Ghana" },
    region: { type: String, required: true, trim: true },
    town: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    motto: { type: String, default: "", trim: true },
    logoDataUrl: { type: String, default: "" },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "SUSPENDED", "REJECTED"],
      default: "PENDING",
      index: true
    },
    rejectionReason: { type: String, default: "" },
    suspensionReason: { type: String, default: "" },
    studentPopulationEstimate: { type: Number, required: true, min: 1 },
    requestedPlan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    termVacationDate: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
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
      reportCardCustomized: { type: Boolean, default: false }
    },
    reportCardSettings: {
      headteacherName: { type: String, default: "" },
      showClassPosition: { type: Boolean, default: true },
      showAttendanceSummary: { type: Boolean, default: true },
      showQrVerification: { type: Boolean, default: true },
      footerNote: { type: String, default: "Official Terminal Report issued via NexaSua." },
      nextTermReopeningDate: { type: String, default: "" }
    },
    dashboardSettings: {
      customTitle: { type: String, default: "" },
      welcomeMessage: { type: String, default: "" },
      primaryColor: { type: String, default: "#102846" },
      accentColor: { type: String, default: "#148D82" },
      defaultLandingTab: { type: String, default: "overview" },
      showSubscriptionBanner: { type: Boolean, default: true },
      showMetricsCards: { type: Boolean, default: true },
      showOnboardingChecklist: { type: Boolean, default: true },
      showNotificationsWidget: { type: Boolean, default: true },
      showSchoolLogoInSidebar: { type: Boolean, default: true }
    },
    paymentConfig: {
      paystackPublicKey: { type: String, default: "" },
      paystackSecretEncrypted: { type: String, default: "" },
      settlementAccountName: { type: String, default: "" },
      mobileMoneyInstructions: { type: String, default: "" },
      bankTransferInstructions: { type: String, default: "" },
      isConfigured: { type: Boolean, default: false }
    },
    currency: { type: String, default: "GH\u20B5" },
    timezone: { type: String, default: "Africa/Accra" },
    branches: {
      type: [
        {
          name: String,
          town: String,
          address: String,
          isMain: Boolean
        }
      ],
      default: []
    },
    dataProtectionConsentAt: { type: Date, default: null },
    dataRetentionYears: { type: Number, default: 7, min: 1, max: 25 }
  },
  { timestamps: true }
);
var userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, default: "" },
    googleId: { type: String, default: "", index: true },
    authProvider: { type: String, enum: ["LOCAL", "GOOGLE", "HYBRID"], default: "LOCAL" },
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true },
    role: { type: String, enum: USER_ROLES, required: true, index: true },
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecretEncrypted: { type: String, default: "" },
    mfaBackupCodesHash: { type: [String], default: [] },
    emailVerified: { type: Boolean, default: false },
    verificationTokenHash: { type: String, default: "" },
    resetTokenHash: { type: String, default: "" },
    resetTokenExpires: { type: Date, default: null },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED", "INVITED"], default: "ACTIVE" },
    lastLoginAt: { type: Date, default: null },
    dataConsentAcceptedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
var subscriptionSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, unique: true },
    plan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    status: {
      type: String,
      enum: ["TRIAL", "ACTIVE", "GRACE_PERIOD", "EXPIRED", "SUSPENDED"],
      default: "TRIAL",
      index: true
    },
    billingCycle: { type: String, enum: ["TERM", "THREE_TERMS"], default: "TERM" },
    trialEndsAt: { type: Date, required: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    studentBand: { type: String, required: true },
    unitPriceGhs: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    amountDueGhs: { type: Number, default: 0 },
    gracePeriodDays: { type: Number, default: 7 },
    termVacationDate: { type: String, default: "" },
    portalClosedReason: { type: String, default: "" },
    overrideNote: { type: String, default: "" },
    lastReminderSentAt: { type: Date, default: null }
  },
  { timestamps: true }
);
var subscriptionInvoiceSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    invoiceNumber: { type: String, required: true, unique: true },
    plan: { type: String, enum: SUBSCRIPTION_PLANS, required: true },
    billingCycle: { type: String, enum: ["TERM", "THREE_TERMS"], required: true },
    studentCountAtBilling: { type: Number, required: true },
    amountGhs: { type: Number, required: true },
    discountAppliedGhs: { type: Number, default: 0 },
    promoCode: { type: String, default: "" },
    status: { type: String, enum: ["PENDING", "PAID", "FAILED", "VOID"], default: "PENDING" },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date, default: null },
    paystackReference: { type: String, default: "", index: true },
    paymentMethod: { type: String, default: "" }
  },
  { timestamps: true }
);
var academicYearSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    isCurrent: { type: Boolean, default: false }
  },
  { timestamps: true }
);
academicYearSchema.index({ schoolId: 1, name: 1 }, { unique: true });
var termSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    reopeningDate: { type: String, default: "" },
    isCurrent: { type: Boolean, default: false }
  },
  { timestamps: true }
);
termSchema.index({ schoolId: 1, academicYearId: 1, name: 1 }, { unique: true });
var classRoomSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    level: { type: String, enum: EDUCATIONAL_LEVELS, required: true },
    capacity: { type: Number, default: 45 },
    room: { type: String, default: "" },
    classTeacherId: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);
classRoomSchema.index({ schoolId: 1, name: 1 }, { unique: true });
var subjectSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    level: { type: String, enum: [...EDUCATIONAL_LEVELS, "All"], default: "All" },
    isCore: { type: Boolean, default: true }
  },
  { timestamps: true }
);
subjectSchema.index({ schoolId: 1, code: 1 }, { unique: true });
var teacherAssignmentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    isClassTeacher: { type: Boolean, default: false }
  },
  { timestamps: true }
);
teacherAssignmentSchema.index(
  { schoolId: 1, teacherId: 1, classId: 1, subjectId: 1, academicYearId: 1 },
  { unique: true }
);
var studentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
    admissionNumber: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["Male", "Female"], required: true },
    dateOfBirth: { type: String, default: "" },
    currentClassId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    admissionDate: { type: String, required: true },
    status: {
      type: String,
      enum: ["ACTIVE", "TRANSFERRED", "GRADUATED", "ARCHIVED"],
      default: "ACTIVE",
      index: true
    },
    studentCategory: { type: String, enum: ["Day", "Boarding", "Scholarship"], default: "Day" },
    guardianSummary: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      relationship: { type: String, default: "Parent/Guardian" }
    },
    academicHistory: {
      type: [
        {
          academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear" },
          academicYearName: String,
          classId: { type: Schema.Types.ObjectId, ref: "ClassRoom" },
          className: String,
          status: String,
          recordedAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);
studentSchema.index({ schoolId: 1, admissionNumber: 1 }, { unique: true });
var guardianLinkSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    parentUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    relationship: { type: String, default: "Parent/Guardian" },
    verified: { type: Boolean, default: false, index: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);
guardianLinkSchema.index({ schoolId: 1, parentUserId: 1, studentId: 1 }, { unique: true });
var assessmentCategorySchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "CLASS_EXERCISE",
        "QUIZ",
        "ASSIGNMENT",
        "PROJECT",
        "CLASS_TEST",
        "PRACTICAL",
        "CONTINUOUS_ASSESSMENT",
        "END_OF_TERM_EXAM"
      ],
      required: true
    },
    maxMarks: { type: Number, required: true, min: 1 },
    weightPercent: { type: Number, required: true, min: 0, max: 100 },
    isExam: { type: Boolean, default: false }
  },
  { _id: false }
);
var gradingScaleRuleSchema = new Schema(
  {
    grade: { type: String, required: true },
    minScore: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    remark: { type: String, required: true }
  },
  { _id: false }
);
var assessmentConfigSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    name: { type: String, required: true, trim: true },
    level: { type: String, enum: [...EDUCATIONAL_LEVELS, "All"], default: "All" },
    isDefault: { type: Boolean, default: false },
    passMark: { type: Number, default: 50, min: 0, max: 100 },
    roundingMode: {
      type: String,
      enum: ["NEAREST_INT", "ONE_DECIMAL", "TWO_DECIMAL"],
      default: "ONE_DECIMAL"
    },
    showClassPosition: { type: Boolean, default: true },
    missingMarkPolicy: { type: String, enum: ["TREAT_AS_INCOMPLETE", "TREAT_AS_ZERO"], default: "TREAT_AS_INCOMPLETE" },
    categories: { type: [assessmentCategorySchema], required: true },
    gradingScale: { type: [gradingScaleRuleSchema], required: true }
  },
  { timestamps: true }
);
var assessmentScoreSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    termId: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assessmentConfigId: { type: Schema.Types.ObjectId, ref: "AssessmentConfig", required: true },
    categoryScores: {
      type: Map,
      of: new Schema(
        {
          rawScore: { type: Number, default: null },
          maxMarks: { type: Number, required: true },
          isMissing: { type: Boolean, default: true }
        },
        { _id: false }
      ),
      default: {}
    },
    caScore: { type: Number, default: null },
    examScore: { type: Number, default: null },
    finalScore: { type: Number, default: null },
    grade: { type: String, default: "" },
    remark: { type: String, default: "" },
    hasMissingMarks: { type: Boolean, default: true },
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "REVIEWED", "APPROVED", "PUBLISHED"],
      default: "DRAFT",
      index: true
    },
    submittedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    correctionReason: { type: String, default: "" },
    lastModifiedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);
assessmentScoreSchema.index(
  { schoolId: 1, academicYearId: 1, termId: 1, classId: 1, subjectId: 1, studentId: 1 },
  { unique: true }
);
var reportCardSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    termId: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true },
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
      totalDays: { type: Number, default: 0 }
    },
    classTeacherRemarks: { type: String, default: "" },
    headteacherRemarks: { type: String, default: "" },
    promotionStatus: { type: String, default: "" },
    reopeningDate: { type: String, default: "" },
    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);
reportCardSchema.index(
  { schoolId: 1, studentId: 1, academicYearId: 1, termId: 1 },
  { unique: true }
);
var attendanceSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    termId: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    date: { type: String, required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    status: { type: String, enum: ["PRESENT", "ABSENT", "LATE", "EXCUSED"], required: true },
    note: { type: String, default: "" },
    markedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    correctionApprovedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);
attendanceSchema.index({ schoolId: 1, classId: 1, date: 1, studentId: 1 }, { unique: true });
var feeStructureSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    termId: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["Tuition", "Examination", "Feeding", "Transport", "Boarding", "Development Levy", "Other"],
      required: true
    },
    amountGhs: { type: Number, required: true, min: 0 },
    targetClassId: { type: Schema.Types.ObjectId, ref: "ClassRoom", default: null },
    targetStudentCategory: { type: String, enum: ["All", "Day", "Boarding", "Scholarship"], default: "All" }
  },
  { timestamps: true }
);
var feeInvoiceSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    termId: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    invoiceNumber: { type: String, required: true },
    items: {
      type: [
        {
          description: { type: String, required: true },
          category: { type: String, required: true },
          amountGhs: { type: Number, required: true, min: 0 }
        }
      ],
      required: true
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
      enum: ["UNPAID", "PARTIAL", "PAID", "OVERDUE", "VOID"],
      default: "UNPAID",
      index: true
    },
    notes: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);
feeInvoiceSchema.index({ schoolId: 1, invoiceNumber: 1 }, { unique: true });
var feePaymentSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "FeeInvoice", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    receiptNumber: { type: String, required: true },
    reference: { type: String, required: true, unique: true },
    amountGhs: { type: Number, required: true, min: 0.01 },
    channel: {
      type: String,
      enum: ["OFFLINE_CASH", "OFFLINE_MOMO", "OFFLINE_BANK", "PAYSTACK_CARD", "PAYSTACK_MOMO"],
      required: true
    },
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "FAILED", "REVERSED"],
      default: "PENDING",
      index: true
    },
    recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    verifiedAt: { type: Date, default: null },
    paystackData: { type: Schema.Types.Mixed, default: null },
    reversalReason: { type: String, default: "" }
  },
  { timestamps: true }
);
feePaymentSchema.index({ schoolId: 1, receiptNumber: 1 }, { unique: true });
var financialLedgerSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    entryType: {
      type: String,
      enum: ["INVOICE_CHARGE", "PAYMENT_CREDIT", "DISCOUNT", "WAIVER", "CREDIT_NOTE", "REFUND", "REVERSAL"],
      required: true
    },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "FeeInvoice", required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "FeePayment", default: null },
    amountGhs: { type: Number, required: true },
    description: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);
var feeReminderSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "FeeInvoice", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    guardianUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    channel: { type: String, enum: ["IN_APP", "EMAIL", "SMS"], required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    status: { type: String, enum: ["SCHEDULED", "SENT", "DELIVERED", "FAILED"], default: "SCHEDULED" },
    sentAt: { type: Date, default: null },
    errorMessage: { type: String, default: "" },
    dedupeKey: { type: String, required: true, unique: true }
  },
  { timestamps: true }
);
var announcementSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    category: {
      type: String,
      enum: ["Reopening", "Exams", "Parent Meeting", "Event", "Emergency", "Holiday", "Fees", "Notice"],
      default: "Notice"
    },
    audience: { type: String, enum: ["ALL", "TEACHERS", "PARENTS", "STUDENTS", "CLASS"], default: "ALL" },
    targetClassId: { type: Schema.Types.ObjectId, ref: "ClassRoom", default: null },
    status: { type: String, enum: ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"], default: "DRAFT" },
    scheduledFor: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);
var notificationSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, default: "INFO" },
    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);
var admissionApplicationSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    applicationNumber: { type: String, required: true },
    applicantName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["Male", "Female"], required: true },
    dateOfBirth: { type: String, default: "" },
    applyingForClassId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    guardianName: { type: String, required: true },
    guardianPhone: { type: String, required: true },
    guardianEmail: { type: String, default: "" },
    previousSchool: { type: String, default: "" },
    notes: { type: String, default: "" },
    status: {
      type: String,
      enum: ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "WAITLISTED", "REJECTED", "ENROLLED"],
      default: "SUBMITTED",
      index: true
    },
    enrolledStudentId: { type: Schema.Types.ObjectId, ref: "Student", default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }
  },
  { timestamps: true }
);
admissionApplicationSchema.index({ schoolId: 1, applicationNumber: 1 }, { unique: true });
var staffRecordSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    staffNumber: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    jobRole: { type: String, required: true, trim: true },
    employmentStatus: {
      type: String,
      enum: ["ACTIVE", "ON_LEAVE", "SUSPENDED", "RESIGNED"],
      default: "ACTIVE"
    },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    dateJoined: { type: String, required: true },
    responsibilities: { type: String, default: "" },
    leaveRequests: {
      type: [
        {
          startDate: { type: String, required: true },
          endDate: { type: String, required: true },
          reason: { type: String, required: true },
          status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
          reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
          reviewedAt: { type: Date, default: null }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);
staffRecordSchema.index({ schoolId: 1, staffNumber: 1 }, { unique: true });
var timetableSlotSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    termId: { type: Schema.Types.ObjectId, ref: "Term", required: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassRoom", required: true },
    subjectId: { type: Schema.Types.ObjectId, ref: "Subject", default: null },
    teacherId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    dayOfWeek: {
      type: String,
      enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      required: true
    },
    periodNumber: { type: Number, required: true, min: 1, max: 12 },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    room: { type: String, default: "" },
    isBreak: { type: Boolean, default: false },
    breakLabel: { type: String, default: "" }
  },
  { timestamps: true }
);
var customProjectRequestSchema = new Schema(
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
    requirements: { type: String, default: "" },
    status: {
      type: String,
      enum: [
        "NEW",
        "REQUIREMENTS_REVIEW",
        "CONSULTATION",
        "QUOTATION_PREPARED",
        "QUOTATION_APPROVED",
        "DEVELOPMENT",
        "TESTING",
        "DEPLOYMENT",
        "MAINTENANCE",
        "COMPLETED"
      ],
      default: "NEW"
    },
    quotationAmountGhs: { type: Number, default: null },
    maintenanceFeeGhs: { type: Number, default: null },
    milestones: {
      type: [
        {
          title: String,
          dueDate: String,
          completed: { type: Boolean, default: false }
        }
      ],
      default: []
    },
    internalNotes: { type: String, default: "" }
  },
  { timestamps: true }
);
var supportTicketSchema = new Schema(
  {
    ticketNumber: { type: String, required: true, unique: true },
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    contactName: { type: String, required: true },
    contactEmail: { type: String, required: true },
    subject: { type: String, required: true },
    category: { type: String, default: "General" },
    priority: { type: String, enum: ["LOW", "MEDIUM", "HIGH"], default: "MEDIUM" },
    description: { type: String, required: true },
    status: { type: String, enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"], default: "OPEN" },
    responses: {
      type: [
        {
          authorName: String,
          role: String,
          message: String,
          createdAt: { type: Date, default: Date.now }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);
var auditLogSchema = new Schema(
  {
    schoolId: { type: Schema.Types.ObjectId, ref: "School", default: null, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userEmail: { type: String, default: "" },
    userRole: { type: String, default: "" },
    action: { type: String, required: true, index: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, default: "" },
    details: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: "" }
  },
  { timestamps: true }
);
var SystemConfigModel = mongoose2.models.SystemConfig || mongoose2.model("SystemConfig", systemConfigSchema);
var SchoolModel = mongoose2.models.School || mongoose2.model("School", schoolSchema);
var UserModel = mongoose2.models.User || mongoose2.model("User", userSchema);
var SubscriptionModel = mongoose2.models.Subscription || mongoose2.model("Subscription", subscriptionSchema);
var SubscriptionInvoiceModel = mongoose2.models.SubscriptionInvoice || mongoose2.model("SubscriptionInvoice", subscriptionInvoiceSchema);
var AcademicYearModel = mongoose2.models.AcademicYear || mongoose2.model("AcademicYear", academicYearSchema);
var TermModel = mongoose2.models.Term || mongoose2.model("Term", termSchema);
var ClassRoomModel = mongoose2.models.ClassRoom || mongoose2.model("ClassRoom", classRoomSchema);
var SubjectModel = mongoose2.models.Subject || mongoose2.model("Subject", subjectSchema);
var TeacherAssignmentModel = mongoose2.models.TeacherAssignment || mongoose2.model("TeacherAssignment", teacherAssignmentSchema);
var StudentModel = mongoose2.models.Student || mongoose2.model("Student", studentSchema);
var GuardianLinkModel = mongoose2.models.GuardianLink || mongoose2.model("GuardianLink", guardianLinkSchema);
var AssessmentConfigModel = mongoose2.models.AssessmentConfig || mongoose2.model("AssessmentConfig", assessmentConfigSchema);
var AssessmentScoreModel = mongoose2.models.AssessmentScore || mongoose2.model("AssessmentScore", assessmentScoreSchema);
var ReportCardModel = mongoose2.models.ReportCard || mongoose2.model("ReportCard", reportCardSchema);
var AttendanceModel = mongoose2.models.Attendance || mongoose2.model("Attendance", attendanceSchema);
var FeeStructureModel = mongoose2.models.FeeStructure || mongoose2.model("FeeStructure", feeStructureSchema);
var FeeInvoiceModel = mongoose2.models.FeeInvoice || mongoose2.model("FeeInvoice", feeInvoiceSchema);
var FeePaymentModel = mongoose2.models.FeePayment || mongoose2.model("FeePayment", feePaymentSchema);
var FinancialLedgerModel = mongoose2.models.FinancialLedger || mongoose2.model("FinancialLedger", financialLedgerSchema);
var FeeReminderModel = mongoose2.models.FeeReminder || mongoose2.model("FeeReminder", feeReminderSchema);
var AnnouncementModel = mongoose2.models.Announcement || mongoose2.model("Announcement", announcementSchema);
var NotificationModel = mongoose2.models.Notification || mongoose2.model("Notification", notificationSchema);
var AdmissionApplicationModel = mongoose2.models.AdmissionApplication || mongoose2.model("AdmissionApplication", admissionApplicationSchema);
var StaffRecordModel = mongoose2.models.StaffRecord || mongoose2.model("StaffRecord", staffRecordSchema);
var TimetableSlotModel = mongoose2.models.TimetableSlot || mongoose2.model("TimetableSlot", timetableSlotSchema);
var CustomProjectRequestModel = mongoose2.models.CustomProjectRequest || mongoose2.model("CustomProjectRequest", customProjectRequestSchema);
var SupportTicketModel = mongoose2.models.SupportTicket || mongoose2.model("SupportTicket", supportTicketSchema);
var AuditLogModel = mongoose2.models.AuditLog || mongoose2.model("AuditLog", auditLogSchema);

// server/services/securityService.ts
import crypto2 from "crypto";
import jwt from "jsonwebtoken";
import QRCode from "qrcode";

// server/config/env.ts
import crypto from "crypto";
var EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString("hex");
var EPHEMERAL_ENCRYPTION_KEY = crypto.randomBytes(32);
function resolveConfiguredSessionSecret() {
  const sessionSecret = process.env.SESSION_SECRET?.trim() || "";
  if (sessionSecret.length >= 16) {
    return sessionSecret;
  }
  const jwtSecret = process.env.JWT_SECRET?.trim() || "";
  if (jwtSecret.length >= 16) {
    return jwtSecret;
  }
  return "";
}
function isSessionSecretConfigured() {
  return resolveConfiguredSessionSecret().length >= 16;
}
function getSessionSecret() {
  return resolveConfiguredSessionSecret() || EPHEMERAL_SESSION_SECRET;
}
var getJwtSecret = getSessionSecret;
function getEncryptionKey() {
  const configured = resolveConfiguredSessionSecret();
  if (configured) {
    return crypto.createHash("sha256").update(configured).digest();
  }
  return EPHEMERAL_ENCRYPTION_KEY;
}
function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}
function decryptSecret(payload) {
  const parts = payload.split(":");
  if (parts.length !== 3) return "";
  const [ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final()
  ]);
  return decrypted.toString("utf8");
}
function getSuperAdminEnvCredentials() {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || "";
  const password = process.env.SUPER_ADMIN_PASSWORD || "";
  return {
    email,
    password,
    configured: Boolean(email && email.includes("@") && password.length > 0)
  };
}
function getSchoolAdminEnvCredentials() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || "";
  const password = process.env.ADMIN_PASSWORD || "";
  return {
    email,
    password,
    configured: Boolean(email && email.includes("@") && password.length > 0)
  };
}
function verifyEnvSecretMatch(input, secret) {
  if (!secret || !input) return false;
  const a = crypto.createHash("sha256").update(input, "utf8").digest();
  const b = crypto.createHash("sha256").update(secret, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}
function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}
function getPlatformIntegrationsStatus(dbState2) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
  const paystackPublic = process.env.PAYSTACK_PUBLIC_KEY?.trim() || "";
  const paystackStatus = paystackSecret && paystackPublic ? paystackSecret.startsWith("sk_test_") ? "Testing" : "Connected" : "Not Configured";
  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()
  );
  const smsConfigured = Boolean(
    process.env.SMS_PROVIDER_URL?.trim() && process.env.SMS_API_KEY?.trim()
  );
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const googleOAuthConfigured = isGoogleOAuthConfigured();
  const superAdminSecretsConfigured = getSuperAdminEnvCredentials().configured;
  const adminSecretsConfigured = getSchoolAdminEnvCredentials().configured;
  const sessionSecretConfigured = isSessionSecretConfigured();
  return {
    mongodb: {
      name: "MongoDB Atlas",
      status: dbState2.status,
      detail: dbState2.error || (dbState2.status === "Connected" ? "Cluster connected" : "Set MONGODB_URI in Secrets")
    },
    sessionSecret: {
      name: "Session Signing Secret",
      status: sessionSecretConfigured ? "Connected" : "Not Configured",
      detail: sessionSecretConfigured ? "Configured via SESSION_SECRET" : "Recommended: Set SESSION_SECRET (32+ chars) in Secrets"
    },
    superAdminSecrets: {
      name: "Super Admin Credentials Secret",
      status: superAdminSecretsConfigured ? "Connected" : "Not Configured",
      detail: superAdminSecretsConfigured ? `Managed via SUPER_ADMIN_EMAIL (${getSuperAdminEnvCredentials().email})` : "Optional: Set SUPER_ADMIN_EMAIL & SUPER_ADMIN_PASSWORD in Secrets"
    },
    adminSecrets: {
      name: "School Admin Credentials Secret",
      status: adminSecretsConfigured ? "Connected" : "Not Configured",
      detail: adminSecretsConfigured ? `Managed via ADMIN_EMAIL (${getSchoolAdminEnvCredentials().email})` : "Optional: Set ADMIN_EMAIL & ADMIN_PASSWORD in Secrets"
    },
    googleOAuth: {
      name: "Google Sign-In (Schools)",
      status: googleOAuthConfigured ? "Connected" : "Not Configured",
      detail: googleOAuthConfigured ? "Google OAuth 2.0 active for school logins" : "Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in Secrets"
    },
    paystack: {
      name: "Paystack (Platform Billing)",
      status: paystackStatus,
      detail: paystackStatus === "Testing" ? "Test mode keys active" : paystackStatus === "Connected" ? "Live mode keys active" : "Set PAYSTACK_SECRET_KEY & PAYSTACK_PUBLIC_KEY"
    },
    email: {
      name: "Transactional Email (SMTP)",
      status: smtpConfigured ? "Connected" : "Not Configured",
      detail: smtpConfigured ? `Host: ${process.env.SMTP_HOST}` : "Set SMTP_HOST, SMTP_USER, SMTP_PASS"
    },
    sms: {
      name: "SMS Gateway (Ghana)",
      status: smsConfigured ? "Connected" : "Not Configured",
      detail: smsConfigured ? `Sender: ${process.env.SMS_SENDER_ID || "NexaSua"}` : "Set SMS_PROVIDER_URL & SMS_API_KEY"
    },
    gemini: {
      name: "Gemini AI (Optional Drafts)",
      status: geminiConfigured ? "Connected" : "Not Configured",
      detail: geminiConfigured ? "Optional draft & summary tools ready" : "Optional: Set GEMINI_API_KEY"
    }
  };
}

// server/services/securityService.ts
function hashPassword(password) {
  const salt = crypto2.randomBytes(16).toString("hex");
  const derived = crypto2.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}
function verifyPassword(password, storedHash) {
  const parts = storedHash.split(":");
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto2.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, "hex");
  if (derived.length !== keyBuf.length) return false;
  return crypto2.timingSafeEqual(derived, keyBuf);
}
function hashToken(token) {
  return crypto2.createHash("sha256").update(token).digest("hex");
}
function signSessionToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "12h" });
}
function verifySessionToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}
var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function generateTotpSecret(bytes = 20) {
  const buf = crypto2.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = value << 8 | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[value >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[value << 5 - bits & 31];
  }
  return output;
}
function base32Decode(secret) {
  const clean = secret.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = value << 5 | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push(value >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}
function generateTotpCode(secret, counterOffset = 0) {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1e3 / 30) + counterOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto2.createHmac("sha1", key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = (hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255;
  return String(code % 1e6).padStart(6, "0");
}
function verifyTotpCode(secret, token) {
  const clean = token.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    const expected = generateTotpCode(secret, offset);
    if (crypto2.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}
async function generateTotpQrDataUrl(email, secret) {
  const issuer = encodeURIComponent("NexaSua");
  const label = encodeURIComponent(`NexaSua:${email}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return QRCode.toDataURL(otpauth);
}
function signReportVerificationToken(reportRef, schoolId) {
  const payload = `${reportRef}:${schoolId}`;
  const sig = crypto2.createHmac("sha256", getJwtSecret()).update(payload).digest("hex").slice(0, 24);
  return `${reportRef}.${sig}`;
}
async function writeAuditLog(params) {
  try {
    await AuditLogModel.create({
      schoolId: params.schoolId || null,
      userId: params.userId || null,
      userEmail: params.userEmail || "",
      userRole: params.userRole || "",
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId || "",
      details: params.details || {},
      ipAddress: params.ipAddress || ""
    });
  } catch {
  }
}

// server/middleware/auth.ts
function getAccraTodayDateString(now = /* @__PURE__ */ new Date()) {
  return now.toISOString().slice(0, 10);
}
function checkPortalClosure(subscription, school, now = /* @__PURE__ */ new Date()) {
  const vacationDate = String(
    subscription?.termVacationDate || school?.termVacationDate || ""
  ).trim();
  const todayAccra = getAccraTodayDateString(now);
  if (subscription?.status === "SUSPENDED") {
    return {
      closed: true,
      reason: "Your school subscription is suspended. Please contact NexaFlow support.",
      code: "SUBSCRIPTION_SUSPENDED",
      vacationDate
    };
  }
  if (vacationDate && todayAccra >= vacationDate) {
    return {
      closed: true,
      reason: `Your school portal is closed automatically because the scheduled term vacation date (${vacationDate}) has been reached and the term subscription has ended.`,
      code: "PORTAL_CLOSED_SUBSCRIPTION_ENDED",
      vacationDate
    };
  }
  if (subscription?.status === "EXPIRED") {
    return {
      closed: true,
      reason: subscription.portalClosedReason || "Your school subscription term has ended and the portal is closed automatically.",
      code: "PORTAL_CLOSED_SUBSCRIPTION_ENDED",
      vacationDate
    };
  }
  if (subscription?.status === "ACTIVE" && subscription.currentPeriodEnd && now > new Date(subscription.currentPeriodEnd)) {
    return {
      closed: true,
      reason: "Your school subscription period has ended and the portal is closed automatically.",
      code: "PORTAL_CLOSED_SUBSCRIPTION_ENDED",
      vacationDate
    };
  }
  return { closed: false, reason: "", code: "", vacationDate };
}
function requireDb(req, res, next) {
  if (!isDbConnected()) {
    res.status(503).json({
      error: "MongoDB Atlas is not configured or connected yet. Configure MONGODB_URI in environment secrets.",
      code: "DB_NOT_CONFIGURED"
    });
    return;
  }
  next();
}
function setSessionCookie(res, token, maxAgeMs = 12 * 60 * 60 * 1e3) {
  res.cookie("nexasua_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    maxAge: maxAgeMs,
    path: "/"
  });
}
function clearSessionCookie(res) {
  res.clearCookie("nexasua_session", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
    path: "/"
  });
}
function passesCsrfCheck(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  if (req.headers["x-requested-with"] === "NexaSua") return true;
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}
async function authenticate(req, res, next) {
  if (!isDbConnected()) {
    res.status(503).json({
      error: "Database is not connected.",
      code: "DB_NOT_CONFIGURED"
    });
    return;
  }
  let token = "";
  let usedCookie = false;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.nexasua_session) {
    token = String(req.cookies.nexasua_session);
    usedCookie = true;
  }
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (usedCookie && !passesCsrfCheck(req)) {
    res.status(403).json({ error: "Invalid request origin or missing CSRF header." });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload || !mongoose3.isValidObjectId(payload.userId)) {
    res.status(401).json({ error: "Invalid or expired session." });
    return;
  }
  const user = await UserModel.findById(payload.userId).lean();
  if (!user || user.status !== "ACTIVE") {
    res.status(401).json({ error: "Account is inactive or not found." });
    return;
  }
  if (user.mfaEnabled && !payload.mfaVerified) {
    res.status(401).json({ error: "Multi-factor authentication verification required.", code: "MFA_REQUIRED" });
    return;
  }
  req.authUser = {
    _id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    mfaEnabled: Boolean(user.mfaEnabled),
    mfaVerified: Boolean(payload.mfaVerified),
    emailVerified: Boolean(user.emailVerified)
  };
  next();
}
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    if (req.authUser.role === "SUPER_ADMIN") {
      next();
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({ error: "You do not have permission to access this resource." });
      return;
    }
    next();
  };
}
async function requireSchoolContext(req, res, next) {
  if (!req.authUser) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (req.authUser.role === "SUPER_ADMIN") {
    const requestedId = String(
      req.headers["x-nexasua-school-id"] || req.query.schoolId || ""
    ).trim();
    if (!requestedId || !mongoose3.isValidObjectId(requestedId)) {
      res.status(400).json({
        error: "Select a school workspace from the Super Admin Dashboard first.",
        code: "SUPER_ADMIN_SCHOOL_CONTEXT_REQUIRED"
      });
      return;
    }
    const [school2, subscription2] = await Promise.all([
      SchoolModel.findById(requestedId),
      SubscriptionModel.findOne({ schoolId: requestedId })
    ]);
    if (!school2) {
      res.status(404).json({ error: "Selected school record was not found." });
      return;
    }
    req.authUser.schoolId = String(school2._id);
    req.schoolDoc = school2;
    if (subscription2) {
      req.subscriptionDoc = subscription2;
    }
    next();
    return;
  }
  if (!req.authUser.schoolId || !mongoose3.isValidObjectId(req.authUser.schoolId)) {
    res.status(403).json({ error: "No school tenant associated with this account." });
    return;
  }
  const [school, subscription] = await Promise.all([
    SchoolModel.findById(req.authUser.schoolId),
    SubscriptionModel.findOne({ schoolId: req.authUser.schoolId })
  ]);
  if (!school) {
    res.status(404).json({ error: "School record not found." });
    return;
  }
  if (school.status === "PENDING") {
    res.status(403).json({ error: "Your school application is awaiting Super Admin approval." });
    return;
  }
  if (school.status === "SUSPENDED" || school.status === "REJECTED") {
    res.status(403).json({
      error: `School account is currently ${school.status.toLowerCase()}. Contact NexaFlow support.`
    });
    return;
  }
  const closure = checkPortalClosure(subscription, school);
  if (closure.closed) {
    if (subscription && subscription.status !== "EXPIRED" && subscription.status !== "SUSPENDED") {
      subscription.status = "EXPIRED";
      subscription.portalClosedReason = closure.reason;
      await subscription.save();
    }
    const isSchoolAdminBillingRoute = req.authUser.role === "SCHOOL_ADMIN" && req.baseUrl === "/api/school" && req.path.startsWith("/subscription");
    if (!isSchoolAdminBillingRoute) {
      res.status(403).json({
        error: closure.reason,
        code: closure.code,
        vacationDate: closure.vacationDate
      });
      return;
    }
  }
  req.schoolDoc = school;
  if (subscription) {
    req.subscriptionDoc = subscription;
  }
  next();
}
function requireCompletePlan(req, res, next) {
  if (req.authUser?.role === "SUPER_ADMIN" || req.authUser?.role === "SCHOOL_ADMIN") {
    next();
    return;
  }
  const sub = req.subscriptionDoc;
  if (!sub || sub.plan !== "COMPLETE") {
    res.status(403).json({
      error: "This module requires the NexaSua Complete subscription plan.",
      code: "PLAN_UPGRADE_REQUIRED"
    });
    return;
  }
  next();
}
function requireActiveSubscriptionWrite(req, res, next) {
  if (req.authUser?.role === "SUPER_ADMIN") {
    next();
    return;
  }
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const sub = req.subscriptionDoc;
  if (!sub || ["EXPIRED", "SUSPENDED"].includes(sub.status)) {
    res.status(403).json({
      error: "School subscription is expired or suspended. Renew subscription to make changes (existing records remain preserved).",
      code: "SUBSCRIPTION_INACTIVE"
    });
    return;
  }
  next();
}

// server/middleware/validate.ts
import mongoose4 from "mongoose";
function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: result.error.issues[0]?.message || "Invalid request input.",
      issues: result.error.issues
    });
    return null;
  }
  return result.data;
}
function validObjectId(id) {
  if (!id || typeof id !== "string" || !mongoose4.isValidObjectId(id)) {
    return null;
  }
  return id;
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// server/services/aiAssistantService.ts
import { GoogleGenAI } from "@google/genai";
async function generateOptionalDraft(params) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "Optional Gemini AI integration is not configured." };
  }
  let prompt = "";
  if (params.task === "TEACHER_REMARK") {
    prompt = `Write one concise, constructive Ghanaian terminal report card remark (max 22 words) for an anonymized learner with overall average ${params.context.average}%, attendance ${params.context.attendancePercent}%, and grade band ${params.context.grade}. Return plain text only.`;
  } else if (params.task === "ANNOUNCEMENT_DRAFT") {
    prompt = `Draft a clear, respectful school announcement for Ghanaian parents/staff about: "${params.context.topic}". Keep it under 120 words, formal and warm. Return plain text only.`;
  } else {
    prompt = `Summarize aggregated anonymized class performance metrics for school leadership (pass rate ${params.context.passRate}%, mean score ${params.context.meanScore}%, total learners ${params.context.studentCount}). Suggest 3 practical instructional support actions. Plain text only.`;
  }
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt
    });
    return { ok: true, text: response.text?.trim() || "" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "AI draft request failed."
    };
  }
}

// server/services/csvExcelService.ts
import ExcelJS from "exceljs";
function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}
async function parseSpreadsheetBuffer(buffer, filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers2 = parseCsvLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = parseCsvLine(line);
      const row = {};
      headers2.forEach((h, idx) => {
        if (h) row[h] = (cells[idx] ?? "").trim();
      });
      return row;
    });
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) return [];
  const headers = [];
  sheet.getRow(1).eachCell((cell, colNum) => {
    headers[colNum] = String(cell.value ?? "").trim();
  });
  const rows = [];
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    let hasValue = false;
    headers.forEach((header, colNum) => {
      if (!header) return;
      const val = row.getCell(colNum).value;
      const str = val === null || val === void 0 ? "" : String(val).trim();
      if (str) hasValue = true;
      obj[header] = str;
    });
    if (hasValue) rows.push(obj);
  });
  return rows;
}
function generateCsvString(headers, rows) {
  const escape = (val) => {
    let str = String(val ?? "");
    if (typeof val !== "number" && /^[=+\-@\t\r]/.test(str) && !/^-\d+(\.\d+)?$/.test(str)) {
      str = `'${str}`;
    }
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((r) => r.map(escape).join(","))
  ].join("\n");
}

// server/services/gradingEngine.ts
var DEFAULT_30_70_TEMPLATE = {
  name: "Standard 30% CA / 70% Exam",
  passMark: 50,
  roundingMode: "ONE_DECIMAL",
  showClassPosition: true,
  missingMarkPolicy: "TREAT_AS_INCOMPLETE",
  categories: [
    {
      key: "class_work",
      label: "Class Exercises & Homework",
      type: "CLASS_EXERCISE",
      maxMarks: 15,
      weightPercent: 15,
      isExam: false
    },
    {
      key: "class_test",
      label: "Class Tests & Projects",
      type: "CLASS_TEST",
      maxMarks: 15,
      weightPercent: 15,
      isExam: false
    },
    {
      key: "end_term_exam",
      label: "End-of-Term Examination",
      type: "END_OF_TERM_EXAM",
      maxMarks: 100,
      weightPercent: 70,
      isExam: true
    }
  ],
  gradingScale: [
    { grade: "A1", minScore: 80, maxScore: 100, remark: "Excellent" },
    { grade: "B2", minScore: 70, maxScore: 79.99, remark: "Very Good" },
    { grade: "B3", minScore: 65, maxScore: 69.99, remark: "Good" },
    { grade: "C4", minScore: 60, maxScore: 64.99, remark: "Credit" },
    { grade: "C5", minScore: 55, maxScore: 59.99, remark: "Credit" },
    { grade: "C6", minScore: 50, maxScore: 54.99, remark: "Credit" },
    { grade: "D7", minScore: 45, maxScore: 49.99, remark: "Pass" },
    { grade: "E8", minScore: 40, maxScore: 44.99, remark: "Weak Pass" },
    { grade: "F9", minScore: 0, maxScore: 39.99, remark: "Fail" }
  ]
};
function applyRounding(value, mode) {
  if (mode === "NEAREST_INT") {
    return Math.round(value);
  }
  if (mode === "ONE_DECIMAL") {
    return Math.round((value + Number.EPSILON) * 10) / 10;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function lookupGrade(score, scale) {
  const sorted = [...scale].sort((a, b) => b.minScore - a.minScore);
  for (const rule of sorted) {
    if (score >= rule.minScore && score <= rule.maxScore) {
      return { grade: rule.grade, remark: rule.remark };
    }
  }
  for (const rule of sorted) {
    if (score >= rule.minScore) {
      return { grade: rule.grade, remark: rule.remark };
    }
  }
  const lowest = sorted[sorted.length - 1];
  return lowest ? { grade: lowest.grade, remark: lowest.remark } : { grade: "-", remark: "Unrated" };
}
function calculateStudentSubjectScore(params) {
  const errors = [];
  const normalizedCategories = {};
  const totalWeight = params.categories.reduce((sum, c) => sum + c.weightPercent, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    errors.push(`Assessment category weights must sum to 100% (currently ${totalWeight}%).`);
  }
  let hasMissingMarks = false;
  let caWeighted = 0;
  let examWeighted = 0;
  for (const cat of params.categories) {
    const raw = params.inputScores[cat.key];
    if (raw === null || raw === void 0 || typeof raw === "string" && raw === "") {
      hasMissingMarks = true;
      normalizedCategories[cat.key] = {
        rawScore: null,
        maxMarks: cat.maxMarks,
        isMissing: true
      };
      if (params.missingMarkPolicy === "TREAT_AS_ZERO") {
      }
      continue;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
      errors.push(`Invalid numeric score for ${cat.label}.`);
      continue;
    }
    if (numeric < 0) {
      errors.push(`${cat.label} score cannot be negative.`);
      continue;
    }
    if (numeric > cat.maxMarks) {
      errors.push(`${cat.label} score (${numeric}) exceeds maximum allowed marks (${cat.maxMarks}).`);
      continue;
    }
    normalizedCategories[cat.key] = {
      rawScore: numeric,
      maxMarks: cat.maxMarks,
      isMissing: false
    };
    const contribution = numeric / cat.maxMarks * cat.weightPercent;
    if (cat.isExam) {
      examWeighted += contribution;
    } else {
      caWeighted += contribution;
    }
  }
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      hasMissingMarks,
      caScore: null,
      examScore: null,
      finalScore: null,
      grade: "",
      remark: "",
      passed: false,
      normalizedCategories
    };
  }
  if (hasMissingMarks && params.missingMarkPolicy === "TREAT_AS_INCOMPLETE") {
    return {
      valid: true,
      errors: [],
      hasMissingMarks: true,
      caScore: applyRounding(caWeighted, params.roundingMode),
      examScore: applyRounding(examWeighted, params.roundingMode),
      finalScore: null,
      grade: "INC",
      remark: "Incomplete Marks",
      passed: false,
      normalizedCategories
    };
  }
  const caScore = applyRounding(caWeighted, params.roundingMode);
  const examScore = applyRounding(examWeighted, params.roundingMode);
  const finalScore = applyRounding(caWeighted + examWeighted, params.roundingMode);
  const { grade, remark } = lookupGrade(finalScore, params.gradingScale);
  return {
    valid: true,
    errors: [],
    hasMissingMarks,
    caScore,
    examScore,
    finalScore,
    grade,
    remark,
    passed: finalScore >= params.passMark,
    normalizedCategories
  };
}
function calculateClassRankings(entries) {
  const sorted = [...entries].sort((a, b) => b.averageScore - a.averageScore);
  const results = [];
  let currentRank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && Math.abs(sorted[i].averageScore - sorted[i - 1].averageScore) > 1e-4) {
      currentRank = i + 1;
    }
    results.push({
      studentId: sorted[i].studentId,
      averageScore: sorted[i].averageScore,
      position: currentRank
    });
  }
  return results;
}

// server/services/pdfService.ts
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import QRCode2 from "qrcode";
function dataUrlToBuffer(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith("data:image/")) return null;
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return null;
  try {
    return Buffer.from(dataUrl.slice(commaIdx + 1), "base64");
  } catch {
    return null;
  }
}
function getNexaSuaLogoBuffer() {
  const logoPath = path.resolve(
    process.cwd(),
    "public/assets/aistudio/NexaSua_Education_Emblem_9038771b.png"
  );
  if (fs.existsSync(logoPath)) {
    return fs.readFileSync(logoPath);
  }
  return null;
}
async function renderReportPage(doc, item) {
  const pageWidth = doc.page.width;
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const navy = "#102846";
  const teal = "#148D82";
  const slate = "#475569";
  const border = "#CBD5E1";
  doc.rect(margin, 36, contentWidth, 82).lineWidth(1).strokeColor(navy).stroke();
  const schoolLogoBuf = dataUrlToBuffer(item.schoolLogoDataUrl);
  if (schoolLogoBuf) {
    try {
      doc.image(schoolLogoBuf, margin + 12, 46, { fit: [60, 60] });
    } catch {
    }
  }
  const textStartX = schoolLogoBuf ? margin + 84 : margin + 16;
  const textWidth = schoolLogoBuf ? contentWidth - 100 : contentWidth - 32;
  doc.fillColor(navy).font("Helvetica-Bold").fontSize(15).text(item.schoolName.toUpperCase(), textStartX, 46, { width: textWidth, align: "center" });
  doc.fillColor(slate).font("Helvetica").fontSize(8.5).text(`${item.schoolAddress} | Tel: ${item.schoolPhone} | Email: ${item.schoolEmail}`, textStartX, 66, {
    width: textWidth,
    align: "center"
  });
  if (item.schoolMotto) {
    doc.fillColor(teal).font("Helvetica-Oblique").fontSize(8.5).text(`"${item.schoolMotto}"`, textStartX, 80, { width: textWidth, align: "center" });
  }
  doc.fillColor(navy).font("Helvetica-Bold").fontSize(10.5).text(
    `TERMINAL ACADEMIC REPORT CARD (${item.educationalLevel.toUpperCase()})`,
    textStartX,
    97,
    { width: textWidth, align: "center" }
  );
  let y = 130;
  doc.rect(margin, y, contentWidth, 64).lineWidth(0.75).strokeColor(border).stroke();
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(navy);
  const col1 = margin + 12;
  const col2 = margin + contentWidth * 0.52;
  doc.text("Student Name:", col1, y + 10);
  doc.font("Helvetica").text(item.studentName, col1 + 85, y + 10);
  doc.font("Helvetica-Bold").text("Admission No:", col1, y + 27);
  doc.font("Helvetica").text(item.admissionNumber, col1 + 85, y + 27);
  doc.font("Helvetica-Bold").text("Class:", col1, y + 44);
  doc.font("Helvetica").text(item.className, col1 + 85, y + 44);
  doc.font("Helvetica-Bold").text("Academic Year:", col2, y + 10);
  doc.font("Helvetica").text(item.academicYear, col2 + 85, y + 10);
  doc.font("Helvetica-Bold").text("Term:", col2, y + 27);
  doc.font("Helvetica").text(item.termName, col2 + 85, y + 27);
  doc.font("Helvetica-Bold").text("Report Ref:", col2, y + 44);
  doc.font("Helvetica").text(item.referenceNumber, col2 + 85, y + 44);
  y += 78;
  const colWidths = [185, 58, 58, 62, 48, contentWidth - 411];
  const headers = ["Subject", "CA", "Exam", "Total (%)", "Grade", "Remark"];
  doc.rect(margin, y, contentWidth, 24).fillColor(navy).fill();
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8.5);
  let cx = margin;
  headers.forEach((h, idx) => {
    doc.text(h, cx + 6, y + 8, {
      width: colWidths[idx] - 12,
      align: idx === 0 || idx === 5 ? "left" : "right"
    });
    cx += colWidths[idx];
  });
  y += 24;
  item.subjects.forEach((subj, rowIndex) => {
    if (y > 680) return;
    if (rowIndex % 2 === 1) {
      doc.rect(margin, y, contentWidth, 21).fillColor("#F8FAFC").fill();
    }
    doc.rect(margin, y, contentWidth, 21).lineWidth(0.5).strokeColor(border).stroke();
    const vals = [
      subj.subjectName,
      subj.caScore !== null ? subj.caScore.toFixed(1) : "-",
      subj.examScore !== null ? subj.examScore.toFixed(1) : "-",
      subj.finalScore !== null ? subj.finalScore.toFixed(1) : "INC",
      subj.grade || "-",
      subj.remark || "-"
    ];
    doc.fillColor("#0F172A").font("Helvetica").fontSize(8.5);
    let rx = margin;
    vals.forEach((v, idx) => {
      if (idx === 4) doc.font("Helvetica-Bold");
      else doc.font("Helvetica");
      doc.text(v, rx + 6, y + 6, {
        width: colWidths[idx] - 12,
        align: idx === 0 || idx === 5 ? "left" : "right",
        ellipsis: true
      });
      rx += colWidths[idx];
    });
    y += 21;
  });
  y += 12;
  doc.rect(margin, y, contentWidth, 34).lineWidth(0.75).strokeColor(navy).stroke();
  doc.fillColor(navy).font("Helvetica-Bold").fontSize(9);
  doc.text(`Overall Average: ${item.overallAverage.toFixed(1)}%`, margin + 12, y + 11);
  if (item.showClassPosition && item.classPosition !== null) {
    doc.text(
      `Class Position: ${item.classPosition} of ${item.totalStudentsInClass}`,
      margin + 180,
      y + 11
    );
  }
  doc.text(`Promotion Status: ${item.promotionStatus || "Pending Review"}`, margin + 335, y + 11);
  if (item.showAttendanceSummary) {
    y += 42;
    doc.rect(margin, y, contentWidth, 28).lineWidth(0.5).strokeColor(border).stroke();
    doc.fillColor(slate).font("Helvetica-Bold").fontSize(8.5);
    doc.text(
      `Attendance Summary \u2014 Total Days: ${item.attendanceSummary.totalDays}   |   Present: ${item.attendanceSummary.present}   |   Absent: ${item.attendanceSummary.absent}   |   Late: ${item.attendanceSummary.late}   |   Excused: ${item.attendanceSummary.excused}`,
      margin + 12,
      y + 9
    );
  }
  y += 38;
  doc.rect(margin, y, contentWidth, 72).lineWidth(0.5).strokeColor(border).stroke();
  doc.fillColor(navy).font("Helvetica-Bold").fontSize(8.5).text("Class Teacher Remarks:", margin + 12, y + 10);
  doc.fillColor("#0F172A").font("Helvetica").fontSize(8.5).text(item.classTeacherRemarks || "Satisfactory conduct and academic effort.", margin + 130, y + 10, {
    width: contentWidth - 144
  });
  doc.fillColor(navy).font("Helvetica-Bold").fontSize(8.5).text("Headteacher Remarks:", margin + 12, y + 34);
  doc.fillColor("#0F172A").font("Helvetica").fontSize(8.5).text(item.headteacherRemarks || "Approved for academic record.", margin + 130, y + 34, {
    width: contentWidth - 144
  });
  doc.fillColor(navy).font("Helvetica-Bold").fontSize(8.5).text("Next Term Reopens:", margin + 12, y + 54);
  doc.fillColor("#0F172A").font("Helvetica").text(item.reopeningDate || "To be announced", margin + 130, y + 54);
  y += 88;
  const sigY = y;
  doc.moveTo(margin + 12, sigY + 26).lineTo(margin + 175, sigY + 26).strokeColor(slate).stroke();
  doc.fillColor(slate).font("Helvetica").fontSize(8).text("Class Teacher Signature", margin + 12, sigY + 30);
  doc.moveTo(margin + 210, sigY + 26).lineTo(margin + 380, sigY + 26).strokeColor(slate).stroke();
  doc.fillColor(slate).font("Helvetica").fontSize(8).text(
    item.headteacherName ? `Headteacher (${item.headteacherName})` : "Headteacher Signature",
    margin + 210,
    sigY + 30
  );
  if (item.showQrVerification && item.verificationUrl) {
    try {
      const qrDataUrl = await QRCode2.toDataURL(item.verificationUrl, { margin: 1, width: 120 });
      const qrBuf = dataUrlToBuffer(qrDataUrl);
      if (qrBuf) {
        doc.image(qrBuf, margin + contentWidth - 68, sigY - 6, { width: 58, height: 58 });
        doc.fillColor(slate).fontSize(6.5).text("Scan to verify", margin + contentWidth - 72, sigY + 53, {
          width: 66,
          align: "center"
        });
      }
    } catch {
    }
  }
  const footerY = doc.page.height - 46;
  doc.moveTo(margin, footerY - 6).lineTo(margin + contentWidth, footerY - 6).lineWidth(0.5).strokeColor(border).stroke();
  const nexaLogo = getNexaSuaLogoBuffer();
  if (nexaLogo) {
    try {
      doc.image(nexaLogo, margin, footerY - 2, { fit: [26, 26] });
    } catch {
    }
  }
  doc.fillColor(slate).font("Helvetica").fontSize(7.5).text(
    `${item.footerNote || "Official Terminal Report."} | Issued: ${item.issueDate} | Powered by NexaSua (NexaFlow Technologies)`,
    margin + 34,
    footerY + 4,
    { width: contentWidth - 34 }
  );
}
async function generateReportCardPdfBuffer(items) {
  return new Promise(async (resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    for (let i = 0; i < items.length; i++) {
      if (i > 0) doc.addPage();
      await renderReportPage(doc, items[i]);
    }
    doc.end();
  });
}
async function generateReceiptPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const navy = "#102846";
    const teal = "#148D82";
    doc.fillColor(navy).font("Helvetica-Bold").fontSize(18).text(data.schoolName);
    doc.fillColor("#475569").font("Helvetica").fontSize(9.5).text(`${data.schoolAddress} | Tel: ${data.schoolPhone}`);
    doc.moveDown(1.2);
    doc.fillColor(teal).font("Helvetica-Bold").fontSize(14).text("OFFICIAL SCHOOL FEE RECEIPT");
    doc.moveDown(0.5);
    doc.rect(48, doc.y, 499, 195).lineWidth(1).strokeColor("#CBD5E1").stroke();
    const startY = doc.y + 14;
    const rows = [
      ["Receipt Number", data.receiptNumber],
      ["Payment Reference", data.paymentReference],
      ["Date Paid", data.paidAt],
      ["Student Name", data.studentName],
      ["Admission Number", data.admissionNumber],
      ["Class", data.className],
      ["Invoice Number", data.invoiceNumber],
      ["Payment Channel", data.channel],
      ["Amount Paid", `GH\u20B5 ${data.amountPaidGhs.toFixed(2)}`],
      ["Remaining Balance", `GH\u20B5 ${data.balanceRemainingGhs.toFixed(2)}`]
    ];
    rows.forEach(([label, val], idx) => {
      const ry = startY + idx * 17;
      doc.fillColor(navy).font("Helvetica-Bold").fontSize(9.5).text(label, 64, ry);
      doc.fillColor("#0F172A").font("Helvetica").fontSize(9.5).text(val, 220, ry);
    });
    const nexaLogo = getNexaSuaLogoBuffer();
    if (nexaLogo) {
      try {
        doc.image(nexaLogo, 48, 740, { fit: [24, 24] });
      } catch {
      }
    }
    doc.fillColor("#64748B").font("Helvetica").fontSize(8).text(
      "Verified financial record \xB7 Issued via NexaSua School Finance (NexaFlow Technologies)",
      80,
      748
    );
    doc.end();
  });
}
async function generateFinancialSummaryPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fillColor("#102846").font("Helvetica-Bold").fontSize(16).text(data.schoolName);
    doc.fillColor("#148D82").font("Helvetica-Bold").fontSize(12).text("SCHOOL FINANCIAL SUMMARY REPORT");
    doc.fillColor("#64748B").font("Helvetica").fontSize(8.5).text(`Generated: ${data.generatedAt}`);
    doc.moveDown(1);
    doc.fillColor("#102846").font("Helvetica-Bold").fontSize(10);
    doc.text(`Total Billed: GH\u20B5 ${data.totalBilledGhs.toFixed(2)}`);
    doc.text(`Total Collected: GH\u20B5 ${data.totalCollectedGhs.toFixed(2)}`);
    doc.text(`Outstanding Balance: GH\u20B5 ${data.outstandingGhs.toFixed(2)}`);
    doc.text(`Collection Rate: ${data.collectionRatePercent.toFixed(1)}%`);
    doc.moveDown(1);
    let y = doc.y;
    doc.rect(42, y, 511, 22).fillColor("#102846").fill();
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(8.5);
    doc.text("Invoice #", 48, y + 7);
    doc.text("Student", 140, y + 7);
    doc.text("Billed (GH\u20B5)", 300, y + 7, { width: 65, align: "right" });
    doc.text("Paid (GH\u20B5)", 372, y + 7, { width: 65, align: "right" });
    doc.text("Balance (GH\u20B5)", 442, y + 7, { width: 65, align: "right" });
    doc.text("Status", 512, y + 7);
    y += 22;
    data.invoices.slice(0, 30).forEach((inv) => {
      doc.rect(42, y, 511, 20).lineWidth(0.4).strokeColor("#CBD5E1").stroke();
      doc.fillColor("#0F172A").font("Helvetica").fontSize(8);
      doc.text(inv.invoiceNumber, 48, y + 6);
      doc.text(inv.studentName, 140, y + 6, { width: 155, ellipsis: true });
      doc.text(inv.totalGhs.toFixed(2), 300, y + 6, { width: 65, align: "right" });
      doc.text(inv.paidGhs.toFixed(2), 372, y + 6, { width: 65, align: "right" });
      doc.text(inv.balanceGhs.toFixed(2), 442, y + 6, { width: 65, align: "right" });
      doc.text(inv.status, 512, y + 6);
      y += 20;
    });
    doc.end();
  });
}

// server/routes/academicsRoutes.ts
var router = express.Router();
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});
router.use(requireDb, authenticate, requireSchoolContext, requireActiveSubscriptionWrite);
router.get("/configs", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  let configs = await AssessmentConfigModel.find({ schoolId }).sort({ isDefault: -1 }).lean();
  if (configs.length === 0) {
    const created = await AssessmentConfigModel.create({
      schoolId,
      ...DEFAULT_30_70_TEMPLATE,
      level: "All",
      isDefault: true
    });
    configs = [created.toObject()];
  }
  res.json({ configs });
});
var assessmentConfigSchema2 = z.object({
  name: z.string().min(3).max(100),
  level: z.enum(["Kindergarten", "Primary", "Junior High School", "Senior High School", "All"]).default("All"),
  isDefault: z.boolean().default(false),
  passMark: z.number().min(0).max(100).default(50),
  roundingMode: z.enum(["NEAREST_INT", "ONE_DECIMAL", "TWO_DECIMAL"]).default("ONE_DECIMAL"),
  showClassPosition: z.boolean().default(true),
  missingMarkPolicy: z.enum(["TREAT_AS_INCOMPLETE", "TREAT_AS_ZERO"]).default("TREAT_AS_INCOMPLETE"),
  categories: z.array(
    z.object({
      key: z.string().min(2).max(40),
      label: z.string().min(2).max(80),
      type: z.enum([
        "CLASS_EXERCISE",
        "QUIZ",
        "ASSIGNMENT",
        "PROJECT",
        "CLASS_TEST",
        "PRACTICAL",
        "CONTINUOUS_ASSESSMENT",
        "END_OF_TERM_EXAM"
      ]),
      maxMarks: z.number().min(1).max(500),
      weightPercent: z.number().min(0).max(100),
      isExam: z.boolean()
    })
  ).min(1),
  gradingScale: z.array(
    z.object({
      grade: z.string().min(1).max(10),
      minScore: z.number().min(0).max(100),
      maxScore: z.number().min(0).max(100),
      remark: z.string().min(1).max(40)
    })
  ).min(1)
});
router.post(
  "/configs",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(assessmentConfigSchema2, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const totalWeight = body.categories.reduce((sum, c) => sum + c.weightPercent, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      res.status(400).json({ error: `Category weights must sum to 100% (currently ${totalWeight}%).` });
      return;
    }
    if (body.isDefault) {
      await AssessmentConfigModel.updateMany({ schoolId }, { isDefault: false });
    }
    const config = await AssessmentConfigModel.create({ schoolId, ...body });
    await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.gradingConfigured": true });
    res.status(201).json({ config });
  }
);
async function verifyTeacherAccess(req, classId, subjectId, academicYearId) {
  const role = req.authUser.role;
  if (role === "SUPER_ADMIN" || role === "SCHOOL_ADMIN" || role === "HEADTEACHER") return true;
  if (role !== "CLASS_TEACHER" && role !== "SUBJECT_TEACHER") return false;
  const assigned = await TeacherAssignmentModel.exists({
    schoolId: req.authUser.schoolId,
    teacherId: req.authUser._id,
    classId,
    subjectId,
    academicYearId
  });
  return Boolean(assigned);
}
router.get(
  "/scores",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const academicYearId = validObjectId(String(req.query.academicYearId || ""));
    const termId = validObjectId(String(req.query.termId || ""));
    const classId = validObjectId(String(req.query.classId || ""));
    const subjectId = validObjectId(String(req.query.subjectId || ""));
    if (!academicYearId || !termId || !classId || !subjectId) {
      res.status(400).json({ error: "academicYearId, termId, classId, and subjectId are required." });
      return;
    }
    const allowed = await verifyTeacherAccess(req, classId, subjectId, academicYearId);
    if (!allowed) {
      res.status(403).json({ error: "You are not assigned to this class and subject." });
      return;
    }
    const [students, scores] = await Promise.all([
      StudentModel.find({ schoolId, currentClassId: classId, status: "ACTIVE" }).sort({ fullName: 1 }).lean(),
      AssessmentScoreModel.find({
        schoolId,
        academicYearId,
        termId,
        classId,
        subjectId
      }).lean()
    ]);
    const scoreMap = new Map(scores.map((s) => [String(s.studentId), s]));
    res.json({
      rows: students.map((st) => ({
        student: st,
        scoreRecord: scoreMap.get(String(st._id)) || null
      }))
    });
  }
);
var saveScoresSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  subjectId: z.string().min(12),
  assessmentConfigId: z.string().min(12),
  submitForReview: z.boolean().default(false),
  correctionReason: z.string().max(300).optional(),
  entries: z.array(
    z.object({
      studentId: z.string().min(12),
      scores: z.record(z.string(), z.number().nullable().optional())
    })
  ).min(1)
});
router.post(
  "/scores",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  async (req, res) => {
    const body = parseBody(saveScoresSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);
    const subjectId = validObjectId(body.subjectId);
    const configId = validObjectId(body.assessmentConfigId);
    if (!academicYearId || !termId || !classId || !subjectId || !configId) {
      res.status(400).json({ error: "Invalid academic reference IDs." });
      return;
    }
    const allowed = await verifyTeacherAccess(req, classId, subjectId, academicYearId);
    if (!allowed) {
      res.status(403).json({ error: "You are not assigned to enter scores for this class/subject." });
      return;
    }
    const config = await AssessmentConfigModel.findOne({ _id: configId, schoolId }).lean();
    if (!config) {
      res.status(404).json({ error: "Assessment configuration not found." });
      return;
    }
    const validationErrors = [];
    const results = [];
    for (const entry of body.entries) {
      const studentId = validObjectId(entry.studentId);
      if (!studentId) continue;
      const studentExists = await StudentModel.exists({ _id: studentId, schoolId });
      if (!studentExists) continue;
      const existing = await AssessmentScoreModel.findOne({
        schoolId,
        academicYearId,
        termId,
        classId,
        subjectId,
        studentId
      });
      if (existing && existing.status === "PUBLISHED") {
        const isHead = req.authUser.role === "SUPER_ADMIN" || req.authUser.role === "SCHOOL_ADMIN" || req.authUser.role === "HEADTEACHER";
        if (!isHead || !body.correctionReason?.trim()) {
          validationErrors.push(
            "Published scores are locked. Headteacher/Admin approval and a correction reason are required."
          );
          continue;
        }
      }
      const calc = calculateStudentSubjectScore({
        categories: config.categories,
        gradingScale: config.gradingScale,
        passMark: config.passMark,
        roundingMode: config.roundingMode,
        missingMarkPolicy: config.missingMarkPolicy,
        inputScores: entry.scores
      });
      if (!calc.valid) {
        validationErrors.push(...calc.errors);
        continue;
      }
      const nextStatus = existing?.status === "PUBLISHED" ? "PUBLISHED" : body.submitForReview ? "SUBMITTED" : "DRAFT";
      const doc = await AssessmentScoreModel.findOneAndUpdate(
        { schoolId, academicYearId, termId, classId, subjectId, studentId },
        {
          teacherId: req.authUser._id,
          assessmentConfigId: config._id,
          categoryScores: calc.normalizedCategories,
          caScore: calc.caScore,
          examScore: calc.examScore,
          finalScore: calc.finalScore,
          grade: calc.grade,
          remark: calc.remark,
          hasMissingMarks: calc.hasMissingMarks,
          status: nextStatus,
          submittedAt: body.submitForReview ? /* @__PURE__ */ new Date() : existing?.submittedAt || null,
          correctionReason: body.correctionReason || existing?.correctionReason || "",
          lastModifiedBy: req.authUser._id
        },
        { upsert: true, new: true }
      );
      if (existing?.status === "PUBLISHED") {
        await writeAuditLog({
          schoolId,
          userId: req.authUser._id,
          userEmail: req.authUser.email,
          userRole: req.authUser.role,
          action: "PUBLISHED_GRADE_CORRECTED",
          resourceType: "AssessmentScore",
          resourceId: String(doc._id),
          details: {
            reason: body.correctionReason,
            previousFinal: existing.finalScore,
            newFinal: calc.finalScore
          },
          ipAddress: req.ip
        });
      }
      results.push(doc);
    }
    if (validationErrors.length > 0 && results.length === 0) {
      res.status(400).json({ error: validationErrors[0], errors: validationErrors });
      return;
    }
    res.json({
      savedCount: results.length,
      errors: validationErrors,
      scores: results
    });
  }
);
router.post(
  "/scores/import",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  upload.single("file"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    if (!req.file) {
      res.status(400).json({ error: "Upload a CSV or Excel (.xlsx) marks file." });
      return;
    }
    const academicYearId = validObjectId(String(req.body?.academicYearId || ""));
    const termId = validObjectId(String(req.body?.termId || ""));
    const classId = validObjectId(String(req.body?.classId || ""));
    const subjectId = validObjectId(String(req.body?.subjectId || ""));
    const configId = validObjectId(String(req.body?.assessmentConfigId || ""));
    if (!academicYearId || !termId || !classId || !subjectId || !configId) {
      res.status(400).json({ error: "Academic year, term, class, subject, and config IDs required." });
      return;
    }
    const allowed = await verifyTeacherAccess(req, classId, subjectId, academicYearId);
    if (!allowed) {
      res.status(403).json({ error: "Not assigned to this class/subject." });
      return;
    }
    const [config, students] = await Promise.all([
      AssessmentConfigModel.findOne({ _id: configId, schoolId }).lean(),
      StudentModel.find({ schoolId, currentClassId: classId, status: "ACTIVE" }).lean()
    ]);
    if (!config) {
      res.status(404).json({ error: "Assessment config not found." });
      return;
    }
    const studentByAdm = new Map(students.map((s) => [s.admissionNumber.toUpperCase(), s]));
    const rows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    let saved = 0;
    const errors = [];
    for (const row of rows) {
      const adm = (row.admissionNumber || row["Admission Number"] || "").toUpperCase().trim();
      const student = studentByAdm.get(adm);
      if (!student) {
        errors.push(`Student not found in class: ${adm || "blank row"}`);
        continue;
      }
      const inputScores = {};
      for (const cat of config.categories) {
        const raw = row[cat.key] ?? row[cat.label] ?? "";
        inputScores[cat.key] = raw === "" ? null : Number(raw);
      }
      const calc = calculateStudentSubjectScore({
        categories: config.categories,
        gradingScale: config.gradingScale,
        passMark: config.passMark,
        roundingMode: config.roundingMode,
        missingMarkPolicy: config.missingMarkPolicy,
        inputScores
      });
      if (!calc.valid) {
        errors.push(`${adm}: ${calc.errors.join("; ")}`);
        continue;
      }
      const existing = await AssessmentScoreModel.findOne({
        schoolId,
        academicYearId,
        termId,
        classId,
        subjectId,
        studentId: student._id
      }).select("status");
      if (existing?.status === "PUBLISHED") {
        errors.push(`${adm}: Published scores are locked and cannot be overwritten by bulk import.`);
        continue;
      }
      await AssessmentScoreModel.findOneAndUpdate(
        { schoolId, academicYearId, termId, classId, subjectId, studentId: student._id },
        {
          teacherId: req.authUser._id,
          assessmentConfigId: config._id,
          categoryScores: calc.normalizedCategories,
          caScore: calc.caScore,
          examScore: calc.examScore,
          finalScore: calc.finalScore,
          grade: calc.grade,
          remark: calc.remark,
          hasMissingMarks: calc.hasMissingMarks,
          status: "DRAFT",
          lastModifiedBy: req.authUser._id
        },
        { upsert: true, new: true }
      );
      saved++;
    }
    res.json({ imported: saved, errors: errors.slice(0, 15) });
  }
);
router.get(
  "/review-summary",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const academicYearId = validObjectId(String(req.query.academicYearId || ""));
    const termId = validObjectId(String(req.query.termId || ""));
    if (!academicYearId || !termId) {
      res.status(400).json({ error: "academicYearId and termId are required." });
      return;
    }
    const classFilter = { schoolId };
    if (req.authUser.role === "CLASS_TEACHER") {
      classFilter.classTeacherId = req.authUser._id;
    }
    const classes = await ClassRoomModel.find(classFilter).lean();
    const classIds = classes.map((c) => c._id);
    const [assignments, scores, studentCounts] = await Promise.all([
      TeacherAssignmentModel.find({ schoolId, academicYearId, classId: { $in: classIds } }).populate("subjectId", "name code").populate("teacherId", "fullName").lean(),
      AssessmentScoreModel.find({
        schoolId,
        academicYearId,
        termId,
        classId: { $in: classIds }
      }).lean(),
      StudentModel.aggregate([
        {
          $match: {
            schoolId: new mongoose5.Types.ObjectId(schoolId),
            currentClassId: { $in: classIds },
            status: "ACTIVE"
          }
        },
        { $group: { _id: "$currentClassId", count: { $sum: 1 } } }
      ])
    ]);
    const countMap = new Map(studentCounts.map((c) => [String(c._id), c.count]));
    const summary = classes.map((cls) => {
      const clsAssignments = assignments.filter((a) => String(a.classId) === String(cls._id));
      const clsScores = scores.filter((s) => String(s.classId) === String(cls._id));
      const expectedStudents = countMap.get(String(cls._id)) || 0;
      const subjects = clsAssignments.map((a) => {
        const subjId = String(a.subjectId?._id || a.subjectId);
        const subjScores = clsScores.filter((s) => String(s.subjectId) === subjId);
        const missingCount = Math.max(0, expectedStudents - subjScores.length) + subjScores.filter((s) => s.hasMissingMarks).length;
        const statusCounts = {
          DRAFT: subjScores.filter((s) => s.status === "DRAFT").length,
          SUBMITTED: subjScores.filter((s) => s.status === "SUBMITTED").length,
          REVIEWED: subjScores.filter((s) => s.status === "REVIEWED").length,
          APPROVED: subjScores.filter((s) => s.status === "APPROVED").length,
          PUBLISHED: subjScores.filter((s) => s.status === "PUBLISHED").length
        };
        return {
          subjectId: subjId,
          subjectName: a.subjectId?.name || "Subject",
          teacherName: a.teacherId?.fullName || "Teacher",
          expectedStudents,
          enteredCount: subjScores.length,
          missingCount,
          statusCounts
        };
      });
      return {
        classId: cls._id,
        className: cls.name,
        level: cls.level,
        expectedStudents,
        subjects
      };
    });
    res.json({ summary });
  }
);
var workflowSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  subjectId: z.string().optional(),
  action: z.enum(["REVIEW", "APPROVE", "PUBLISH", "RETURN_TO_DRAFT"])
});
router.post(
  "/workflow",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER"),
  async (req, res) => {
    const body = parseBody(workflowSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);
    if (!academicYearId || !termId || !classId) {
      res.status(400).json({ error: "Invalid academicYearId, termId, or classId." });
      return;
    }
    if ((body.action === "APPROVE" || body.action === "PUBLISH") && req.authUser.role === "CLASS_TEACHER") {
      res.status(403).json({
        error: "Only Headteachers or School Administrators can approve and publish final results."
      });
      return;
    }
    if (req.authUser.role === "CLASS_TEACHER") {
      const isClassTeacher = await ClassRoomModel.exists({
        _id: classId,
        schoolId,
        classTeacherId: req.authUser._id
      });
      if (!isClassTeacher) {
        res.status(403).json({ error: "You are not the assigned class teacher for this class." });
        return;
      }
    }
    const filter = { schoolId, academicYearId, termId, classId };
    if (body.subjectId) {
      const sid = validObjectId(body.subjectId);
      if (sid) filter.subjectId = sid;
    }
    let update = {};
    if (body.action === "REVIEW") {
      filter.status = { $in: ["SUBMITTED", "DRAFT"] };
      update = { status: "REVIEWED", reviewedBy: req.authUser._id, reviewedAt: /* @__PURE__ */ new Date() };
    } else if (body.action === "APPROVE") {
      filter.status = { $in: ["SUBMITTED", "REVIEWED"] };
      update = { status: "APPROVED", approvedBy: req.authUser._id, approvedAt: /* @__PURE__ */ new Date() };
    } else if (body.action === "PUBLISH") {
      filter.status = { $in: ["APPROVED", "REVIEWED", "SUBMITTED"] };
      update = {
        status: "PUBLISHED",
        approvedBy: req.authUser._id,
        approvedAt: /* @__PURE__ */ new Date(),
        publishedAt: /* @__PURE__ */ new Date()
      };
    } else if (body.action === "RETURN_TO_DRAFT") {
      filter.status = { $in: ["SUBMITTED", "REVIEWED", "APPROVED"] };
      update = { status: "DRAFT" };
    }
    const result = await AssessmentScoreModel.updateMany(filter, { $set: update });
    await writeAuditLog({
      schoolId,
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: `RESULTS_${body.action}`,
      resourceType: "AssessmentScore",
      resourceId: `${classId}:${termId}`,
      details: { modifiedCount: result.modifiedCount, subjectId: body.subjectId || "ALL" },
      ipAddress: req.ip
    });
    res.json({ modifiedCount: result.modifiedCount, action: body.action });
  }
);
var generateReportsSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  promotionStatus: z.string().max(80).optional(),
  defaultClassTeacherRemarks: z.string().max(300).optional(),
  defaultHeadteacherRemarks: z.string().max(300).optional()
});
router.post(
  "/report-cards/generate",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER"),
  async (req, res) => {
    const body = parseBody(generateReportsSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);
    if (!academicYearId || !termId || !classId) {
      res.status(400).json({ error: "Invalid IDs." });
      return;
    }
    const [students, publishedScores, term, attendanceRecords] = await Promise.all([
      StudentModel.find({ schoolId, currentClassId: classId, status: "ACTIVE" }).lean(),
      AssessmentScoreModel.find({
        schoolId,
        academicYearId,
        termId,
        classId,
        status: "PUBLISHED"
      }).lean(),
      TermModel.findOne({ _id: termId, schoolId }).lean(),
      AttendanceModel.find({ schoolId, academicYearId, termId, classId }).lean()
    ]);
    if (students.length === 0) {
      res.status(400).json({ error: "No active students found in this class." });
      return;
    }
    if (publishedScores.length === 0) {
      res.status(400).json({
        error: "No published examination results found for this class and term. Approve and publish results first."
      });
      return;
    }
    const studentAverages = students.map((st) => {
      const stScores = publishedScores.filter(
        (sc) => String(sc.studentId) === String(st._id) && sc.finalScore !== null
      );
      const avg = stScores.length > 0 ? stScores.reduce((sum, s) => sum + (s.finalScore || 0), 0) / stScores.length : 0;
      return { studentId: String(st._id), averageScore: Math.round(avg * 10) / 10 };
    });
    const rankings = calculateClassRankings(studentAverages);
    const rankMap = new Map(rankings.map((r) => [r.studentId, r]));
    const generated = [];
    for (const st of students) {
      const stId = String(st._id);
      const rankInfo = rankMap.get(stId);
      const stAtt = attendanceRecords.filter((a) => String(a.studentId) === stId);
      const existing = await ReportCardModel.findOne({
        schoolId,
        studentId: st._id,
        academicYearId,
        termId
      });
      const ref = existing?.referenceNumber || `RC-${req.schoolDoc.schoolCode}-${crypto3.randomInt(1e5, 999999)}`;
      const verificationToken = existing?.verificationToken || signReportVerificationToken(ref, schoolId);
      const doc = await ReportCardModel.findOneAndUpdate(
        { schoolId, studentId: st._id, academicYearId, termId },
        {
          classId,
          referenceNumber: ref,
          verificationToken,
          overallAverage: rankInfo?.averageScore ?? 0,
          classPosition: rankInfo?.position ?? null,
          totalStudentsInClass: students.length,
          attendanceSummary: {
            present: stAtt.filter((a) => a.status === "PRESENT").length,
            absent: stAtt.filter((a) => a.status === "ABSENT").length,
            late: stAtt.filter((a) => a.status === "LATE").length,
            excused: stAtt.filter((a) => a.status === "EXCUSED").length,
            totalDays: stAtt.length
          },
          classTeacherRemarks: body.defaultClassTeacherRemarks || existing?.classTeacherRemarks || "Consistent classroom participation and effort.",
          headteacherRemarks: body.defaultHeadteacherRemarks || existing?.headteacherRemarks || "Keep up the good academic focus.",
          promotionStatus: body.promotionStatus || existing?.promotionStatus || "In Progress",
          reopeningDate: term?.reopeningDate || req.schoolDoc.reportCardSettings?.nextTermReopeningDate || "",
          issuedAt: /* @__PURE__ */ new Date(),
          issuedBy: req.authUser._id
        },
        { upsert: true, new: true }
      );
      generated.push(doc);
    }
    res.json({ generatedCount: generated.length, reportCards: generated });
  }
);
router.get("/report-cards", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const role = req.authUser.role;
  const query = { schoolId };
  if (req.query.academicYearId && validObjectId(String(req.query.academicYearId))) {
    query.academicYearId = req.query.academicYearId;
  }
  if (req.query.termId && validObjectId(String(req.query.termId))) {
    query.termId = req.query.termId;
  }
  if (req.query.classId && validObjectId(String(req.query.classId))) {
    query.classId = req.query.classId;
  }
  if (role === "STUDENT") {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser._id });
    if (!student) {
      res.json({ reportCards: [] });
      return;
    }
    query.studentId = student._id;
  } else if (role === "PARENT") {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser._id,
      verified: true
    }).select("studentId");
    query.studentId = { $in: links.map((l) => l.studentId) };
  }
  const reportCards = await ReportCardModel.find(query).populate("studentId", "fullName admissionNumber").populate("classId", "name level").populate("academicYearId", "name").populate("termId", "name").sort({ issuedAt: -1 }).lean();
  res.json({ reportCards });
});
async function buildReportCardPdfItem(report, school, baseUrl) {
  const [student, cls, year, term, scores] = await Promise.all([
    StudentModel.findById(report.studentId).lean(),
    ClassRoomModel.findById(report.classId).lean(),
    AcademicYearModel.findById(report.academicYearId).lean(),
    TermModel.findById(report.termId).lean(),
    AssessmentScoreModel.find({
      schoolId: school._id,
      studentId: report.studentId,
      academicYearId: report.academicYearId,
      termId: report.termId,
      status: "PUBLISHED"
    }).populate("subjectId", "name").lean()
  ]);
  return {
    schoolName: school.name,
    schoolAddress: `${school.address}, ${school.town}, ${school.region}`,
    schoolPhone: school.phone,
    schoolEmail: school.email,
    schoolMotto: school.motto,
    schoolLogoDataUrl: school.logoDataUrl,
    studentName: student?.fullName || "Student",
    admissionNumber: student?.admissionNumber || "",
    className: cls?.name || "",
    educationalLevel: cls?.level || "Basic/Secondary",
    academicYear: year?.name || "",
    termName: term?.name || "",
    referenceNumber: report.referenceNumber,
    verificationUrl: `${baseUrl}/verify-report?token=${encodeURIComponent(report.verificationToken)}`,
    issueDate: new Date(report.issuedAt).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }),
    reopeningDate: report.reopeningDate || school.reportCardSettings?.nextTermReopeningDate || "",
    overallAverage: report.overallAverage,
    classPosition: report.classPosition,
    totalStudentsInClass: report.totalStudentsInClass,
    showClassPosition: Boolean(school.reportCardSettings?.showClassPosition ?? true),
    showAttendanceSummary: Boolean(school.reportCardSettings?.showAttendanceSummary ?? true),
    showQrVerification: Boolean(school.reportCardSettings?.showQrVerification ?? true),
    attendanceSummary: report.attendanceSummary || {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      totalDays: 0
    },
    subjects: scores.map((sc) => ({
      subjectName: sc.subjectId?.name || "Subject",
      caScore: sc.caScore,
      examScore: sc.examScore,
      finalScore: sc.finalScore,
      grade: sc.grade,
      remark: sc.remark
    })),
    classTeacherRemarks: report.classTeacherRemarks || "",
    headteacherRemarks: report.headteacherRemarks || "",
    headteacherName: school.reportCardSettings?.headteacherName || "",
    promotionStatus: report.promotionStatus || "",
    footerNote: school.reportCardSettings?.footerNote || ""
  };
}
router.get("/report-cards/bulk/pdf", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  if (!["SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER"].includes(req.authUser.role)) {
    res.status(403).json({ error: "Not authorized for bulk report card PDF generation." });
    return;
  }
  const classId = validObjectId(String(req.query.classId || ""));
  const academicYearId = validObjectId(String(req.query.academicYearId || ""));
  const termId = validObjectId(String(req.query.termId || ""));
  if (!classId || !academicYearId || !termId) {
    res.status(400).json({ error: "classId, academicYearId, and termId are required." });
    return;
  }
  const reports = await ReportCardModel.find({
    schoolId,
    classId,
    academicYearId,
    termId
  }).lean();
  if (reports.length === 0) {
    res.status(404).json({ error: "No report cards generated for this class and term." });
    return;
  }
  const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
  const items = await Promise.all(
    reports.map((r) => buildReportCardPdfItem(r, req.schoolDoc, baseUrl))
  );
  const pdf = await generateReportCardPdfBuffer(items);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'attachment; filename="nexasua-class-report-cards.pdf"');
  res.send(pdf);
});
router.get("/report-cards/:id/pdf", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid report card ID." });
    return;
  }
  const report = await ReportCardModel.findOne({ _id: id, schoolId }).lean();
  if (!report) {
    res.status(404).json({ error: "Report card not found." });
    return;
  }
  if (req.authUser.role === "STUDENT") {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser._id });
    if (!student || String(student._id) !== String(report.studentId)) {
      res.status(403).json({ error: "You may only download your own report card." });
      return;
    }
  } else if (req.authUser.role === "PARENT") {
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser._id,
      studentId: report.studentId,
      verified: true
    });
    if (!verified) {
      res.status(403).json({ error: "Verified guardian relationship required." });
      return;
    }
  }
  const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
  const item = await buildReportCardPdfItem(report, req.schoolDoc, baseUrl);
  const pdf = await generateReportCardPdfBuffer([item]);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${report.referenceNumber}.pdf"`
  );
  res.send(pdf);
});
router.get("/published-results", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  let studentId = "";
  if (req.authUser.role === "STUDENT") {
    const st = await StudentModel.findOne({ schoolId, userId: req.authUser._id });
    if (!st) {
      res.json({ results: [] });
      return;
    }
    studentId = String(st._id);
  } else if (req.authUser.role === "PARENT") {
    const requested = validObjectId(String(req.query.studentId || ""));
    if (!requested) {
      res.status(400).json({ error: "studentId is required." });
      return;
    }
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser._id,
      studentId: requested,
      verified: true
    });
    if (!verified) {
      res.status(403).json({ error: "Access denied: guardian link is not verified." });
      return;
    }
    studentId = requested;
  } else {
    res.status(403).json({ error: "Use class marks endpoints for staff views." });
    return;
  }
  const results = await AssessmentScoreModel.find({
    schoolId,
    studentId,
    status: "PUBLISHED"
  }).populate("subjectId", "name code").populate("academicYearId", "name").populate("termId", "name").populate("classId", "name").sort({ createdAt: -1 }).lean();
  res.json({ results });
});
router.get(
  "/analytics",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const query = { schoolId, status: "PUBLISHED" };
    if (req.query.academicYearId && validObjectId(String(req.query.academicYearId))) {
      query.academicYearId = req.query.academicYearId;
    }
    if (req.query.termId && validObjectId(String(req.query.termId))) {
      query.termId = req.query.termId;
    }
    const scores = await AssessmentScoreModel.find(query).populate("classId", "name").populate("subjectId", "name").populate("studentId", "fullName admissionNumber").lean();
    if (scores.length === 0) {
      res.json({
        hasData: false,
        overallMean: 0,
        passRate: 0,
        totalEvaluated: 0,
        gradeDistribution: [],
        byClass: [],
        bySubject: [],
        studentsNeedingSupport: []
      });
      return;
    }
    const validScores = scores.filter((s) => s.finalScore !== null);
    const overallMean = validScores.length > 0 ? Math.round(
      validScores.reduce((sum, s) => sum + (s.finalScore || 0), 0) / validScores.length * 10
    ) / 10 : 0;
    const passCount = validScores.filter((s) => (s.finalScore || 0) >= 50).length;
    const passRate = validScores.length > 0 ? Math.round(passCount / validScores.length * 1e3) / 10 : 0;
    const gradeMap = /* @__PURE__ */ new Map();
    const classMap = /* @__PURE__ */ new Map();
    const subjectMap = /* @__PURE__ */ new Map();
    const studentMap = /* @__PURE__ */ new Map();
    for (const s of validScores) {
      gradeMap.set(s.grade, (gradeMap.get(s.grade) || 0) + 1);
      const cls = s.classId;
      if (cls?._id) {
        const key = String(cls._id);
        const cur = classMap.get(key) || { name: cls.name || "Class", total: 0, count: 0 };
        cur.total += s.finalScore || 0;
        cur.count += 1;
        classMap.set(key, cur);
      }
      const subj = s.subjectId;
      if (subj?._id) {
        const key = String(subj._id);
        const cur = subjectMap.get(key) || { name: subj.name || "Subject", total: 0, count: 0 };
        cur.total += s.finalScore || 0;
        cur.count += 1;
        subjectMap.set(key, cur);
      }
      const st = s.studentId;
      if (st?._id) {
        const key = String(st._id);
        const cur = studentMap.get(key) || {
          fullName: st.fullName || "Student",
          admissionNumber: st.admissionNumber || "",
          total: 0,
          count: 0
        };
        cur.total += s.finalScore || 0;
        cur.count += 1;
        studentMap.set(key, cur);
      }
    }
    const studentsNeedingSupport = Array.from(studentMap.values()).map((st) => ({
      fullName: st.fullName,
      admissionNumber: st.admissionNumber,
      average: Math.round(st.total / st.count * 10) / 10,
      subjectsCount: st.count
    })).filter((st) => st.average < 50).sort((a, b) => a.average - b.average).slice(0, 20);
    res.json({
      hasData: true,
      overallMean,
      passRate,
      totalEvaluated: validScores.length,
      gradeDistribution: Array.from(gradeMap.entries()).map(([grade, count]) => ({
        grade,
        count
      })),
      byClass: Array.from(classMap.values()).map((c) => ({
        name: c.name,
        average: Math.round(c.total / c.count * 10) / 10,
        count: c.count
      })),
      bySubject: Array.from(subjectMap.values()).map((s) => ({
        name: s.name,
        average: Math.round(s.total / s.count * 10) / 10,
        count: s.count
      })),
      studentsNeedingSupport
    });
  }
);
router.post(
  "/ai-draft",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  async (req, res) => {
    const schema = z.object({
      task: z.enum(["TEACHER_REMARK", "ANNOUNCEMENT_DRAFT", "ACADEMIC_SUMMARY"]),
      context: z.record(z.string(), z.union([z.string(), z.number()]))
    });
    const body = parseBody(schema, req, res);
    if (!body) return;
    const result = await generateOptionalDraft(body);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ draft: result.text });
  }
);
var academicsRoutes_default = router;

// server/routes/authRoutes.ts
import crypto4 from "crypto";
import express2 from "express";
import rateLimit from "express-rate-limit";
import jwt2 from "jsonwebtoken";
import { z as z2 } from "zod";

// server/services/messagingService.ts
import nodemailer from "nodemailer";
async function sendTransactionalEmail(params) {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || "587");
  const from = process.env.SMTP_FROM?.trim() || user || "no-reply@nexasua.com";
  if (!host || !user || !pass) {
    return { status: "NOT_CONFIGURED", error: "SMTP credentials are not configured." };
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html
    });
    return { status: "SENT" };
  } catch (err) {
    return {
      status: "FAILED",
      error: err instanceof Error ? err.message : "SMTP delivery failed"
    };
  }
}
async function sendSmsMessage(params) {
  const url = process.env.SMS_PROVIDER_URL?.trim();
  const apiKey = process.env.SMS_API_KEY?.trim();
  const sender = process.env.SMS_SENDER_ID?.trim() || "NexaSua";
  if (!url || !apiKey) {
    return { status: "NOT_CONFIGURED", error: "SMS gateway is not configured." };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender,
        recipients: [params.toPhone],
        message: params.message
      })
    });
    if (!res.ok) {
      return { status: "FAILED", error: `SMS provider responded with ${res.status}` };
    }
    return { status: "SENT" };
  } catch (err) {
    return {
      status: "FAILED",
      error: err instanceof Error ? err.message : "SMS dispatch error"
    };
  }
}

// server/services/pricingEngine.ts
var DEFAULT_PLAN_CATALOG = [
  {
    code: "CORE",
    name: "NexaSua Core",
    tagline: "Academic Operations Tier for Ghanaian KG, Primary, JHS & SHS Schools",
    durationLabel: "1 Academic Term (Closes on Term Vacation Date)",
    durationDays: 110,
    startingPriceLabel: "From GH\u20B5 350 / term",
    features: [
      "Student enrollment & verified guardian linking",
      "Academic years, terms, classes & subjects setup",
      "Continuous Assessment (CA) & end-of-term grading (30/70 & custom)",
      "Teacher mark submission, review & headteacher approval lock",
      "A4 PDF Terminal Report Cards with QR verification",
      "Daily attendance tracking & academic analytics",
      "Bulk CSV/Excel student & score import/export"
    ],
    isFeatured: false,
    isActive: true
  },
  {
    code: "COMPLETE",
    name: "NexaSua Complete",
    tagline: "Full School Administration, Finance, HR & Operations Suite",
    durationLabel: "1 Academic Term or 3-Term Bundle (Closes on Term Vacation Date)",
    durationDays: 110,
    startingPriceLabel: "From GH\u20B5 650 / term",
    features: [
      "Everything in NexaSua Core",
      "Fee structures, term invoices, waivers & discounts",
      "Paystack online payments + verified offline MoMo/bank/cash ledger",
      "Official PDF payment receipts & scheduled fee reminders (In-App/Email/SMS)",
      "Online admissions pipeline with 1-click applicant enrollment",
      "Staff directory, leave requests & conflict-free school timetables",
      "School announcements & dedicated student/parent portals"
    ],
    isFeatured: true,
    isActive: true
  },
  {
    code: "CUSTOM",
    name: "NexaSua Custom",
    tagline: "Bespoke White-Label & Multi-Campus School Systems by NexaFlow",
    durationLabel: "Annual / Custom Institutional Agreement",
    durationDays: 365,
    startingPriceLabel: "Setup from GH\u20B5 2,000",
    features: [
      "Custom school branding, portal domain & official school website",
      "Bespoke report card layouts & institutional workflows",
      "Multi-campus consolidation & dedicated SLA support",
      "Custom integrations with existing finance or biometric systems"
    ],
    isFeatured: false,
    isActive: true
  }
];
var DEFAULT_PRICING_BANDS = [
  {
    code: "BAND_1_150",
    label: "1\u2013150 Students",
    minStudents: 1,
    maxStudents: 150,
    corePriceGhs: 350,
    completePriceGhs: 650,
    isCustomQuote: false
  },
  {
    code: "BAND_151_400",
    label: "151\u2013400 Students",
    minStudents: 151,
    maxStudents: 400,
    corePriceGhs: 700,
    completePriceGhs: 1200,
    isCustomQuote: false
  },
  {
    code: "BAND_401_800",
    label: "401\u2013800 Students",
    minStudents: 401,
    maxStudents: 800,
    corePriceGhs: 1200,
    completePriceGhs: 2100,
    isCustomQuote: false
  },
  {
    code: "BAND_801_1500",
    label: "801\u20131,500 Students",
    minStudents: 801,
    maxStudents: 1500,
    corePriceGhs: 2e3,
    completePriceGhs: 3500,
    isCustomQuote: false
  },
  {
    code: "BAND_1501_PLUS",
    label: "Above 1,500 Students",
    minStudents: 1501,
    maxStudents: null,
    corePriceGhs: null,
    completePriceGhs: null,
    isCustomQuote: true
  }
];
function calculateSubscriptionPrice(params) {
  const count = Math.max(1, Math.floor(params.studentCount));
  const bands = params.bands?.length ? params.bands : DEFAULT_PRICING_BANDS;
  const band = bands.find(
    (b) => count >= b.minStudents && (b.maxStudents === null || count <= b.maxStudents)
  ) || bands[bands.length - 1];
  const termsCount = params.billingCycle === "THREE_TERMS" ? 3 : 1;
  const threeTermDiscountPercent = params.billingCycle === "THREE_TERMS" ? Math.max(0, Math.min(50, params.threeTermDiscountPercent ?? 10)) : 0;
  const promoDiscountPercent = Math.max(0, Math.min(100, params.promoDiscountPercent ?? 0));
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
      netPayableGhs: null
    };
  }
  const unitTermPriceGhs = params.plan === "CORE" ? band.corePriceGhs ?? 0 : band.completePriceGhs ?? 0;
  const grossAmountGhs = roundCurrency(unitTermPriceGhs * termsCount);
  const threeTermDiscountGhs = roundCurrency(grossAmountGhs * (threeTermDiscountPercent / 100));
  const afterThreeTerm = roundCurrency(grossAmountGhs - threeTermDiscountGhs);
  const promoDiscountGhs = roundCurrency(afterThreeTerm * (promoDiscountPercent / 100));
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
    netPayableGhs
  };
}
function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
async function ensureSystemConfig() {
  let config = await SystemConfigModel.findOne({ key: "GLOBAL_SETTINGS" });
  if (!config) {
    config = await SystemConfigModel.create({
      key: "GLOBAL_SETTINGS",
      superAdminInitialized: false,
      trialDays: 7,
      trialPolicyVersion: 2,
      threeTermDiscountPercent: 10,
      gracePeriodDays: 7,
      defaultCountry: "Ghana",
      defaultCurrency: "GH\u20B5",
      defaultTimezone: "Africa/Accra",
      pricingBands: DEFAULT_PRICING_BANDS,
      planCatalog: DEFAULT_PLAN_CATALOG,
      promotionalOffers: []
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
      config.planCatalog = DEFAULT_PLAN_CATALOG;
      dirty = true;
    }
    if (dirty) {
      await config.save();
    }
  }
  return config;
}

// server/routes/authRoutes.ts
var router2 = express2.Router();
var authLimiter = rateLimit({
  windowMs: 15 * 60 * 1e3,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again in 15 minutes." }
});
function getBaseUrl(req) {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}
async function resolveSchoolAndSub(schoolId, userRole) {
  if (!schoolId) return { error: null, schoolInfo: null, subscriptionInfo: null };
  const school = await SchoolModel.findById(schoolId).lean();
  if (!school) {
    return { error: "Associated school record was not found.", schoolInfo: null, subscriptionInfo: null };
  }
  if (school.status === "PENDING") {
    return {
      error: "Your school application is still pending Super Admin approval.",
      code: "SCHOOL_PENDING",
      schoolInfo: null,
      subscriptionInfo: null
    };
  }
  if (school.status === "REJECTED" || school.status === "SUSPENDED") {
    return {
      error: `School access is ${school.status.toLowerCase()}. Please contact NexaFlow support.`,
      schoolInfo: null,
      subscriptionInfo: null
    };
  }
  const sub = await SubscriptionModel.findOne({ schoolId: school._id });
  const closure = checkPortalClosure(sub, school);
  if (closure.closed) {
    if (sub && sub.status !== "EXPIRED" && sub.status !== "SUSPENDED") {
      sub.status = "EXPIRED";
      sub.portalClosedReason = closure.reason;
      await sub.save();
    }
    if (userRole !== "SCHOOL_ADMIN" && userRole !== "SUPER_ADMIN") {
      return {
        error: closure.reason,
        code: closure.code,
        schoolInfo: null,
        subscriptionInfo: null
      };
    }
  }
  const schoolInfo = {
    id: school._id,
    name: school.name,
    schoolCode: school.schoolCode,
    motto: school.motto,
    logoDataUrl: school.logoDataUrl,
    educationalLevels: school.educationalLevels,
    currency: school.currency,
    termVacationDate: school.termVacationDate || sub?.termVacationDate || "",
    onboardingSteps: school.onboardingSteps,
    reportCardSettings: school.reportCardSettings,
    dashboardSettings: school.dashboardSettings
  };
  const subscriptionInfo = sub ? {
    plan: sub.plan,
    status: sub.status,
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    studentBand: sub.studentBand,
    termVacationDate: sub.termVacationDate || school.termVacationDate || "",
    portalClosedReason: sub.portalClosedReason || closure.reason || ""
  } : null;
  return { error: null, schoolInfo, subscriptionInfo };
}
router2.get("/super-admin-status", async (_req, res) => {
  const envCreds = getSuperAdminEnvCredentials();
  const adminEnvCreds = getSchoolAdminEnvCredentials();
  if (!isDbConnected()) {
    res.json({
      dbConnected: false,
      superAdminInitialized: envCreds.configured,
      superAdminManagedBySecrets: envCreds.configured,
      adminManagedBySecrets: adminEnvCreds.configured,
      setupKeyRequired: Boolean(process.env.SUPER_ADMIN_SETUP_KEY?.trim())
    });
    return;
  }
  const cfg = await ensureSystemConfig();
  const count = await UserModel.countDocuments({ role: "SUPER_ADMIN" });
  const initialized = Boolean(envCreds.configured || cfg.superAdminInitialized || count > 0);
  if (count > 0 && !cfg.superAdminInitialized) {
    cfg.superAdminInitialized = true;
    await cfg.save();
  }
  res.json({
    dbConnected: true,
    superAdminInitialized: initialized,
    superAdminManagedBySecrets: envCreds.configured,
    adminManagedBySecrets: adminEnvCreds.configured,
    setupKeyRequired: Boolean(process.env.SUPER_ADMIN_SETUP_KEY?.trim())
  });
});
var bootstrapSchema = z2.object({
  fullName: z2.string().min(2).max(120),
  email: z2.string().email(),
  password: z2.string().min(10).max(128),
  setupKey: z2.string().optional()
});
router2.post("/super-admin-bootstrap", authLimiter, requireDb, async (req, res) => {
  const body = parseBody(bootstrapSchema, req, res);
  if (!body) return;
  const envCreds = getSuperAdminEnvCredentials();
  if (envCreds.configured) {
    res.status(403).json({
      error: "Super Admin credentials are already configured via Environment Secrets (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD)."
    });
    return;
  }
  const envKey = process.env.SUPER_ADMIN_SETUP_KEY?.trim();
  if (envKey && body.setupKey !== envKey) {
    res.status(403).json({ error: "Invalid Super Admin setup key." });
    return;
  }
  const existingCount = await UserModel.countDocuments({ role: "SUPER_ADMIN" });
  const cfg = await ensureSystemConfig();
  if (cfg.superAdminInitialized || existingCount > 0) {
    res.status(403).json({
      error: "Platform Super Admin has already been initialized."
    });
    return;
  }
  const emailTaken = await UserModel.findOne({ email: body.email.toLowerCase().trim() });
  if (emailTaken) {
    res.status(409).json({ error: "Email already registered." });
    return;
  }
  const user = await UserModel.create({
    email: body.email.toLowerCase().trim(),
    passwordHash: hashPassword(body.password),
    fullName: body.fullName.trim(),
    role: "SUPER_ADMIN",
    schoolId: null,
    emailVerified: true,
    status: "ACTIVE",
    lastLoginAt: /* @__PURE__ */ new Date()
  });
  cfg.superAdminInitialized = true;
  await cfg.save();
  const token = signSessionToken({
    userId: String(user._id),
    role: "SUPER_ADMIN",
    schoolId: null,
    mfaVerified: true
  });
  setSessionCookie(res, token);
  await writeAuditLog({
    userId: String(user._id),
    userEmail: user.email,
    userRole: "SUPER_ADMIN",
    action: "SUPER_ADMIN_BOOTSTRAPPED",
    resourceType: "User",
    resourceId: String(user._id),
    ipAddress: req.ip
  });
  res.status(201).json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      mfaEnabled: user.mfaEnabled
    }
  });
});
var loginSchema = z2.object({
  email: z2.string().email(),
  password: z2.string().min(1)
});
router2.post("/login", authLimiter, requireDb, async (req, res) => {
  const body = parseBody(loginSchema, req, res);
  if (!body) return;
  const cleanEmail = body.email.toLowerCase().trim();
  const envCreds = getSuperAdminEnvCredentials();
  const adminEnvCreds = getSchoolAdminEnvCredentials();
  let user = await UserModel.findOne({ email: cleanEmail });
  if (envCreds.configured && cleanEmail === envCreds.email) {
    if (!verifyEnvSecretMatch(body.password, envCreds.password)) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    if (user && user.role !== "SUPER_ADMIN") {
      res.status(409).json({
        error: "The configured SUPER_ADMIN_EMAIL is already assigned to a non-Super Admin account."
      });
      return;
    }
    if (!user) {
      const existingSuper = await UserModel.findOne({ role: "SUPER_ADMIN" });
      if (existingSuper) {
        existingSuper.email = envCreds.email;
        existingSuper.passwordHash = hashPassword(envCreds.password);
        existingSuper.emailVerified = true;
        existingSuper.status = "ACTIVE";
        await existingSuper.save();
        user = existingSuper;
      } else {
        user = await UserModel.create({
          email: envCreds.email,
          passwordHash: hashPassword(envCreds.password),
          fullName: "NexaFlow Super Admin",
          role: "SUPER_ADMIN",
          schoolId: null,
          emailVerified: true,
          status: "ACTIVE"
        });
      }
      const cfg = await ensureSystemConfig();
      if (!cfg.superAdminInitialized) {
        cfg.superAdminInitialized = true;
        await cfg.save();
      }
    } else if (!verifyPassword(envCreds.password, user.passwordHash)) {
      user.passwordHash = hashPassword(envCreds.password);
      await user.save();
    }
  } else if (envCreds.configured && user && user.role === "SUPER_ADMIN") {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  } else if (adminEnvCreds.configured && cleanEmail === adminEnvCreds.email) {
    if (!verifyEnvSecretMatch(body.password, adminEnvCreds.password)) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    if (user && user.role === "SUPER_ADMIN") {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    if (!user) {
      let targetSchool = await SchoolModel.findOne({ status: "APPROVED", requestedPlan: "COMPLETE" }).sort({
        createdAt: 1
      }) || await SchoolModel.findOne({ status: "APPROVED" }).sort({ createdAt: 1 });
      if (!targetSchool) {
        const suffix = crypto4.randomInt(1e3, 9999);
        const now = /* @__PURE__ */ new Date();
        const futureVacation = new Date(now.getTime() + 110 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
        targetSchool = await SchoolModel.create({
          name: "NexaFlow Flagship Academy",
          schoolCode: `NXS-ADM-${suffix}`,
          schoolType: "Private",
          educationalLevels: ["Kindergarten", "Primary", "Junior High School", "Senior High School"],
          country: "Ghana",
          region: "Greater Accra",
          town: "Accra",
          address: "Airport Residential Area, Accra",
          email: adminEnvCreds.email,
          phone: "+233 30 000 0000",
          status: "APPROVED",
          studentPopulationEstimate: 300,
          requestedPlan: "COMPLETE",
          termVacationDate: futureVacation,
          approvedAt: now,
          dataProtectionConsentAt: now
        });
        await SubscriptionModel.create({
          schoolId: targetSchool._id,
          plan: "COMPLETE",
          status: "ACTIVE",
          billingCycle: "TERM",
          trialEndsAt: new Date(now.getTime() + 7 * 864e5),
          currentPeriodStart: now,
          currentPeriodEnd: /* @__PURE__ */ new Date(`${futureVacation}T23:59:59.000Z`),
          termVacationDate: futureVacation,
          studentBand: "151\u2013400 Students",
          unitPriceGhs: 0,
          discountPercent: 0,
          amountDueGhs: 0,
          gracePeriodDays: 7,
          overrideNote: "Provisioned via ADMIN_EMAIL / ADMIN_PASSWORD Secret"
        });
        await AssessmentConfigModel.create({
          schoolId: targetSchool._id,
          ...DEFAULT_30_70_TEMPLATE,
          level: "All",
          isDefault: true
        });
      }
      user = await UserModel.create({
        email: adminEnvCreds.email,
        passwordHash: hashPassword(adminEnvCreds.password),
        fullName: "School Administrator",
        role: "SCHOOL_ADMIN",
        schoolId: targetSchool._id,
        emailVerified: true,
        status: "ACTIVE",
        dataConsentAcceptedAt: /* @__PURE__ */ new Date()
      });
    } else {
      if (!verifyPassword(adminEnvCreds.password, user.passwordHash)) {
        user.passwordHash = hashPassword(adminEnvCreds.password);
      }
      user.emailVerified = true;
      user.status = "ACTIVE";
      await user.save();
    }
  } else {
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
  }
  if (user.status !== "ACTIVE") {
    res.status(403).json({ error: "Your user account is currently suspended." });
    return;
  }
  const schoolResolved = await resolveSchoolAndSub(user.schoolId, user.role);
  if (schoolResolved.error) {
    res.status(403).json({
      error: schoolResolved.error,
      code: schoolResolved.code
    });
    return;
  }
  if (user.mfaEnabled) {
    const mfaChallengeToken = jwt2.sign(
      { userId: String(user._id), stage: "MFA_CHALLENGE" },
      getJwtSecret(),
      { expiresIn: "10m" }
    );
    res.json({
      mfaRequired: true,
      mfaChallengeToken
    });
    return;
  }
  user.lastLoginAt = /* @__PURE__ */ new Date();
  await user.save();
  const token = signSessionToken({
    userId: String(user._id),
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    mfaVerified: true
  });
  setSessionCookie(res, token);
  await writeAuditLog({
    schoolId: user.schoolId ? String(user.schoolId) : null,
    userId: String(user._id),
    userEmail: user.email,
    userRole: user.role,
    action: "USER_LOGIN",
    resourceType: "User",
    resourceId: String(user._id),
    ipAddress: req.ip
  });
  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      schoolId: user.schoolId,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified
    },
    school: schoolResolved.schoolInfo,
    subscription: schoolResolved.subscriptionInfo
  });
});
var updateSuperAdminCredsSchema = z2.object({
  currentPassword: z2.string().min(1),
  fullName: z2.string().min(2).max(120).optional(),
  newEmail: z2.string().email().optional(),
  newPassword: z2.string().min(10).max(128).optional().or(z2.literal(""))
});
router2.put(
  "/super-admin-credentials",
  authenticate,
  requireRole("SUPER_ADMIN"),
  async (req, res) => {
    const body = parseBody(updateSuperAdminCredsSchema, req, res);
    if (!body) return;
    const envCreds = getSuperAdminEnvCredentials();
    if (envCreds.configured) {
      res.status(400).json({
        error: "Super Admin email and password are currently managed by Environment Secrets (SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD). Update those secrets in AI Studio Settings -> Secrets anytime to change them."
      });
      return;
    }
    const user = await UserModel.findById(req.authUser._id);
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    if (body.newEmail) {
      const normalized = body.newEmail.toLowerCase().trim();
      if (normalized !== user.email) {
        const conflict = await UserModel.exists({ email: normalized, _id: { $ne: user._id } });
        if (conflict) {
          res.status(409).json({ error: "Another user is already registered with that email." });
          return;
        }
        user.email = normalized;
      }
    }
    if (body.fullName) {
      user.fullName = body.fullName.trim();
    }
    if (body.newPassword && body.newPassword.length >= 10) {
      user.passwordHash = hashPassword(body.newPassword);
    }
    await user.save();
    await writeAuditLog({
      userId: String(user._id),
      userEmail: user.email,
      userRole: user.role,
      action: "SUPER_ADMIN_CREDENTIALS_UPDATED",
      resourceType: "User",
      resourceId: String(user._id),
      ipAddress: req.ip
    });
    res.json({
      message: "Super Admin credentials updated successfully.",
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mfaEnabled: user.mfaEnabled
      }
    });
  }
);
router2.get("/google/url", (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    res.status(503).json({
      error: "Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment secrets.",
      code: "GOOGLE_OAUTH_NOT_CONFIGURED"
    });
    return;
  }
  const intent = req.query.intent === "register" ? "register" : "login";
  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const stateToken = jwt2.sign(
    {
      nonce: crypto4.randomBytes(12).toString("hex"),
      intent,
      redirectUri,
      stage: "GOOGLE_OAUTH_STATE"
    },
    getJwtSecret(),
    { expiresIn: "10m" }
  );
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: stateToken,
    prompt: "select_account"
  });
  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirectUri
  });
});
function sendGooglePopupHtml(res, payload) {
  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html>
<html>
  <head><title>NexaSua Google Sign-In</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; text-align: center; color: #102846;">
    <p>Completing sign-in with NexaSua...</p>
    <script>
      (function () {
        var payload = ${safeJson};
        if (window.opener) {
          window.opener.postMessage(payload, window.location.origin);
          window.close();
        } else {
          window.location.href = '/login';
        }
      })();
    </script>
  </body>
</html>`);
}
async function handleGoogleCallback(req, res) {
  const oauthError = req.query.error ? String(req.query.error) : "";
  if (oauthError) {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: "Google sign-in was cancelled or denied."
    });
    return;
  }
  const code = String(req.query.code || "");
  const stateRaw = String(req.query.state || "");
  if (!code || !stateRaw) {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: "Missing authorization code or state from Google."
    });
    return;
  }
  let state;
  try {
    state = jwt2.verify(stateRaw, getJwtSecret());
  } catch {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: "Google sign-in session expired. Please try again."
    });
    return;
  }
  if (state.stage !== "GOOGLE_OAUTH_STATE" || !state.redirectUri) {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: "Invalid OAuth state."
    });
    return;
  }
  if (!isDbConnected()) {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: "Database is not connected yet. Configure MONGODB_URI first."
    });
    return;
  }
  if (!isGoogleOAuthConfigured()) {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: "Google OAuth credentials are not configured on the server."
    });
    return;
  }
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
        redirect_uri: state.redirectUri,
        grant_type: "authorization_code"
      })
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_ERROR",
        error: tokenJson.error_description || "Failed to exchange Google authorization code."
      });
      return;
    }
    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const profile = await userinfoRes.json();
    if (!userinfoRes.ok || !profile.email || !profile.email_verified || !profile.sub) {
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_ERROR",
        error: "A verified Google email address is required."
      });
      return;
    }
    const email = profile.email.toLowerCase().trim();
    const envCreds = getSuperAdminEnvCredentials();
    if (envCreds.configured && email === envCreds.email) {
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_ERROR",
        error: "Super Admin accounts cannot sign in with Google. Use the Super Admin portal."
      });
      return;
    }
    const user = await UserModel.findOne({ email });
    if (!user) {
      const googleOnboardingToken = jwt2.sign(
        {
          stage: "GOOGLE_ONBOARDING",
          email,
          fullName: profile.name || email.split("@")[0],
          googleId: profile.sub
        },
        getJwtSecret(),
        { expiresIn: "20m" }
      );
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_NEW_USER",
        intent: state.intent || "login",
        email,
        fullName: profile.name || "",
        googleOnboardingToken
      });
      return;
    }
    if (user.role === "SUPER_ADMIN") {
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_ERROR",
        error: "Super Admin accounts cannot sign in with Google. Use the Super Admin portal."
      });
      return;
    }
    if (user.status !== "ACTIVE") {
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_ERROR",
        error: "Your user account is currently suspended."
      });
      return;
    }
    const schoolResolved = await resolveSchoolAndSub(user.schoolId, user.role);
    if (schoolResolved.error) {
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_ERROR",
        error: schoolResolved.error
      });
      return;
    }
    user.googleId = profile.sub;
    user.emailVerified = true;
    if (user.authProvider === "LOCAL") {
      user.authProvider = "HYBRID";
    }
    if (user.mfaEnabled) {
      await user.save();
      const mfaChallengeToken = jwt2.sign(
        { userId: String(user._id), stage: "MFA_CHALLENGE" },
        getJwtSecret(),
        { expiresIn: "10m" }
      );
      sendGooglePopupHtml(res, {
        type: "NEXASUA_GOOGLE_MFA_REQUIRED",
        mfaChallengeToken
      });
      return;
    }
    user.lastLoginAt = /* @__PURE__ */ new Date();
    await user.save();
    const token = signSessionToken({
      userId: String(user._id),
      role: user.role,
      schoolId: user.schoolId ? String(user.schoolId) : null,
      mfaVerified: true
    });
    setSessionCookie(res, token);
    await writeAuditLog({
      schoolId: user.schoolId ? String(user.schoolId) : null,
      userId: String(user._id),
      userEmail: user.email,
      userRole: user.role,
      action: "USER_GOOGLE_LOGIN",
      resourceType: "User",
      resourceId: String(user._id),
      ipAddress: req.ip
    });
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_AUTH_SUCCESS",
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        schoolId: user.schoolId,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified
      },
      school: schoolResolved.schoolInfo,
      subscription: schoolResolved.subscriptionInfo
    });
  } catch (err) {
    sendGooglePopupHtml(res, {
      type: "NEXASUA_GOOGLE_ERROR",
      error: err instanceof Error ? err.message : "Google authentication failed."
    });
  }
}
router2.get(["/google/callback", "/google/callback/"], handleGoogleCallback);
var verifyMfaLoginSchema = z2.object({
  mfaChallengeToken: z2.string().min(10),
  code: z2.string().min(6).max(16)
});
router2.post("/mfa/verify-login", authLimiter, requireDb, async (req, res) => {
  const body = parseBody(verifyMfaLoginSchema, req, res);
  if (!body) return;
  let decoded;
  try {
    decoded = jwt2.verify(body.mfaChallengeToken, getJwtSecret());
  } catch {
    res.status(401).json({ error: "MFA challenge expired. Please sign in again." });
    return;
  }
  if (decoded.stage !== "MFA_CHALLENGE" || !decoded.userId) {
    res.status(401).json({ error: "Invalid MFA challenge token." });
    return;
  }
  const user = await UserModel.findById(decoded.userId);
  if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) {
    res.status(401).json({ error: "MFA is not active on this account." });
    return;
  }
  const secret = decryptSecret(user.mfaSecretEncrypted);
  const totpValid = verifyTotpCode(secret, body.code);
  let backupMatched = false;
  if (!totpValid && user.mfaBackupCodesHash.length > 0) {
    const codeHash = hashToken(body.code.trim().toUpperCase());
    const idx = user.mfaBackupCodesHash.indexOf(codeHash);
    if (idx !== -1) {
      backupMatched = true;
      user.mfaBackupCodesHash.splice(idx, 1);
    }
  }
  if (!totpValid && !backupMatched) {
    res.status(401).json({ error: "Invalid verification code." });
    return;
  }
  user.lastLoginAt = /* @__PURE__ */ new Date();
  await user.save();
  const token = signSessionToken({
    userId: String(user._id),
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    mfaVerified: true
  });
  setSessionCookie(res, token);
  let school = null;
  let subscription = null;
  if (user.schoolId) {
    school = await SchoolModel.findById(user.schoolId).select("-paymentConfig.paystackSecretEncrypted").lean();
    subscription = await SubscriptionModel.findOne({ schoolId: user.schoolId }).lean();
  }
  res.json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      schoolId: user.schoolId,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified
    },
    school,
    subscription
  });
});
router2.post("/mfa/setup", authenticate, async (req, res) => {
  const user = await UserModel.findById(req.authUser._id);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const secret = generateTotpSecret();
  user.mfaSecretEncrypted = encryptSecret(secret);
  await user.save();
  const qrDataUrl = await generateTotpQrDataUrl(user.email, secret);
  res.json({ secret, qrDataUrl });
});
router2.post("/mfa/enable", authenticate, async (req, res) => {
  const code = String(req.body?.code || "").trim();
  const user = await UserModel.findById(req.authUser._id);
  if (!user || !user.mfaSecretEncrypted) {
    res.status(400).json({ error: "Initiate MFA setup first." });
    return;
  }
  const secret = decryptSecret(user.mfaSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    res.status(400).json({ error: "Invalid 6-digit authenticator code." });
    return;
  }
  const backupCodes = Array.from(
    { length: 6 },
    () => crypto4.randomBytes(4).toString("hex").toUpperCase()
  );
  user.mfaEnabled = true;
  user.mfaBackupCodesHash = backupCodes.map(hashToken);
  await user.save();
  await writeAuditLog({
    schoolId: user.schoolId ? String(user.schoolId) : null,
    userId: String(user._id),
    userEmail: user.email,
    userRole: user.role,
    action: "MFA_ENABLED",
    resourceType: "User",
    resourceId: String(user._id),
    ipAddress: req.ip
  });
  res.json({ enabled: true, backupCodes });
});
router2.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});
router2.get("/me", authenticate, async (req, res) => {
  let school = null;
  let subscription = null;
  if (req.authUser.schoolId) {
    const [s, sub] = await Promise.all([
      SchoolModel.findById(req.authUser.schoolId).select("-paymentConfig.paystackSecretEncrypted").lean(),
      SubscriptionModel.findOne({ schoolId: req.authUser.schoolId }).lean()
    ]);
    school = s;
    subscription = sub;
  }
  res.json({
    user: req.authUser,
    school,
    subscription,
    superAdminManagedBySecrets: req.authUser.role === "SUPER_ADMIN" ? getSuperAdminEnvCredentials().configured : false,
    adminManagedBySecrets: getSchoolAdminEnvCredentials().configured
  });
});
router2.post("/verify-email", requireDb, async (req, res) => {
  const token = String(req.body?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "Verification token is required." });
    return;
  }
  const user = await UserModel.findOne({ verificationTokenHash: hashToken(token) });
  if (!user) {
    res.status(400).json({ error: "Invalid or already used verification token." });
    return;
  }
  user.emailVerified = true;
  user.verificationTokenHash = "";
  await user.save();
  res.json({ verified: true, email: user.email });
});
router2.post("/request-password-reset", authLimiter, requireDb, async (req, res) => {
  const email = String(req.body?.email || "").toLowerCase().trim();
  const user = await UserModel.findOne({ email });
  if (user && user.role !== "SUPER_ADMIN") {
    const rawToken = crypto4.randomBytes(24).toString("hex");
    user.resetTokenHash = hashToken(rawToken);
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1e3);
    await user.save();
    const baseUrl = getBaseUrl(req);
    await sendTransactionalEmail({
      to: user.email,
      subject: "NexaSua Password Reset Request",
      text: `Reset your password within 1 hour using: ${baseUrl}/login?resetToken=${rawToken}`
    });
  }
  res.json({
    message: "If an account exists for that email and transactional email is configured, reset instructions have been sent."
  });
});
var resetPasswordSchema = z2.object({
  token: z2.string().min(10),
  newPassword: z2.string().min(8).max(128)
});
router2.post("/reset-password", authLimiter, requireDb, async (req, res) => {
  const body = parseBody(resetPasswordSchema, req, res);
  if (!body) return;
  const user = await UserModel.findOne({
    resetTokenHash: hashToken(body.token),
    resetTokenExpires: { $gt: /* @__PURE__ */ new Date() },
    role: { $ne: "SUPER_ADMIN" }
  });
  if (!user) {
    res.status(400).json({ error: "Invalid or expired reset token." });
    return;
  }
  user.passwordHash = hashPassword(body.newPassword);
  user.resetTokenHash = "";
  user.resetTokenExpires = null;
  await user.save();
  res.json({ message: "Password updated successfully. You may now log in." });
});
var authRoutes_default = router2;

// server/routes/completeRoutes.ts
import crypto6 from "crypto";
import express3 from "express";
import { z as z3 } from "zod";

// server/services/paystackService.ts
import crypto5 from "crypto";
async function initializePaystackTransaction(params) {
  if (!params.secretKey || !params.secretKey.startsWith("sk_")) {
    return { ok: false, error: "Online payment is not yet configured." };
  }
  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amountGhs * 100),
        // pesewas
        currency: "GHS",
        reference: params.reference,
        callback_url: params.callbackUrl,
        channels: params.channels || ["card", "mobile_money", "bank_transfer"],
        metadata: params.metadata || {}
      })
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data) {
      return { ok: false, error: data.message || "Paystack initialization failed." };
    }
    return {
      ok: true,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to reach Paystack API."
    };
  }
}
async function verifyPaystackTransaction(secretKey, reference) {
  if (!secretKey || !secretKey.startsWith("sk_")) {
    return { ok: false, verified: false, error: "Online payment is not yet configured." };
  }
  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`
        }
      }
    );
    const data = await response.json();
    if (!response.ok || !data.status || !data.data) {
      return { ok: false, verified: false, error: data.message || "Verification failed." };
    }
    const verified = data.data.status === "success" && data.data.currency === "GHS";
    return {
      ok: true,
      verified,
      amountGhs: data.data.amount / 100,
      channel: data.data.channel,
      gatewayResponse: data.data.gateway_response,
      paidAt: data.data.paid_at,
      raw: data.data
    };
  } catch (err) {
    return {
      ok: false,
      verified: false,
      error: err instanceof Error ? err.message : "Unable to reach Paystack API."
    };
  }
}
function verifyPaystackWebhookSignature(rawBody, signatureHeader, secretKey) {
  if (!signatureHeader || !secretKey) return false;
  const computed = crypto5.createHmac("sha512", secretKey).update(rawBody).digest("hex");
  if (computed.length !== signatureHeader.length) return false;
  return crypto5.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
}

// server/routes/completeRoutes.ts
var router3 = express3.Router();
router3.use(
  requireDb,
  authenticate,
  requireSchoolContext,
  requireCompletePlan,
  requireActiveSubscriptionWrite
);
router3.get(
  "/fee-structures",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "BURSAR", "ADMIN_STAFF"),
  async (req, res) => {
    const structures = await FeeStructureModel.find({ schoolId: req.authUser.schoolId }).populate("targetClassId", "name").populate("academicYearId", "name").populate("termId", "name").sort({ createdAt: -1 }).lean();
    res.json({ structures });
  }
);
var feeStructureSchema2 = z3.object({
  academicYearId: z3.string().min(12),
  termId: z3.string().min(12),
  name: z3.string().min(2).max(120),
  category: z3.enum([
    "Tuition",
    "Examination",
    "Feeding",
    "Transport",
    "Boarding",
    "Development Levy",
    "Other"
  ]),
  amountGhs: z3.number().min(0),
  targetClassId: z3.string().nullable().optional(),
  targetStudentCategory: z3.enum(["All", "Day", "Boarding", "Scholarship"]).default("All")
});
router3.post(
  "/fee-structures",
  requireRole("SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const body = parseBody(feeStructureSchema2, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const structure = await FeeStructureModel.create({
      schoolId,
      academicYearId: validObjectId(body.academicYearId),
      termId: validObjectId(body.termId),
      name: body.name.trim(),
      category: body.category,
      amountGhs: roundCurrency(body.amountGhs),
      targetClassId: body.targetClassId ? validObjectId(body.targetClassId) : null,
      targetStudentCategory: body.targetStudentCategory
    });
    res.status(201).json({ structure });
  }
);
router3.get("/invoices", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const role = req.authUser.role;
  const query = { schoolId };
  if (role === "PARENT") {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser._id,
      verified: true
    }).select("studentId");
    query.studentId = { $in: links.map((l) => l.studentId) };
  } else if (role === "STUDENT") {
    const st = await StudentModel.findOne({ schoolId, userId: req.authUser._id });
    if (!st) {
      res.json({ invoices: [] });
      return;
    }
    query.studentId = st._id;
  } else if (!["SCHOOL_ADMIN", "HEADTEACHER", "BURSAR", "ADMIN_STAFF"].includes(role)) {
    res.status(403).json({ error: "Not authorized to view fee invoices." });
    return;
  }
  const invoices = await FeeInvoiceModel.find(query).populate({
    path: "studentId",
    select: "fullName admissionNumber currentClassId",
    populate: { path: "currentClassId", select: "name" }
  }).populate("academicYearId", "name").populate("termId", "name").sort({ createdAt: -1 }).lean();
  res.json({ invoices });
});
var createInvoiceSchema = z3.object({
  studentId: z3.string().min(12),
  academicYearId: z3.string().min(12),
  termId: z3.string().min(12),
  dueDate: z3.string().min(8).max(20),
  discountGhs: z3.number().min(0).default(0),
  waiverGhs: z3.number().min(0).default(0),
  notes: z3.string().max(400).optional(),
  items: z3.array(
    z3.object({
      description: z3.string().min(2).max(120),
      category: z3.string().min(2).max(40),
      amountGhs: z3.number().min(0)
    })
  ).min(1)
});
router3.post(
  "/invoices",
  requireRole("SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const body = parseBody(createInvoiceSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const studentId = validObjectId(body.studentId);
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    if (!studentId || !academicYearId || !termId) {
      res.status(400).json({ error: "Invalid student, academic year, or term ID." });
      return;
    }
    const studentExists = await StudentModel.exists({ _id: studentId, schoolId });
    if (!studentExists) {
      res.status(404).json({ error: "Student not found in this school." });
      return;
    }
    const subtotalGhs = roundCurrency(
      body.items.reduce((sum, item) => sum + roundCurrency(item.amountGhs), 0)
    );
    const discountGhs = roundCurrency(body.discountGhs);
    const waiverGhs = roundCurrency(body.waiverGhs);
    const totalGhs = roundCurrency(Math.max(0, subtotalGhs - discountGhs - waiverGhs));
    const invoiceNumber = `INV-${req.schoolDoc.schoolCode}-${crypto6.randomInt(1e4, 99999)}`;
    const invoice = await FeeInvoiceModel.create({
      schoolId,
      studentId,
      academicYearId,
      termId,
      invoiceNumber,
      items: body.items,
      subtotalGhs,
      discountGhs,
      waiverGhs,
      totalGhs,
      amountPaidGhs: 0,
      balanceGhs: totalGhs,
      dueDate: body.dueDate,
      status: totalGhs === 0 ? "PAID" : "UNPAID",
      notes: body.notes || "",
      createdBy: req.authUser._id
    });
    await FinancialLedgerModel.create({
      schoolId,
      entryType: "INVOICE_CHARGE",
      studentId,
      invoiceId: invoice._id,
      amountGhs: subtotalGhs,
      description: `Invoice ${invoiceNumber} issued`,
      createdBy: req.authUser._id
    });
    if (discountGhs > 0) {
      await FinancialLedgerModel.create({
        schoolId,
        entryType: "DISCOUNT",
        studentId,
        invoiceId: invoice._id,
        amountGhs: -discountGhs,
        description: `Discount on ${invoiceNumber}`,
        createdBy: req.authUser._id
      });
    }
    if (waiverGhs > 0) {
      await FinancialLedgerModel.create({
        schoolId,
        entryType: "WAIVER",
        studentId,
        invoiceId: invoice._id,
        amountGhs: -waiverGhs,
        description: `Scholarship/Waiver on ${invoiceNumber}`,
        createdBy: req.authUser._id
      });
    }
    res.status(201).json({ invoice });
  }
);
router3.get("/payments", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const role = req.authUser.role;
  const query = { schoolId };
  if (role === "PARENT") {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser._id,
      verified: true
    }).select("studentId");
    query.studentId = { $in: links.map((l) => l.studentId) };
  } else if (role === "STUDENT") {
    const st = await StudentModel.findOne({ schoolId, userId: req.authUser._id });
    query.studentId = st ? st._id : null;
  } else if (!["SCHOOL_ADMIN", "HEADTEACHER", "BURSAR", "ADMIN_STAFF"].includes(role)) {
    res.status(403).json({ error: "Not authorized." });
    return;
  }
  const payments = await FeePaymentModel.find(query).populate("studentId", "fullName admissionNumber").populate("invoiceId", "invoiceNumber totalGhs balanceGhs").sort({ createdAt: -1 }).lean();
  res.json({ payments });
});
async function applyVerifiedFeePayment(params) {
  const existing = await FeePaymentModel.findOne({
    reference: params.reference,
    status: "VERIFIED"
  });
  if (existing) {
    return { duplicate: true, payment: existing };
  }
  const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${crypto6.randomBytes(2).toString("hex").toUpperCase()}`;
  const payment = await FeePaymentModel.findOneAndUpdate(
    { reference: params.reference },
    {
      schoolId: params.schoolId,
      invoiceId: params.invoice._id,
      studentId: params.invoice.studentId,
      receiptNumber,
      amountGhs: roundCurrency(params.amountGhs),
      channel: params.channel,
      status: "VERIFIED",
      recordedBy: params.recordedBy,
      verifiedAt: /* @__PURE__ */ new Date(),
      paystackData: params.paystackData || null
    },
    { upsert: true, new: true }
  );
  params.invoice.amountPaidGhs = roundCurrency(params.invoice.amountPaidGhs + params.amountGhs);
  params.invoice.balanceGhs = roundCurrency(
    Math.max(0, params.invoice.totalGhs - params.invoice.amountPaidGhs)
  );
  params.invoice.status = params.invoice.balanceGhs <= 0 ? "PAID" : "PARTIAL";
  await params.invoice.save();
  await FinancialLedgerModel.create({
    schoolId: params.schoolId,
    entryType: "PAYMENT_CREDIT",
    studentId: params.invoice.studentId,
    invoiceId: params.invoice._id,
    paymentId: payment._id,
    amountGhs: -roundCurrency(params.amountGhs),
    description: `Payment ${receiptNumber} (${params.channel})`,
    createdBy: params.recordedBy
  });
  return { duplicate: false, payment };
}
var offlinePaymentSchema = z3.object({
  invoiceId: z3.string().min(12),
  amountGhs: z3.number().min(0.01),
  channel: z3.enum(["OFFLINE_CASH", "OFFLINE_MOMO", "OFFLINE_BANK"]),
  externalReference: z3.string().max(80).optional()
});
router3.post(
  "/payments/offline",
  requireRole("SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const body = parseBody(offlinePaymentSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const invoiceId = validObjectId(body.invoiceId);
    if (!invoiceId) {
      res.status(400).json({ error: "Invalid invoiceId." });
      return;
    }
    const invoice = await FeeInvoiceModel.findOne({ _id: invoiceId, schoolId });
    if (!invoice || invoice.status === "VOID") {
      res.status(404).json({ error: "Active invoice not found." });
      return;
    }
    if (body.amountGhs > invoice.balanceGhs + 0.01) {
      res.status(400).json({
        error: `Amount (GH\u20B5${body.amountGhs}) exceeds remaining balance (GH\u20B5${invoice.balanceGhs}).`
      });
      return;
    }
    const ref = body.externalReference?.trim() || `OFF-${crypto6.randomBytes(6).toString("hex").toUpperCase()}`;
    const result = await applyVerifiedFeePayment({
      schoolId,
      invoice,
      amountGhs: body.amountGhs,
      channel: body.channel,
      reference: ref,
      recordedBy: req.authUser._id
    });
    await writeAuditLog({
      schoolId,
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: "OFFLINE_FEE_PAYMENT_RECORDED",
      resourceType: "FeePayment",
      resourceId: String(result.payment._id),
      details: { amountGhs: body.amountGhs, channel: body.channel },
      ipAddress: req.ip
    });
    res.status(201).json({ payment: result.payment, invoice });
  }
);
router3.post(
  "/payments/:id/reverse",
  requireRole("SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const id = validObjectId(req.params.id);
    const reason = String(req.body?.reason || "").trim();
    if (!id || reason.length < 5) {
      res.status(400).json({ error: "Valid payment ID and reversal reason are required." });
      return;
    }
    const payment = await FeePaymentModel.findOne({ _id: id, schoolId, status: "VERIFIED" });
    if (!payment) {
      res.status(404).json({ error: "Verified payment not found." });
      return;
    }
    const invoice = await FeeInvoiceModel.findOne({ _id: payment.invoiceId, schoolId });
    if (!invoice) {
      res.status(404).json({ error: "Associated invoice not found." });
      return;
    }
    payment.status = "REVERSED";
    payment.reversalReason = reason;
    await payment.save();
    invoice.amountPaidGhs = roundCurrency(Math.max(0, invoice.amountPaidGhs - payment.amountGhs));
    invoice.balanceGhs = roundCurrency(Math.max(0, invoice.totalGhs - invoice.amountPaidGhs));
    invoice.status = invoice.amountPaidGhs <= 0 ? "UNPAID" : "PARTIAL";
    await invoice.save();
    await FinancialLedgerModel.create({
      schoolId,
      entryType: "REVERSAL",
      studentId: payment.studentId,
      invoiceId: invoice._id,
      paymentId: payment._id,
      amountGhs: payment.amountGhs,
      description: `Reversal of ${payment.receiptNumber}: ${reason}`,
      createdBy: req.authUser._id
    });
    await writeAuditLog({
      schoolId,
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: "PAYMENT_REVERSED",
      resourceType: "FeePayment",
      resourceId: String(payment._id),
      details: { reason, amountGhs: payment.amountGhs },
      ipAddress: req.ip
    });
    res.json({ payment, invoice });
  }
);
router3.post(
  "/payments/paystack/initialize",
  requireRole("PARENT", "SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const invoiceId = validObjectId(String(req.body?.invoiceId || ""));
    const amountGhs = Number(req.body?.amountGhs || 0);
    if (!invoiceId || amountGhs <= 0) {
      res.status(400).json({ error: "Valid invoiceId and positive amountGhs required." });
      return;
    }
    const school = await SchoolModel.findById(schoolId);
    const encryptedKey = school?.paymentConfig?.paystackSecretEncrypted;
    const secretKey = encryptedKey ? decryptSecret(encryptedKey) : "";
    if (!school?.paymentConfig?.isConfigured || !secretKey) {
      res.status(400).json({ error: "Online payment is not yet configured." });
      return;
    }
    const invoice = await FeeInvoiceModel.findOne({ _id: invoiceId, schoolId });
    if (!invoice || invoice.balanceGhs <= 0) {
      res.status(404).json({ error: "Payable invoice not found." });
      return;
    }
    if (req.authUser.role === "PARENT") {
      const verified = await GuardianLinkModel.exists({
        schoolId,
        parentUserId: req.authUser._id,
        studentId: invoice.studentId,
        verified: true
      });
      if (!verified) {
        res.status(403).json({ error: "Verified guardian link required." });
        return;
      }
    }
    const payable = roundCurrency(Math.min(amountGhs, invoice.balanceGhs));
    const reference = `NXS-FEE-${crypto6.randomBytes(8).toString("hex").toUpperCase()}`;
    await FeePaymentModel.create({
      schoolId,
      invoiceId: invoice._id,
      studentId: invoice.studentId,
      receiptNumber: `PEND-${reference.slice(-8)}`,
      reference,
      amountGhs: payable,
      channel: "PAYSTACK_MOMO",
      status: "PENDING",
      recordedBy: req.authUser._id
    });
    const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
    const init = await initializePaystackTransaction({
      secretKey,
      email: req.authUser.email,
      amountGhs: payable,
      reference,
      callbackUrl: `${baseUrl}/dashboard?feeVerify=${reference}`,
      metadata: {
        type: "SCHOOL_FEE",
        schoolId,
        invoiceId: String(invoice._id)
      }
    });
    if (!init.ok) {
      res.status(400).json({ error: init.error });
      return;
    }
    res.json({ authorizationUrl: init.authorizationUrl, reference });
  }
);
router3.post(
  "/payments/paystack/verify",
  requireRole("PARENT", "SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const reference = String(req.body?.reference || "").trim();
    const pending = await FeePaymentModel.findOne({ schoolId, reference });
    if (!pending) {
      res.status(404).json({ error: "Payment reference not found." });
      return;
    }
    if (pending.status === "VERIFIED") {
      res.json({ alreadyVerified: true, payment: pending });
      return;
    }
    const school = await SchoolModel.findById(schoolId);
    const secretKey = school?.paymentConfig?.paystackSecretEncrypted ? decryptSecret(school.paymentConfig.paystackSecretEncrypted) : "";
    if (!secretKey) {
      res.status(400).json({ error: "Online payment is not yet configured." });
      return;
    }
    const verification = await verifyPaystackTransaction(secretKey, reference);
    if (!verification.ok || !verification.verified || (verification.amountGhs ?? 0) < pending.amountGhs) {
      pending.status = "FAILED";
      await pending.save();
      res.status(400).json({ error: verification.error || "Payment verification failed." });
      return;
    }
    const invoice = await FeeInvoiceModel.findOne({ _id: pending.invoiceId, schoolId });
    if (!invoice) {
      res.status(404).json({ error: "Invoice not found." });
      return;
    }
    const channel = verification.channel === "card" ? "PAYSTACK_CARD" : "PAYSTACK_MOMO";
    const result = await applyVerifiedFeePayment({
      schoolId,
      invoice,
      amountGhs: pending.amountGhs,
      channel,
      reference,
      recordedBy: req.authUser._id,
      paystackData: verification.raw
    });
    res.json({ verified: true, payment: result.payment, invoice });
  }
);
router3.get("/payments/:id/receipt/pdf", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid payment ID." });
    return;
  }
  const payment = await FeePaymentModel.findOne({ _id: id, schoolId, status: "VERIFIED" }).lean();
  if (!payment) {
    res.status(404).json({ error: "Verified receipt not found." });
    return;
  }
  if (req.authUser.role === "PARENT") {
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser._id,
      studentId: payment.studentId,
      verified: true
    });
    if (!verified) {
      res.status(403).json({ error: "Access denied." });
      return;
    }
  }
  const [student, invoice] = await Promise.all([
    StudentModel.findById(payment.studentId).populate("currentClassId", "name").lean(),
    FeeInvoiceModel.findById(payment.invoiceId).lean()
  ]);
  const pdf = await generateReceiptPdfBuffer({
    schoolName: req.schoolDoc.name,
    schoolAddress: `${req.schoolDoc.address}, ${req.schoolDoc.town}`,
    schoolPhone: req.schoolDoc.phone,
    receiptNumber: payment.receiptNumber,
    paymentReference: payment.reference,
    studentName: student?.fullName || "Student",
    admissionNumber: student?.admissionNumber || "",
    className: student?.currentClassId?.name || "",
    invoiceNumber: invoice?.invoiceNumber || "",
    amountPaidGhs: payment.amountGhs,
    balanceRemainingGhs: invoice?.balanceGhs || 0,
    channel: payment.channel,
    paidAt: new Date(payment.verifiedAt || payment.createdAt).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${payment.receiptNumber}.pdf"`);
  res.send(pdf);
});
router3.get(
  "/ledger",
  requireRole("SCHOOL_ADMIN", "BURSAR", "HEADTEACHER"),
  async (req, res) => {
    const entries = await FinancialLedgerModel.find({ schoolId: req.authUser.schoolId }).populate("studentId", "fullName admissionNumber").populate("invoiceId", "invoiceNumber").sort({ createdAt: -1 }).limit(200).lean();
    res.json({ entries });
  }
);
router3.get(
  "/reminders",
  requireRole("SCHOOL_ADMIN", "BURSAR", "HEADTEACHER"),
  async (req, res) => {
    const reminders = await FeeReminderModel.find({ schoolId: req.authUser.schoolId }).populate("studentId", "fullName admissionNumber").sort({ createdAt: -1 }).limit(100).lean();
    res.json({ reminders });
  }
);
var createReminderSchema = z3.object({
  invoiceId: z3.string().min(12),
  channel: z3.enum(["IN_APP", "EMAIL", "SMS"]),
  subject: z3.string().min(3).max(120),
  message: z3.string().min(10).max(600),
  scheduledFor: z3.string().optional()
});
router3.post(
  "/reminders",
  requireRole("SCHOOL_ADMIN", "BURSAR"),
  async (req, res) => {
    const body = parseBody(createReminderSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const invoiceId = validObjectId(body.invoiceId);
    if (!invoiceId) {
      res.status(400).json({ error: "Invalid invoiceId." });
      return;
    }
    const invoice = await FeeInvoiceModel.findOne({ _id: invoiceId, schoolId });
    if (!invoice || invoice.balanceGhs <= 0) {
      res.status(404).json({ error: "Outstanding invoice not found." });
      return;
    }
    const link = await GuardianLinkModel.findOne({
      schoolId,
      studentId: invoice.studentId,
      verified: true
    });
    const schedDate = body.scheduledFor ? new Date(body.scheduledFor) : /* @__PURE__ */ new Date();
    const dateBucket = schedDate.toISOString().slice(0, 13);
    const dedupeKey = `${schoolId}:${invoice._id}:${body.channel}:${dateBucket}`;
    const existing = await FeeReminderModel.findOne({ dedupeKey });
    if (existing) {
      res.status(409).json({ error: "A reminder for this invoice and channel was already scheduled for this period." });
      return;
    }
    const reminder = await FeeReminderModel.create({
      schoolId,
      invoiceId: invoice._id,
      studentId: invoice.studentId,
      guardianUserId: link?.parentUserId || null,
      channel: body.channel,
      subject: body.subject,
      message: body.message,
      scheduledFor: schedDate,
      status: "SCHEDULED",
      dedupeKey
    });
    if (schedDate <= /* @__PURE__ */ new Date()) {
      if (body.channel === "IN_APP" && link?.parentUserId) {
        await NotificationModel.create({
          schoolId,
          userId: link.parentUserId,
          title: body.subject,
          message: body.message,
          type: "FEE_REMINDER"
        });
        reminder.status = "SENT";
        reminder.sentAt = /* @__PURE__ */ new Date();
      } else if (body.channel === "EMAIL" && link?.parentUserId) {
        const user = await UserModel.findById(link.parentUserId);
        const r = user?.email ? await sendTransactionalEmail({ to: user.email, subject: body.subject, text: body.message }) : { status: "FAILED", error: "Guardian email missing." };
        reminder.status = r.status === "SENT" ? "SENT" : "FAILED";
        reminder.errorMessage = r.error || "";
        if (r.status === "SENT") reminder.sentAt = /* @__PURE__ */ new Date();
      } else if (body.channel === "SMS" && link?.parentUserId) {
        const user = await UserModel.findById(link.parentUserId);
        const r = user?.phone ? await sendSmsMessage({ toPhone: user.phone, message: body.message }) : { status: "FAILED", error: "Guardian phone missing." };
        reminder.status = r.status === "SENT" ? "SENT" : "FAILED";
        reminder.errorMessage = r.error || "";
        if (r.status === "SENT") reminder.sentAt = /* @__PURE__ */ new Date();
      } else {
        reminder.status = "FAILED";
        reminder.errorMessage = "No verified guardian account linked to this student.";
      }
      await reminder.save();
    }
    res.status(201).json({ reminder });
  }
);
router3.get("/announcements", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const role = req.authUser.role;
  const query = { schoolId };
  if (role === "STUDENT") {
    query.status = "PUBLISHED";
    query.audience = { $in: ["ALL", "STUDENTS"] };
  } else if (role === "PARENT") {
    query.status = "PUBLISHED";
    query.audience = { $in: ["ALL", "PARENTS"] };
  } else if (role === "CLASS_TEACHER" || role === "SUBJECT_TEACHER") {
    query.status = "PUBLISHED";
    query.audience = { $in: ["ALL", "TEACHERS"] };
  }
  const announcements = await AnnouncementModel.find(query).populate("createdBy", "fullName").sort({ createdAt: -1 }).lean();
  res.json({ announcements });
});
var announcementSchema2 = z3.object({
  title: z3.string().min(3).max(160),
  body: z3.string().min(10).max(3e3),
  category: z3.enum(["Reopening", "Exams", "Parent Meeting", "Event", "Emergency", "Holiday", "Fees", "Notice"]).default("Notice"),
  audience: z3.enum(["ALL", "TEACHERS", "PARENTS", "STUDENTS", "CLASS"]).default("ALL"),
  targetClassId: z3.string().nullable().optional(),
  status: z3.enum(["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
  scheduledFor: z3.string().nullable().optional()
});
router3.post(
  "/announcements",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(announcementSchema2, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const announcement = await AnnouncementModel.create({
      schoolId,
      title: body.title.trim(),
      body: body.body.trim(),
      category: body.category,
      audience: body.audience,
      targetClassId: body.targetClassId ? validObjectId(body.targetClassId) : null,
      status: body.status,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      publishedAt: body.status === "PUBLISHED" ? /* @__PURE__ */ new Date() : null,
      createdBy: req.authUser._id
    });
    if (body.status === "PUBLISHED") {
      const roleFilter = body.audience === "TEACHERS" ? { role: { $in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] } } : body.audience === "PARENTS" ? { role: "PARENT" } : body.audience === "STUDENTS" ? { role: "STUDENT" } : {};
      const recipients = await UserModel.find({
        schoolId,
        status: "ACTIVE",
        ...roleFilter
      }).select("_id");
      if (recipients.length > 0) {
        await NotificationModel.insertMany(
          recipients.map((r) => ({
            schoolId,
            userId: r._id,
            title: announcement.title,
            message: announcement.body.slice(0, 220),
            type: "ANNOUNCEMENT"
          }))
        );
      }
    }
    res.status(201).json({ announcement });
  }
);
router3.get(
  "/admissions",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const applications = await AdmissionApplicationModel.find({ schoolId: req.authUser.schoolId }).populate("applyingForClassId", "name level").populate("academicYearId", "name").sort({ createdAt: -1 }).lean();
    res.json({ applications });
  }
);
var admissionSchema = z3.object({
  applicantName: z3.string().min(2).max(120),
  gender: z3.enum(["Male", "Female"]),
  dateOfBirth: z3.string().max(20).optional(),
  applyingForClassId: z3.string().min(12),
  academicYearId: z3.string().min(12),
  guardianName: z3.string().min(2).max(120),
  guardianPhone: z3.string().min(7).max(30),
  guardianEmail: z3.string().email().optional().or(z3.literal("")),
  previousSchool: z3.string().max(120).optional(),
  notes: z3.string().max(600).optional()
});
router3.post(
  "/admissions",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(admissionSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const applicationNumber = `APP-${(/* @__PURE__ */ new Date()).getFullYear()}-${crypto6.randomInt(1e3, 9999)}`;
    const application = await AdmissionApplicationModel.create({
      schoolId,
      applicationNumber,
      applicantName: body.applicantName.trim(),
      gender: body.gender,
      dateOfBirth: body.dateOfBirth || "",
      applyingForClassId: validObjectId(body.applyingForClassId),
      academicYearId: validObjectId(body.academicYearId),
      guardianName: body.guardianName.trim(),
      guardianPhone: body.guardianPhone.trim(),
      guardianEmail: body.guardianEmail || "",
      previousSchool: body.previousSchool || "",
      notes: body.notes || "",
      status: "SUBMITTED"
    });
    res.status(201).json({ application });
  }
);
router3.post(
  "/admissions/:id/status",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const id = validObjectId(req.params.id);
    const status = String(req.body?.status || "");
    if (!id || !["UNDER_REVIEW", "ACCEPTED", "WAITLISTED", "REJECTED"].includes(status)) {
      res.status(400).json({ error: "Valid application ID and target status required." });
      return;
    }
    const app = await AdmissionApplicationModel.findOneAndUpdate(
      { _id: id, schoolId: req.authUser.schoolId },
      { status, reviewedBy: req.authUser._id },
      { new: true }
    );
    if (!app) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    res.json({ application: app });
  }
);
router3.post(
  "/admissions/:id/enroll",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid application ID." });
      return;
    }
    const app = await AdmissionApplicationModel.findOne({ _id: id, schoolId });
    if (!app) {
      res.status(404).json({ error: "Application not found." });
      return;
    }
    if (app.status === "ENROLLED" && app.enrolledStudentId) {
      res.status(409).json({ error: "Applicant has already been enrolled into the student database." });
      return;
    }
    if (app.status !== "ACCEPTED") {
      res.status(400).json({ error: "Only ACCEPTED applicants can be enrolled." });
      return;
    }
    const [cls, year] = await Promise.all([
      ClassRoomModel.findOne({ _id: app.applyingForClassId, schoolId }),
      AcademicYearModel.findOne({ _id: app.academicYearId, schoolId })
    ]);
    const admissionNumber = `ADM-${(/* @__PURE__ */ new Date()).getFullYear()}-${crypto6.randomInt(1e3, 9999)}`;
    const student = await StudentModel.create({
      schoolId,
      admissionNumber,
      fullName: app.applicantName,
      gender: app.gender,
      dateOfBirth: app.dateOfBirth,
      currentClassId: app.applyingForClassId,
      academicYearId: app.academicYearId,
      admissionDate: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
      guardianSummary: {
        name: app.guardianName,
        phone: app.guardianPhone,
        email: app.guardianEmail,
        relationship: "Parent/Guardian"
      },
      academicHistory: [
        {
          academicYearId: app.academicYearId,
          academicYearName: year?.name || "",
          classId: app.applyingForClassId,
          className: cls?.name || "",
          status: "ACTIVE"
        }
      ]
    });
    app.status = "ENROLLED";
    app.enrolledStudentId = student._id;
    await app.save();
    res.status(201).json({ student, application: app });
  }
);
router3.get(
  "/staff",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const staff = await StaffRecordModel.find({ schoolId: req.authUser.schoolId }).sort({ fullName: 1 }).lean();
    res.json({ staff });
  }
);
var staffSchema = z3.object({
  fullName: z3.string().min(2).max(120),
  department: z3.string().min(2).max(80),
  jobRole: z3.string().min(2).max(80),
  phone: z3.string().max(30).optional(),
  email: z3.string().email().optional().or(z3.literal("")),
  dateJoined: z3.string().min(8).max(20),
  responsibilities: z3.string().max(400).optional()
});
router3.post(
  "/staff",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(staffSchema, req, res);
    if (!body) return;
    const staffNumber = `STF-${(/* @__PURE__ */ new Date()).getFullYear()}-${crypto6.randomInt(100, 999)}`;
    const record = await StaffRecordModel.create({
      schoolId: req.authUser.schoolId,
      staffNumber,
      ...body
    });
    res.status(201).json({ staff: record });
  }
);
router3.post(
  "/staff/:id/leave-request",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid staff ID." });
      return;
    }
    const schema = z3.object({
      startDate: z3.string().min(8),
      endDate: z3.string().min(8),
      reason: z3.string().min(4).max(300)
    });
    const body = parseBody(schema, req, res);
    if (!body) return;
    const staff = await StaffRecordModel.findOne({ _id: id, schoolId: req.authUser.schoolId });
    if (!staff) {
      res.status(404).json({ error: "Staff record not found." });
      return;
    }
    staff.leaveRequests.push({
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      status: "PENDING"
    });
    await staff.save();
    res.status(201).json({ staff });
  }
);
router3.post(
  "/staff/:id/leave-request/:leaveId/review",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const id = validObjectId(req.params.id);
    const decision = String(req.body?.status || "");
    if (!id || !["APPROVED", "REJECTED"].includes(decision)) {
      res.status(400).json({ error: "Valid staff ID and APPROVED/REJECTED status required." });
      return;
    }
    const staff = await StaffRecordModel.findOne({ _id: id, schoolId: req.authUser.schoolId });
    if (!staff) {
      res.status(404).json({ error: "Staff record not found." });
      return;
    }
    const leave = staff.leaveRequests.id(req.params.leaveId);
    if (!leave) {
      res.status(404).json({ error: "Leave request not found." });
      return;
    }
    leave.status = decision;
    leave.reviewedBy = req.authUser._id;
    leave.reviewedAt = /* @__PURE__ */ new Date();
    if (decision === "APPROVED") staff.employmentStatus = "ON_LEAVE";
    await staff.save();
    res.json({ staff });
  }
);
router3.get("/timetables", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const query = { schoolId };
  if (req.query.classId && validObjectId(String(req.query.classId))) {
    query.classId = req.query.classId;
  }
  const slots = await TimetableSlotModel.find(query).populate("classId", "name").populate("subjectId", "name code").populate("teacherId", "fullName").sort({ dayOfWeek: 1, periodNumber: 1 }).lean();
  res.json({ slots });
});
var timetableSlotSchema2 = z3.object({
  academicYearId: z3.string().min(12),
  termId: z3.string().min(12),
  classId: z3.string().min(12),
  subjectId: z3.string().nullable().optional(),
  teacherId: z3.string().nullable().optional(),
  dayOfWeek: z3.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]),
  periodNumber: z3.number().int().min(1).max(12),
  startTime: z3.string().min(4).max(10),
  endTime: z3.string().min(4).max(10),
  room: z3.string().max(40).optional(),
  isBreak: z3.boolean().default(false),
  breakLabel: z3.string().max(40).optional()
});
router3.post(
  "/timetables",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(timetableSlotSchema2, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);
    const classConflict = await TimetableSlotModel.findOne({
      schoolId,
      termId,
      classId,
      dayOfWeek: body.dayOfWeek,
      periodNumber: body.periodNumber
    });
    if (classConflict) {
      res.status(409).json({
        error: `Scheduling conflict: This class already has a slot on ${body.dayOfWeek} Period ${body.periodNumber}.`
      });
      return;
    }
    if (!body.isBreak && body.teacherId) {
      const teacherId = validObjectId(body.teacherId);
      const teacherConflict = await TimetableSlotModel.findOne({
        schoolId,
        termId,
        teacherId,
        dayOfWeek: body.dayOfWeek,
        periodNumber: body.periodNumber
      }).populate("classId", "name");
      if (teacherConflict) {
        res.status(409).json({
          error: `Teacher conflict: Assigned teacher is already scheduled with ${teacherConflict.classId?.name || "another class"} on ${body.dayOfWeek} Period ${body.periodNumber}.`
        });
        return;
      }
    }
    if (!body.isBreak && body.room?.trim()) {
      const roomConflict = await TimetableSlotModel.findOne({
        schoolId,
        termId,
        room: body.room.trim(),
        dayOfWeek: body.dayOfWeek,
        periodNumber: body.periodNumber
      });
      if (roomConflict) {
        res.status(409).json({
          error: `Room conflict: ${body.room} is already booked on ${body.dayOfWeek} Period ${body.periodNumber}.`
        });
        return;
      }
    }
    const slot = await TimetableSlotModel.create({
      schoolId,
      academicYearId,
      termId,
      classId,
      subjectId: body.isBreak || !body.subjectId ? null : validObjectId(body.subjectId),
      teacherId: body.isBreak || !body.teacherId ? null : validObjectId(body.teacherId),
      dayOfWeek: body.dayOfWeek,
      periodNumber: body.periodNumber,
      startTime: body.startTime,
      endTime: body.endTime,
      room: body.room?.trim() || "",
      isBreak: body.isBreak,
      breakLabel: body.breakLabel || ""
    });
    res.status(201).json({ slot });
  }
);
router3.delete(
  "/timetables/:id",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid slot ID." });
      return;
    }
    await TimetableSlotModel.deleteOne({ _id: id, schoolId: req.authUser.schoolId });
    res.json({ ok: true });
  }
);
router3.get(
  "/analytics",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const invoiceFilter = { schoolId, status: { $ne: "VOID" } };
    if (req.query.academicYearId && validObjectId(String(req.query.academicYearId))) {
      invoiceFilter.academicYearId = req.query.academicYearId;
    }
    if (req.query.termId && validObjectId(String(req.query.termId))) {
      invoiceFilter.termId = req.query.termId;
    }
    const [invoices, payments, admissions, staff] = await Promise.all([
      FeeInvoiceModel.find(invoiceFilter).populate("studentId", "fullName").lean(),
      FeePaymentModel.find({ schoolId, status: "VERIFIED" }).sort({ createdAt: -1 }).lean(),
      AdmissionApplicationModel.find({ schoolId }).lean(),
      StaffRecordModel.find({ schoolId }).lean()
    ]);
    const totalBilledGhs = roundCurrency(invoices.reduce((s, i) => s + i.totalGhs, 0));
    const totalCollectedGhs = roundCurrency(invoices.reduce((s, i) => s + i.amountPaidGhs, 0));
    const outstandingGhs = roundCurrency(invoices.reduce((s, i) => s + i.balanceGhs, 0));
    const overdueCount = invoices.filter((i) => i.status === "OVERDUE").length;
    const collectionRatePercent = totalBilledGhs > 0 ? Math.round(totalCollectedGhs / totalBilledGhs * 1e3) / 10 : 0;
    const categoryTotals = /* @__PURE__ */ new Map();
    for (const inv of invoices) {
      for (const item of inv.items) {
        categoryTotals.set(
          item.category,
          roundCurrency((categoryTotals.get(item.category) || 0) + item.amountGhs)
        );
      }
    }
    res.json({
      finance: {
        totalBilledGhs,
        totalCollectedGhs,
        outstandingGhs,
        overdueCount,
        collectionRatePercent,
        invoiceCount: invoices.length,
        paymentCount: payments.length,
        byCategory: Array.from(categoryTotals.entries()).map(([category, amountGhs]) => ({
          category,
          amountGhs
        }))
      },
      admissions: {
        total: admissions.length,
        submitted: admissions.filter((a) => a.status === "SUBMITTED").length,
        accepted: admissions.filter((a) => a.status === "ACCEPTED").length,
        enrolled: admissions.filter((a) => a.status === "ENROLLED").length
      },
      staff: {
        total: staff.length,
        active: staff.filter((s) => s.employmentStatus === "ACTIVE").length,
        onLeave: staff.filter((s) => s.employmentStatus === "ON_LEAVE").length
      }
    });
  }
);
router3.get(
  "/analytics/export/csv",
  requireRole("SCHOOL_ADMIN", "BURSAR", "HEADTEACHER"),
  async (req, res) => {
    const invoices = await FeeInvoiceModel.find({
      schoolId: req.authUser.schoolId,
      status: { $ne: "VOID" }
    }).populate("studentId", "fullName admissionNumber").lean();
    const csv = generateCsvString(
      ["Invoice Number", "Admission No", "Student Name", "Billed (GH\u20B5)", "Paid (GH\u20B5)", "Balance (GH\u20B5)", "Due Date", "Status"],
      invoices.map((inv) => {
        const st = inv.studentId;
        return [
          inv.invoiceNumber,
          st?.admissionNumber || "",
          st?.fullName || "",
          inv.totalGhs.toFixed(2),
          inv.amountPaidGhs.toFixed(2),
          inv.balanceGhs.toFixed(2),
          inv.dueDate,
          inv.status
        ];
      })
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="nexasua-financial-summary.csv"');
    res.send(csv);
  }
);
router3.get(
  "/analytics/export/pdf",
  requireRole("SCHOOL_ADMIN", "BURSAR", "HEADTEACHER"),
  async (req, res) => {
    const invoices = await FeeInvoiceModel.find({
      schoolId: req.authUser.schoolId,
      status: { $ne: "VOID" }
    }).populate("studentId", "fullName").lean();
    const totalBilledGhs = roundCurrency(invoices.reduce((s, i) => s + i.totalGhs, 0));
    const totalCollectedGhs = roundCurrency(invoices.reduce((s, i) => s + i.amountPaidGhs, 0));
    const outstandingGhs = roundCurrency(invoices.reduce((s, i) => s + i.balanceGhs, 0));
    const collectionRatePercent = totalBilledGhs > 0 ? Math.round(totalCollectedGhs / totalBilledGhs * 1e3) / 10 : 0;
    const pdf = await generateFinancialSummaryPdfBuffer({
      schoolName: req.schoolDoc.name,
      generatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      }),
      totalBilledGhs,
      totalCollectedGhs,
      outstandingGhs,
      collectionRatePercent,
      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        studentName: inv.studentId?.fullName || "Student",
        totalGhs: inv.totalGhs,
        paidGhs: inv.amountPaidGhs,
        balanceGhs: inv.balanceGhs,
        status: inv.status
      }))
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="nexasua-financial-summary.pdf"');
    res.send(pdf);
  }
);
var completeRoutes_default = router3;

// server/routes/publicRoutes.ts
import crypto7 from "crypto";
import express4 from "express";
import rateLimit2 from "express-rate-limit";
import jwt3 from "jsonwebtoken";
import { z as z4 } from "zod";
var router4 = express4.Router();
var publicLimiter = rateLimit2({
  windowMs: 15 * 60 * 1e3,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." }
});
router4.get("/health", async (_req, res) => {
  const dbState2 = getDbState();
  const integrations = getPlatformIntegrationsStatus(dbState2);
  let superAdminInitialized = false;
  let pricingBands = DEFAULT_PRICING_BANDS;
  let planCatalog = DEFAULT_PLAN_CATALOG;
  let trialDays = 7;
  let threeTermDiscountPercent = 10;
  let platformAnnouncement = "";
  let dbPing = { ok: false };
  if (isDbConnected()) {
    dbPing = await pingDatabase();
    const cfg = await ensureSystemConfig();
    superAdminInitialized = Boolean(cfg.superAdminInitialized);
    if (cfg.pricingBands?.length) {
      pricingBands = cfg.pricingBands;
    }
    if (cfg.planCatalog?.length) {
      planCatalog = cfg.planCatalog;
    }
    trialDays = cfg.trialDays;
    threeTermDiscountPercent = cfg.threeTermDiscountPercent;
    platformAnnouncement = cfg.platformAnnouncement || "";
  }
  const envCreds = getSuperAdminEnvCredentials();
  const adminEnvCreds = getSchoolAdminEnvCredentials();
  res.json({
    ok: true,
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    dbConnected: isDbConnected(),
    dbPing,
    superAdminInitialized: superAdminInitialized || envCreds.configured,
    superAdminManagedBySecrets: envCreds.configured,
    adminManagedBySecrets: adminEnvCreds.configured,
    googleOAuthEnabled: isGoogleOAuthConfigured(),
    integrations,
    pricing: {
      currency: "GH\u20B5",
      trialDays,
      threeTermDiscountPercent,
      bands: pricingBands,
      plans: planCatalog
    },
    platformAnnouncement
  });
});
var quoteSchema = z4.object({
  studentCount: z4.number().int().min(1).max(1e5),
  plan: z4.enum(["CORE", "COMPLETE"]),
  billingCycle: z4.enum(["TERM", "THREE_TERMS"]),
  promoCode: z4.string().max(40).optional()
});
router4.post("/pricing-quote", async (req, res) => {
  const body = parseBody(quoteSchema, req, res);
  if (!body) return;
  let bands = DEFAULT_PRICING_BANDS;
  let threeTermDiscountPercent = 10;
  let promoDiscountPercent = 0;
  if (isDbConnected()) {
    const cfg = await ensureSystemConfig();
    if (cfg.pricingBands?.length) {
      bands = cfg.pricingBands;
    }
    threeTermDiscountPercent = cfg.threeTermDiscountPercent;
    if (body.promoCode) {
      const codeUpper = body.promoCode.trim().toUpperCase();
      const offer = cfg.promotionalOffers.find(
        (o) => o.code === codeUpper && o.active && (o.applicablePlan === "ALL" || o.applicablePlan === body.plan) && (!o.expiresAt || new Date(o.expiresAt) > /* @__PURE__ */ new Date())
      );
      if (offer) {
        promoDiscountPercent = offer.discountPercent;
      }
    }
  }
  const quote = calculateSubscriptionPrice({
    studentCount: body.studentCount,
    plan: body.plan,
    billingCycle: body.billingCycle,
    bands,
    threeTermDiscountPercent,
    promoDiscountPercent
  });
  res.json(quote);
});
var registerSchoolSchema = z4.object({
  schoolName: z4.string().min(3).max(160),
  schoolType: z4.enum(["Private", "Public", "Mission", "International"]),
  educationalLevels: z4.array(z4.enum(["Kindergarten", "Primary", "Junior High School", "Senior High School"])).min(1),
  country: z4.string().min(2).max(80).default("Ghana"),
  region: z4.string().min(2).max(80),
  town: z4.string().min(2).max(80),
  address: z4.string().min(4).max(240),
  schoolEmail: z4.string().email(),
  schoolPhone: z4.string().min(7).max(30),
  adminName: z4.string().min(2).max(120),
  adminEmail: z4.string().email(),
  adminPassword: z4.string().min(8).max(128).optional().or(z4.literal("")),
  googleOnboardingToken: z4.string().optional(),
  studentPopulation: z4.number().int().min(1).max(1e5),
  selectedPlan: z4.enum(["CORE", "COMPLETE"]),
  termVacationDate: z4.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a valid term vacation date (YYYY-MM-DD)."),
  dataConsentAccepted: z4.literal(true, {
    message: "Data protection consent must be accepted."
  })
});
router4.post("/register-school", publicLimiter, requireDb, async (req, res) => {
  const body = parseBody(registerSchoolSchema, req, res);
  if (!body) return;
  if (body.termVacationDate <= getAccraTodayDateString()) {
    res.status(400).json({
      error: "Please choose an upcoming term vacation date in the future."
    });
    return;
  }
  let verifiedGoogle = null;
  if (body.googleOnboardingToken) {
    try {
      const decoded = jwt3.verify(body.googleOnboardingToken, getJwtSecret());
      if (decoded.stage === "GOOGLE_ONBOARDING" && decoded.email && decoded.googleId) {
        verifiedGoogle = {
          email: decoded.email.toLowerCase().trim(),
          fullName: decoded.fullName || body.adminName,
          googleId: decoded.googleId
        };
      }
    } catch {
      res.status(400).json({ error: "Google verification expired. Please reconnect with Google or set a password." });
      return;
    }
  }
  if (!verifiedGoogle && (!body.adminPassword || body.adminPassword.length < 8)) {
    res.status(400).json({ error: "Administrator password (minimum 8 characters) is required." });
    return;
  }
  const finalAdminEmail = verifiedGoogle ? verifiedGoogle.email : body.adminEmail.toLowerCase().trim();
  const superCreds = getSuperAdminEnvCredentials();
  if (superCreds.configured && finalAdminEmail === superCreds.email) {
    res.status(409).json({ error: "This email address is reserved for the platform Super Admin." });
    return;
  }
  const existingUser = await UserModel.findOne({ email: finalAdminEmail });
  if (existingUser) {
    res.status(409).json({ error: "An account with this administrator email already exists." });
    return;
  }
  const pendingCode = `PEND-${crypto7.randomBytes(3).toString("hex").toUpperCase()}`;
  const verificationToken = crypto7.randomBytes(24).toString("hex");
  const school = await SchoolModel.create({
    name: body.schoolName.trim(),
    schoolCode: pendingCode,
    schoolType: body.schoolType,
    educationalLevels: body.educationalLevels,
    country: body.country.trim(),
    region: body.region.trim(),
    town: body.town.trim(),
    address: body.address.trim(),
    email: body.schoolEmail.toLowerCase().trim(),
    phone: body.schoolPhone.trim(),
    status: "PENDING",
    studentPopulationEstimate: body.studentPopulation,
    requestedPlan: body.selectedPlan,
    termVacationDate: body.termVacationDate,
    dataProtectionConsentAt: /* @__PURE__ */ new Date()
  });
  const adminUser = await UserModel.create({
    email: finalAdminEmail,
    passwordHash: body.adminPassword ? hashPassword(body.adminPassword) : "",
    googleId: verifiedGoogle ? verifiedGoogle.googleId : "",
    authProvider: verifiedGoogle ? body.adminPassword ? "HYBRID" : "GOOGLE" : "LOCAL",
    fullName: (verifiedGoogle ? verifiedGoogle.fullName : body.adminName).trim(),
    phone: body.schoolPhone.trim(),
    role: "SCHOOL_ADMIN",
    schoolId: school._id,
    emailVerified: Boolean(verifiedGoogle),
    verificationTokenHash: verifiedGoogle ? "" : hashToken(verificationToken),
    status: "ACTIVE",
    dataConsentAcceptedAt: /* @__PURE__ */ new Date()
  });
  const superAdmins = await UserModel.find({ role: "SUPER_ADMIN", status: "ACTIVE" }).select("_id");
  if (superAdmins.length > 0) {
    await NotificationModel.insertMany(
      superAdmins.map((sa) => ({
        schoolId: null,
        userId: sa._id,
        title: "New School Registration Pending",
        message: `${school.name} (${school.region}) applied for NexaSua ${school.requestedPlan}.`,
        type: "SCHOOL_APPLICATION"
      }))
    );
  }
  let emailVerificationStatus = "Google email verified automatically.";
  if (!verifiedGoogle) {
    const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
    const emailResult = await sendTransactionalEmail({
      to: adminUser.email,
      subject: "Verify your NexaSua School Administrator Email",
      text: `Hello ${adminUser.fullName},

Thank you for registering ${school.name} on NexaSua.
Verify your email at: ${baseUrl}/login?verifyToken=${verificationToken}

Your school application is currently pending review by NexaFlow Technologies.`
    });
    emailVerificationStatus = emailResult.status === "SENT" ? "Verification email sent." : "Email service not configured; verify via administrator dashboard or contact support.";
  }
  await writeAuditLog({
    schoolId: String(school._id),
    userId: String(adminUser._id),
    userEmail: adminUser.email,
    userRole: "SCHOOL_ADMIN",
    action: "SCHOOL_REGISTERED",
    resourceType: "School",
    resourceId: String(school._id),
    details: { plan: body.selectedPlan, population: body.studentPopulation },
    ipAddress: req.ip
  });
  res.status(201).json({
    message: "School application submitted and awaiting NexaFlow Super Admin approval.",
    school: {
      id: school._id,
      name: school.name,
      status: school.status,
      requestedPlan: school.requestedPlan
    },
    emailVerificationStatus
  });
});
var customRequestSchema = z4.object({
  schoolName: z4.string().min(2).max(160),
  contactPerson: z4.string().min(2).max(120),
  email: z4.string().email(),
  phone: z4.string().min(7).max(30),
  location: z4.string().min(2).max(120),
  studentPopulation: z4.string().min(1).max(40),
  requestedFeatures: z4.array(z4.string().max(100)).max(20).default([]),
  budgetRange: z4.string().min(2).max(80),
  timeline: z4.string().min(2).max(80),
  requirements: z4.string().max(2500).default("")
});
router4.post("/custom-request", publicLimiter, requireDb, async (req, res) => {
  const body = parseBody(customRequestSchema, req, res);
  if (!body) return;
  const ref = `NXC-${Date.now().toString().slice(-6)}-${crypto7.randomBytes(2).toString("hex").toUpperCase()}`;
  const doc = await CustomProjectRequestModel.create({
    referenceNumber: ref,
    ...body,
    status: "NEW"
  });
  const superAdmins = await UserModel.find({ role: "SUPER_ADMIN", status: "ACTIVE" }).select("_id");
  if (superAdmins.length > 0) {
    await NotificationModel.insertMany(
      superAdmins.map((sa) => ({
        schoolId: null,
        userId: sa._id,
        title: "New NexaSua Custom Inquiry",
        message: `${body.schoolName} (${body.location}) submitted a custom system inquiry (${ref}).`,
        type: "CUSTOM_REQUEST"
      }))
    );
  }
  res.status(201).json({
    message: "Custom school system inquiry received by NexaFlow Technologies.",
    referenceNumber: doc.referenceNumber
  });
});
var contactSchema = z4.object({
  contactName: z4.string().min(2).max(120),
  contactEmail: z4.string().email(),
  subject: z4.string().min(3).max(160),
  category: z4.string().max(60).default("General Inquiry"),
  description: z4.string().min(10).max(2e3)
});
router4.post("/contact", publicLimiter, requireDb, async (req, res) => {
  const body = parseBody(contactSchema, req, res);
  if (!body) return;
  const ticketNumber = `TKT-${Date.now().toString().slice(-6)}-${crypto7.randomBytes(2).toString("hex").toUpperCase()}`;
  await SupportTicketModel.create({
    ticketNumber,
    contactName: body.contactName.trim(),
    contactEmail: body.contactEmail.toLowerCase().trim(),
    subject: body.subject.trim(),
    category: body.category,
    priority: "MEDIUM",
    description: body.description.trim(),
    status: "OPEN"
  });
  res.status(201).json({
    message: "Your inquiry has been logged with NexaFlow support.",
    ticketNumber
  });
});
router4.get("/verify-report/:token", requireDb, async (req, res) => {
  const token = String(req.params.token || "").trim();
  if (!token || token.length > 120) {
    res.status(400).json({ valid: false, error: "Invalid verification token." });
    return;
  }
  const report = await ReportCardModel.findOne({ verificationToken: token }).lean();
  if (!report) {
    res.status(404).json({ valid: false, error: "Report card reference could not be verified." });
    return;
  }
  const [school, year, term] = await Promise.all([
    SchoolModel.findById(report.schoolId).select("name town region").lean(),
    AcademicYearModel.findById(report.academicYearId).select("name").lean(),
    TermModel.findById(report.termId).select("name").lean()
  ]);
  res.json({
    valid: true,
    referenceNumber: report.referenceNumber,
    schoolName: school?.name || "Verified School",
    location: school ? `${school.town}, ${school.region}` : "",
    academicYear: year?.name || "",
    termName: term?.name || "",
    issueDate: report.issuedAt,
    note: "Authentic terminal report record. Student personal details and grades are protected."
  });
});
var publicRoutes_default = router4;

// server/routes/schoolCoreRoutes.ts
import crypto8 from "crypto";
import express5 from "express";
import multer2 from "multer";
import { z as z5 } from "zod";
var router5 = express5.Router();
var upload2 = multer2({
  storage: multer2.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});
router5.use(requireDb, authenticate, requireSchoolContext, requireActiveSubscriptionWrite);
router5.get("/overview", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const role = req.authUser.role;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (role === "STUDENT") {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser._id }).populate("currentClassId", "name level").lean();
    if (!student) {
      res.json({ role, student: null, publishedResultsCount: 0, attendanceSummary: null, notifications: [] });
      return;
    }
    const [publishedCount, attendanceRecords, notifications2] = await Promise.all([
      AssessmentScoreModel.countDocuments({ schoolId, studentId: student._id, status: "PUBLISHED" }),
      AttendanceModel.find({ schoolId, studentId: student._id }).lean(),
      NotificationModel.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).limit(10).lean()
    ]);
    const summary = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter((a) => a.status === "PRESENT").length,
      absent: attendanceRecords.filter((a) => a.status === "ABSENT").length,
      late: attendanceRecords.filter((a) => a.status === "LATE").length,
      excused: attendanceRecords.filter((a) => a.status === "EXCUSED").length
    };
    res.json({ role, student, publishedResultsCount: publishedCount, attendanceSummary: summary, notifications: notifications2 });
    return;
  }
  if (role === "PARENT") {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser._id,
      verified: true
    }).populate({
      path: "studentId",
      populate: { path: "currentClassId", select: "name level" }
    }).lean();
    const notifications2 = await NotificationModel.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({ role, children: links.map((l) => l.studentId).filter(Boolean), notifications: notifications2 });
    return;
  }
  if (role === "CLASS_TEACHER" || role === "SUBJECT_TEACHER") {
    const assignments = await TeacherAssignmentModel.find({
      schoolId,
      teacherId: req.authUser._id
    }).populate("classId", "name level").populate("subjectId", "name code").lean();
    const assignedClassIds = [...new Set(assignments.map((a) => String(a.classId?._id || a.classId)))];
    const [studentCount2, pendingMarks, submittedMarks, publishedMarks, notifications2] = await Promise.all([
      StudentModel.countDocuments({
        schoolId,
        currentClassId: { $in: assignedClassIds },
        status: "ACTIVE"
      }),
      AssessmentScoreModel.countDocuments({
        schoolId,
        teacherId: req.authUser._id,
        status: "DRAFT"
      }),
      AssessmentScoreModel.countDocuments({
        schoolId,
        teacherId: req.authUser._id,
        status: { $in: ["SUBMITTED", "REVIEWED", "APPROVED"] }
      }),
      AssessmentScoreModel.countDocuments({
        schoolId,
        teacherId: req.authUser._id,
        status: "PUBLISHED"
      }),
      NotificationModel.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).limit(10).lean()
    ]);
    res.json({
      role,
      assignments,
      metrics: {
        assignedClasses: assignedClassIds.length,
        assignedSubjects: assignments.length,
        studentsInAssignedClasses: studentCount2,
        draftScores: pendingMarks,
        submittedScores: submittedMarks,
        publishedScores: publishedMarks
      },
      notifications: notifications2
    });
    return;
  }
  const [
    studentCount,
    teacherCount,
    classCount,
    subjectCount,
    pendingApprovalScores,
    publishedScores,
    todayPresent,
    todayTotal,
    notifications
  ] = await Promise.all([
    StudentModel.countDocuments({ schoolId, status: "ACTIVE" }),
    UserModel.countDocuments({
      schoolId,
      role: { $in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] },
      status: "ACTIVE"
    }),
    ClassRoomModel.countDocuments({ schoolId }),
    SubjectModel.countDocuments({ schoolId }),
    AssessmentScoreModel.countDocuments({
      schoolId,
      status: { $in: ["SUBMITTED", "REVIEWED"] }
    }),
    AssessmentScoreModel.countDocuments({ schoolId, status: "PUBLISHED" }),
    AttendanceModel.countDocuments({ schoolId, date: today, status: { $in: ["PRESENT", "LATE"] } }),
    AttendanceModel.countDocuments({ schoolId, date: today }),
    NotificationModel.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).limit(10).lean()
  ]);
  res.json({
    role,
    metrics: {
      studentCount,
      teacherCount,
      classCount,
      subjectCount,
      pendingApprovalScores,
      publishedScores,
      todayAttendanceMarked: todayTotal,
      todayAttendancePresent: todayPresent
    },
    onboardingSteps: req.schoolDoc.onboardingSteps,
    dashboardSettings: req.schoolDoc.dashboardSettings,
    subscription: req.subscriptionDoc,
    notifications
  });
});
router5.get("/notifications", async (req, res) => {
  const notifications = await NotificationModel.find({ userId: req.authUser._id }).sort({ createdAt: -1 }).limit(40).lean();
  res.json({ notifications });
});
router5.post("/notifications/:id/read", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid notification ID." });
    return;
  }
  await NotificationModel.updateOne({ _id: id, userId: req.authUser._id }, { read: true });
  res.json({ ok: true });
});
router5.get(
  "/settings",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "BURSAR"),
  async (req, res) => {
    const school = await SchoolModel.findById(req.authUser.schoolId).select("-paymentConfig.paystackSecretEncrypted").lean();
    res.json({ school });
  }
);
var updateSettingsSchema = z5.object({
  motto: z5.string().max(180).optional(),
  phone: z5.string().min(7).max(30).optional(),
  address: z5.string().min(3).max(240).optional(),
  logoDataUrl: z5.string().max(15e5).optional(),
  dataRetentionYears: z5.number().int().min(1).max(25).optional(),
  reportCardSettings: z5.object({
    headteacherName: z5.string().max(120).optional(),
    showClassPosition: z5.boolean().optional(),
    showAttendanceSummary: z5.boolean().optional(),
    showQrVerification: z5.boolean().optional(),
    footerNote: z5.string().max(240).optional(),
    nextTermReopeningDate: z5.string().max(40).optional()
  }).optional(),
  dashboardSettings: z5.object({
    customTitle: z5.string().max(120).optional(),
    welcomeMessage: z5.string().max(400).optional(),
    primaryColor: z5.string().regex(/^#[0-9A-Fa-f]{6}$/, "Primary color must be a valid 6-digit hex color.").optional(),
    accentColor: z5.string().regex(/^#[0-9A-Fa-f]{6}$/, "Accent color must be a valid 6-digit hex color.").optional(),
    defaultLandingTab: z5.enum([
      "overview",
      "students",
      "academics",
      "marks",
      "reports",
      "attendance",
      "analytics",
      "finance",
      "operations"
    ]).optional(),
    showSubscriptionBanner: z5.boolean().optional(),
    showMetricsCards: z5.boolean().optional(),
    showOnboardingChecklist: z5.boolean().optional(),
    showNotificationsWidget: z5.boolean().optional(),
    showSchoolLogoInSidebar: z5.boolean().optional()
  }).optional(),
  paymentConfig: z5.object({
    paystackPublicKey: z5.string().max(120).optional(),
    paystackSecretKey: z5.string().max(120).optional(),
    settlementAccountName: z5.string().max(120).optional(),
    mobileMoneyInstructions: z5.string().max(400).optional(),
    bankTransferInstructions: z5.string().max(400).optional()
  }).optional()
});
router5.put(
  "/settings",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(updateSettingsSchema, req, res);
    if (!body) return;
    const school = req.schoolDoc;
    if (body.motto !== void 0) school.motto = body.motto;
    if (body.phone !== void 0) school.phone = body.phone;
    if (body.address !== void 0) school.address = body.address;
    if (body.dataRetentionYears !== void 0) school.dataRetentionYears = body.dataRetentionYears;
    if (body.logoDataUrl !== void 0) {
      if (body.logoDataUrl && !body.logoDataUrl.startsWith("data:image/")) {
        res.status(400).json({ error: "Logo must be a valid PNG/JPEG image data URL." });
        return;
      }
      school.logoDataUrl = body.logoDataUrl;
      if (body.logoDataUrl) school.onboardingSteps.logoUploaded = true;
    }
    if (body.reportCardSettings) {
      school.reportCardSettings = {
        ...school.reportCardSettings,
        ...body.reportCardSettings
      };
      school.onboardingSteps.reportCardCustomized = true;
    }
    if (body.dashboardSettings) {
      school.dashboardSettings = {
        ...school.dashboardSettings,
        ...body.dashboardSettings,
        ...body.dashboardSettings.customTitle !== void 0 ? { customTitle: body.dashboardSettings.customTitle.trim() } : {},
        ...body.dashboardSettings.welcomeMessage !== void 0 ? { welcomeMessage: body.dashboardSettings.welcomeMessage.trim() } : {}
      };
    }
    if (body.paymentConfig) {
      const pc = body.paymentConfig;
      if (pc.paystackPublicKey !== void 0) {
        school.paymentConfig.paystackPublicKey = pc.paystackPublicKey.trim();
      }
      if (pc.paystackSecretKey && pc.paystackSecretKey.trim().startsWith("sk_")) {
        school.paymentConfig.paystackSecretEncrypted = encryptSecret(pc.paystackSecretKey.trim());
      }
      if (pc.settlementAccountName !== void 0) {
        school.paymentConfig.settlementAccountName = pc.settlementAccountName.trim();
      }
      if (pc.mobileMoneyInstructions !== void 0) {
        school.paymentConfig.mobileMoneyInstructions = pc.mobileMoneyInstructions.trim();
      }
      if (pc.bankTransferInstructions !== void 0) {
        school.paymentConfig.bankTransferInstructions = pc.bankTransferInstructions.trim();
      }
      school.paymentConfig.isConfigured = Boolean(
        school.paymentConfig.paystackPublicKey && school.paymentConfig.paystackSecretEncrypted
      );
    }
    school.onboardingSteps.profileCompleted = true;
    await school.save();
    await writeAuditLog({
      schoolId: String(school._id),
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: "SCHOOL_SETTINGS_UPDATED",
      resourceType: "School",
      resourceId: String(school._id),
      ipAddress: req.ip
    });
    const sanitized = await SchoolModel.findById(school._id).select("-paymentConfig.paystackSecretEncrypted").lean();
    res.json({ school: sanitized });
  }
);
router5.get("/academic-years", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const [years, terms] = await Promise.all([
    AcademicYearModel.find({ schoolId }).sort({ startDate: -1 }).lean(),
    TermModel.find({ schoolId }).sort({ startDate: 1 }).lean()
  ]);
  res.json({ academicYears: years, terms });
});
var yearSchema = z5.object({
  name: z5.string().min(4).max(40),
  startDate: z5.string().min(8).max(20),
  endDate: z5.string().min(8).max(20),
  isCurrent: z5.boolean().default(true)
});
router5.post(
  "/academic-years",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(yearSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    if (body.isCurrent) {
      await AcademicYearModel.updateMany({ schoolId }, { isCurrent: false });
    }
    const year = await AcademicYearModel.create({ schoolId, ...body });
    await SchoolModel.updateOne(
      { _id: schoolId },
      { "onboardingSteps.academicYearSet": true }
    );
    res.status(201).json({ academicYear: year });
  }
);
var termSchema2 = z5.object({
  academicYearId: z5.string().min(12),
  name: z5.string().min(3).max(40),
  startDate: z5.string().min(8).max(20),
  endDate: z5.string().min(8).max(20),
  reopeningDate: z5.string().max(20).optional(),
  isCurrent: z5.boolean().default(true)
});
router5.post(
  "/terms",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(termSchema2, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const yearId = validObjectId(body.academicYearId);
    if (!yearId || !await AcademicYearModel.exists({ _id: yearId, schoolId })) {
      res.status(404).json({ error: "Academic year not found in this school." });
      return;
    }
    if (body.isCurrent) {
      await TermModel.updateMany({ schoolId }, { isCurrent: false });
    }
    const term = await TermModel.create({
      schoolId,
      academicYearId: yearId,
      name: body.name.trim(),
      startDate: body.startDate,
      endDate: body.endDate,
      reopeningDate: body.reopeningDate || "",
      isCurrent: body.isCurrent
    });
    await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.termSet": true });
    res.status(201).json({ term });
  }
);
router5.get("/classes", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const classes = await ClassRoomModel.find({ schoolId }).populate("classTeacherId", "fullName email").sort({ level: 1, name: 1 }).lean();
  res.json({ classes });
});
var classSchema = z5.object({
  name: z5.string().min(2).max(60),
  level: z5.enum(["Kindergarten", "Primary", "Junior High School", "Senior High School"]),
  capacity: z5.number().int().min(1).max(300).default(45),
  room: z5.string().max(40).optional(),
  classTeacherId: z5.string().nullable().optional()
});
router5.post(
  "/classes",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(classSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    let teacherId = null;
    if (body.classTeacherId) {
      teacherId = validObjectId(body.classTeacherId);
      if (!teacherId || !await UserModel.exists({ _id: teacherId, schoolId })) {
        res.status(400).json({ error: "Selected class teacher does not belong to this school." });
        return;
      }
    }
    const cls = await ClassRoomModel.create({
      schoolId,
      name: body.name.trim(),
      level: body.level,
      capacity: body.capacity,
      room: body.room || "",
      classTeacherId: teacherId
    });
    await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.classesCreated": true });
    res.status(201).json({ classRoom: cls });
  }
);
router5.get("/subjects", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const subjects = await SubjectModel.find({ schoolId }).sort({ name: 1 }).lean();
  res.json({ subjects });
});
var subjectSchema2 = z5.object({
  name: z5.string().min(2).max(80),
  code: z5.string().min(2).max(16),
  level: z5.enum(["Kindergarten", "Primary", "Junior High School", "Senior High School", "All"]).default("All"),
  isCore: z5.boolean().default(true)
});
router5.post(
  "/subjects",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(subjectSchema2, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const subject = await SubjectModel.create({
      schoolId,
      name: body.name.trim(),
      code: body.code.toUpperCase().trim(),
      level: body.level,
      isCore: body.isCore
    });
    await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.subjectsConfigured": true });
    res.status(201).json({ subject });
  }
);
router5.get(
  "/users",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const roleFilter = req.query.role ? String(req.query.role) : void 0;
    const query = { schoolId };
    if (roleFilter) query.role = roleFilter;
    const users = await UserModel.find(query).select("-passwordHash -mfaSecretEncrypted -mfaBackupCodesHash -verificationTokenHash -resetTokenHash").sort({ createdAt: -1 }).lean();
    res.json({ users });
  }
);
var createSchoolUserSchema = z5.object({
  fullName: z5.string().min(2).max(120),
  email: z5.string().email(),
  phone: z5.string().max(30).optional(),
  password: z5.string().min(8).max(128),
  role: z5.enum([
    "HEADTEACHER",
    "CLASS_TEACHER",
    "SUBJECT_TEACHER",
    "BURSAR",
    "ADMIN_STAFF",
    "PARENT",
    "STUDENT"
  ])
});
router5.post(
  "/users",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(createSchoolUserSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const exists = await UserModel.findOne({ email: body.email.toLowerCase().trim() });
    if (exists) {
      res.status(409).json({ error: "A user with this email already exists." });
      return;
    }
    const user = await UserModel.create({
      schoolId,
      fullName: body.fullName.trim(),
      email: body.email.toLowerCase().trim(),
      phone: body.phone?.trim() || "",
      passwordHash: hashPassword(body.password),
      role: body.role,
      emailVerified: true,
      status: "ACTIVE"
    });
    if (body.role === "CLASS_TEACHER" || body.role === "SUBJECT_TEACHER") {
      await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.teachersInvited": true });
    }
    await writeAuditLog({
      schoolId,
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: "SCHOOL_USER_CREATED",
      resourceType: "User",
      resourceId: String(user._id),
      details: { role: body.role },
      ipAddress: req.ip
    });
    res.status(201).json({
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status
      }
    });
  }
);
router5.get("/teacher-assignments", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const query = { schoolId };
  if (req.authUser.role === "CLASS_TEACHER" || req.authUser.role === "SUBJECT_TEACHER") {
    query.teacherId = req.authUser._id;
  }
  const assignments = await TeacherAssignmentModel.find(query).populate("teacherId", "fullName email role").populate("classId", "name level").populate("subjectId", "name code").populate("academicYearId", "name").lean();
  res.json({ assignments });
});
var assignTeacherSchema = z5.object({
  teacherId: z5.string().min(12),
  classId: z5.string().min(12),
  subjectId: z5.string().min(12),
  academicYearId: z5.string().min(12),
  isClassTeacher: z5.boolean().default(false)
});
router5.post(
  "/teacher-assignments",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(assignTeacherSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const [teacher, cls, subj, year] = await Promise.all([
      UserModel.findOne({
        _id: validObjectId(body.teacherId),
        schoolId,
        role: { $in: ["CLASS_TEACHER", "SUBJECT_TEACHER", "HEADTEACHER"] }
      }),
      ClassRoomModel.findOne({ _id: validObjectId(body.classId), schoolId }),
      SubjectModel.findOne({ _id: validObjectId(body.subjectId), schoolId }),
      AcademicYearModel.findOne({ _id: validObjectId(body.academicYearId), schoolId })
    ]);
    if (!teacher || !cls || !subj || !year) {
      res.status(400).json({ error: "Teacher, class, subject, and academic year must belong to this school." });
      return;
    }
    const assignment = await TeacherAssignmentModel.findOneAndUpdate(
      {
        schoolId,
        teacherId: teacher._id,
        classId: cls._id,
        subjectId: subj._id,
        academicYearId: year._id
      },
      { isClassTeacher: body.isClassTeacher },
      { upsert: true, new: true }
    );
    if (body.isClassTeacher) {
      cls.classTeacherId = teacher._id;
      await cls.save();
    }
    res.status(201).json({ assignment });
  }
);
router5.get(
  "/students",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER", "BURSAR", "ADMIN_STAFF"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const search = req.query.search ? String(req.query.search).trim() : "";
    const classId = req.query.classId ? validObjectId(String(req.query.classId)) : null;
    const status = req.query.status ? String(req.query.status) : "ACTIVE";
    const query = { schoolId };
    if (status !== "ALL") query.status = status;
    if (classId) query.currentClassId = classId;
    if (req.authUser.role === "CLASS_TEACHER" || req.authUser.role === "SUBJECT_TEACHER") {
      const assignments = await TeacherAssignmentModel.find({
        schoolId,
        teacherId: req.authUser._id
      }).select("classId").lean();
      const allowedClassIds = assignments.map((a) => String(a.classId));
      if (classId && !allowedClassIds.includes(classId)) {
        res.status(403).json({ error: "You are not assigned to this class." });
        return;
      }
      query.currentClassId = classId || { $in: allowedClassIds };
    }
    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      query.$or = [{ fullName: rx }, { admissionNumber: rx }];
    }
    const [students, total] = await Promise.all([
      StudentModel.find(query).populate("currentClassId", "name level").populate("academicYearId", "name").sort({ fullName: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      StudentModel.countDocuments(query)
    ]);
    res.json({ students, total, page, limit });
  }
);
var enrollStudentSchema = z5.object({
  fullName: z5.string().min(2).max(120),
  admissionNumber: z5.string().min(2).max(40).optional(),
  gender: z5.enum(["Male", "Female"]),
  dateOfBirth: z5.string().max(20).optional(),
  classId: z5.string().min(12),
  academicYearId: z5.string().min(12),
  admissionDate: z5.string().min(8).max(20),
  studentCategory: z5.enum(["Day", "Boarding", "Scholarship"]).default("Day"),
  guardianName: z5.string().max(120).optional(),
  guardianPhone: z5.string().max(30).optional(),
  guardianEmail: z5.string().email().optional().or(z5.literal("")),
  portalAccount: z5.object({
    email: z5.string().email(),
    password: z5.string().min(8)
  }).optional()
});
router5.post(
  "/students",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(enrollStudentSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const [cls, year] = await Promise.all([
      ClassRoomModel.findOne({ _id: validObjectId(body.classId), schoolId }),
      AcademicYearModel.findOne({ _id: validObjectId(body.academicYearId), schoolId })
    ]);
    if (!cls || !year) {
      res.status(400).json({ error: "Selected class or academic year not found in this school." });
      return;
    }
    const admissionNumber = body.admissionNumber?.trim() || `ADM-${(/* @__PURE__ */ new Date()).getFullYear()}-${crypto8.randomInt(1e3, 9999)}`;
    let userId = null;
    if (body.portalAccount) {
      const existing = await UserModel.findOne({ email: body.portalAccount.email.toLowerCase() });
      if (existing) {
        res.status(409).json({ error: "Student portal email is already registered." });
        return;
      }
      const user = await UserModel.create({
        schoolId,
        fullName: body.fullName.trim(),
        email: body.portalAccount.email.toLowerCase().trim(),
        passwordHash: hashPassword(body.portalAccount.password),
        role: "STUDENT",
        emailVerified: true,
        status: "ACTIVE"
      });
      userId = user._id;
    }
    const student = await StudentModel.create({
      schoolId,
      userId,
      admissionNumber,
      fullName: body.fullName.trim(),
      gender: body.gender,
      dateOfBirth: body.dateOfBirth || "",
      currentClassId: cls._id,
      academicYearId: year._id,
      admissionDate: body.admissionDate,
      studentCategory: body.studentCategory,
      guardianSummary: {
        name: body.guardianName || "",
        phone: body.guardianPhone || "",
        email: body.guardianEmail || "",
        relationship: "Parent/Guardian"
      },
      academicHistory: [
        {
          academicYearId: year._id,
          academicYearName: year.name,
          classId: cls._id,
          className: cls.name,
          status: "ACTIVE"
        }
      ]
    });
    await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.studentsEnrolled": true });
    res.status(201).json({ student });
  }
);
router5.post(
  "/students/:id/status",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid student ID." });
      return;
    }
    const schema = z5.object({
      status: z5.enum(["ACTIVE", "TRANSFERRED", "GRADUATED", "ARCHIVED"]),
      newClassId: z5.string().optional(),
      newAcademicYearId: z5.string().optional()
    });
    const body = parseBody(schema, req, res);
    if (!body) return;
    const student = await StudentModel.findOne({ _id: id, schoolId });
    if (!student) {
      res.status(404).json({ error: "Student not found." });
      return;
    }
    let className = "";
    let yearName = "";
    if (body.newClassId) {
      const cls = await ClassRoomModel.findOne({ _id: validObjectId(body.newClassId), schoolId });
      if (!cls) {
        res.status(400).json({ error: "Target class not found." });
        return;
      }
      student.currentClassId = cls._id;
      className = cls.name;
    }
    if (body.newAcademicYearId) {
      const yr = await AcademicYearModel.findOne({
        _id: validObjectId(body.newAcademicYearId),
        schoolId
      });
      if (!yr) {
        res.status(400).json({ error: "Target academic year not found." });
        return;
      }
      student.academicYearId = yr._id;
      yearName = yr.name;
    }
    student.status = body.status;
    student.academicHistory.push({
      academicYearId: student.academicYearId,
      academicYearName: yearName || "Updated Record",
      classId: student.currentClassId,
      className: className || "Current Class",
      status: body.status,
      recordedAt: /* @__PURE__ */ new Date()
    });
    await student.save();
    res.json({ student });
  }
);
router5.post(
  "/students/import",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  upload2.single("file"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    if (!req.file) {
      res.status(400).json({ error: "Upload a CSV or Excel (.xlsx) file." });
      return;
    }
    const classId = validObjectId(String(req.body?.classId || ""));
    const academicYearId = validObjectId(String(req.body?.academicYearId || ""));
    if (!classId || !academicYearId) {
      res.status(400).json({ error: "Target classId and academicYearId are required." });
      return;
    }
    const [cls, year] = await Promise.all([
      ClassRoomModel.findOne({ _id: classId, schoolId }),
      AcademicYearModel.findOne({ _id: academicYearId, schoolId })
    ]);
    if (!cls || !year) {
      res.status(400).json({ error: "Class or academic year not found in school." });
      return;
    }
    const rows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    let imported = 0;
    const skipped = [];
    for (const row of rows) {
      const fullName = row.fullName || row["Full Name"] || row.Name || "";
      if (!fullName) {
        skipped.push("Missing student name");
        continue;
      }
      const adm = row.admissionNumber || row["Admission Number"] || `ADM-${(/* @__PURE__ */ new Date()).getFullYear()}-${crypto8.randomInt(1e4, 99999)}`;
      const genderRaw = (row.gender || row.Gender || "Male").toLowerCase();
      const gender = genderRaw.startsWith("f") ? "Female" : "Male";
      try {
        await StudentModel.create({
          schoolId,
          admissionNumber: adm,
          fullName,
          gender,
          dateOfBirth: row.dateOfBirth || row["Date of Birth"] || "",
          currentClassId: cls._id,
          academicYearId: year._id,
          admissionDate: row.admissionDate || (/* @__PURE__ */ new Date()).toISOString().slice(0, 10),
          studentCategory: "Day",
          guardianSummary: {
            name: row.guardianName || row["Guardian Name"] || "",
            phone: row.guardianPhone || row["Guardian Phone"] || "",
            email: row.guardianEmail || row["Guardian Email"] || "",
            relationship: "Parent/Guardian"
          },
          academicHistory: [
            {
              academicYearId: year._id,
              academicYearName: year.name,
              classId: cls._id,
              className: cls.name,
              status: "ACTIVE"
            }
          ]
        });
        imported++;
      } catch {
        skipped.push(`Duplicate admission number: ${adm}`);
      }
    }
    if (imported > 0) {
      await SchoolModel.updateOne({ _id: schoolId }, { "onboardingSteps.studentsEnrolled": true });
    }
    res.json({ imported, skippedCount: skipped.length, skipped: skipped.slice(0, 10) });
  }
);
router5.get(
  "/students/export",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const students = await StudentModel.find({ schoolId }).populate("currentClassId", "name").sort({ fullName: 1 }).lean();
    const csv = generateCsvString(
      ["Admission Number", "Full Name", "Gender", "Class", "Category", "Status", "Guardian Name", "Guardian Phone"],
      students.map((s) => [
        s.admissionNumber,
        s.fullName,
        s.gender,
        s.currentClassId?.name || "",
        s.studentCategory,
        s.status,
        s.guardianSummary?.name || "",
        s.guardianSummary?.phone || ""
      ])
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="nexasua-students.csv"');
    res.send(csv);
  }
);
router5.get(
  "/guardian-links",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const links = await GuardianLinkModel.find({ schoolId }).populate("parentUserId", "fullName email phone").populate("studentId", "fullName admissionNumber").lean();
    res.json({ links });
  }
);
var linkGuardianSchema = z5.object({
  parentUserId: z5.string().min(12),
  studentId: z5.string().min(12),
  relationship: z5.string().min(2).max(40).default("Parent/Guardian"),
  verified: z5.boolean().default(true)
});
router5.post(
  "/guardian-links",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "ADMIN_STAFF"),
  async (req, res) => {
    const body = parseBody(linkGuardianSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const [parent, student] = await Promise.all([
      UserModel.findOne({ _id: validObjectId(body.parentUserId), schoolId, role: "PARENT" }),
      StudentModel.findOne({ _id: validObjectId(body.studentId), schoolId })
    ]);
    if (!parent || !student) {
      res.status(400).json({ error: "Parent user and student must both belong to this school." });
      return;
    }
    const link = await GuardianLinkModel.findOneAndUpdate(
      { schoolId, parentUserId: parent._id, studentId: student._id },
      {
        relationship: body.relationship,
        verified: body.verified,
        verifiedBy: body.verified ? req.authUser._id : null,
        verifiedAt: body.verified ? /* @__PURE__ */ new Date() : null
      },
      { upsert: true, new: true }
    );
    res.status(201).json({ link });
  }
);
router5.get("/attendance", async (req, res) => {
  const schoolId = req.authUser.schoolId;
  const classId = req.query.classId ? validObjectId(String(req.query.classId)) : null;
  const date = req.query.date ? String(req.query.date) : null;
  if (req.authUser.role === "STUDENT") {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser._id });
    if (!student) {
      res.json({ records: [] });
      return;
    }
    const records2 = await AttendanceModel.find({ schoolId, studentId: student._id }).sort({ date: -1 }).limit(90).lean();
    res.json({ records: records2 });
    return;
  }
  if (req.authUser.role === "PARENT") {
    const studentId = validObjectId(String(req.query.studentId || ""));
    if (!studentId) {
      res.status(400).json({ error: "studentId is required." });
      return;
    }
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser._id,
      studentId,
      verified: true
    });
    if (!verified) {
      res.status(403).json({ error: "Verified guardian relationship required." });
      return;
    }
    const records2 = await AttendanceModel.find({ schoolId, studentId }).sort({ date: -1 }).limit(90).lean();
    res.json({ records: records2 });
    return;
  }
  const query = { schoolId };
  if (classId) query.classId = classId;
  if (date) query.date = date;
  const records = await AttendanceModel.find(query).populate("studentId", "fullName admissionNumber").sort({ date: -1 }).limit(200).lean();
  res.json({ records });
});
var markAttendanceSchema = z5.object({
  classId: z5.string().min(12),
  academicYearId: z5.string().min(12),
  termId: z5.string().min(12),
  date: z5.string().min(8).max(20),
  entries: z5.array(
    z5.object({
      studentId: z5.string().min(12),
      status: z5.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"]),
      note: z5.string().max(200).optional()
    })
  ).min(1)
});
router5.post(
  "/attendance",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "CLASS_TEACHER", "SUBJECT_TEACHER"),
  async (req, res) => {
    const body = parseBody(markAttendanceSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    const classId = validObjectId(body.classId);
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    if (!classId || !academicYearId || !termId) {
      res.status(400).json({ error: "Valid class, academic year, and term IDs are required." });
      return;
    }
    if (req.authUser.role === "CLASS_TEACHER" || req.authUser.role === "SUBJECT_TEACHER") {
      const assigned = await TeacherAssignmentModel.exists({
        schoolId,
        teacherId: req.authUser._id,
        classId
      });
      if (!assigned) {
        res.status(403).json({ error: "You are not assigned to mark attendance for this class." });
        return;
      }
    }
    let saved = 0;
    for (const entry of body.entries) {
      const sid = validObjectId(entry.studentId);
      if (!sid) continue;
      const belongs = await StudentModel.exists({ _id: sid, schoolId });
      if (!belongs) continue;
      await AttendanceModel.findOneAndUpdate(
        { schoolId, classId, date: body.date, studentId: sid },
        {
          academicYearId,
          termId,
          status: entry.status,
          note: entry.note || "",
          markedBy: req.authUser._id
        },
        { upsert: true, new: true }
      );
      saved++;
    }
    res.json({ saved });
  }
);
var vacationDateSchema = z5.object({
  termVacationDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please select a valid vacation date (YYYY-MM-DD).")
});
router5.put(
  "/term-vacation-date",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER"),
  async (req, res) => {
    const body = parseBody(vacationDateSchema, req, res);
    if (!body) return;
    if (body.termVacationDate <= getAccraTodayDateString()) {
      res.status(400).json({
        error: "Your vacation date must be a future calendar date."
      });
      return;
    }
    const schoolId = req.authUser.schoolId;
    const endOfVacation = /* @__PURE__ */ new Date(`${body.termVacationDate}T23:59:59.000Z`);
    const [school, subscription] = await Promise.all([
      SchoolModel.findByIdAndUpdate(
        schoolId,
        { termVacationDate: body.termVacationDate },
        { new: true }
      ).select("-paymentConfig.paystackSecretEncrypted"),
      SubscriptionModel.findOneAndUpdate(
        { schoolId },
        {
          termVacationDate: body.termVacationDate,
          currentPeriodEnd: endOfVacation
        },
        { new: true }
      )
    ]);
    await writeAuditLog({
      schoolId,
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: "TERM_VACATION_DATE_SET",
      resourceType: "School",
      resourceId: schoolId,
      details: { termVacationDate: body.termVacationDate },
      ipAddress: req.ip
    });
    res.json({
      message: `Term vacation date saved (${body.termVacationDate}). Your school portal will remain open until this date.`,
      termVacationDate: body.termVacationDate,
      school,
      subscription
    });
  }
);
router5.get(
  "/subscription",
  requireRole("SCHOOL_ADMIN", "HEADTEACHER", "BURSAR"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const [sub, invoices, activeStudentCount, cfg] = await Promise.all([
      SubscriptionModel.findOne({ schoolId }).lean(),
      SubscriptionInvoiceModel.find({ schoolId }).sort({ createdAt: -1 }).lean(),
      StudentModel.countDocuments({ schoolId, status: "ACTIVE" }),
      ensureSystemConfig()
    ]);
    res.json({
      subscription: sub,
      invoices,
      activeStudentCount,
      pricingBands: cfg.pricingBands,
      planCatalog: cfg.planCatalog,
      threeTermDiscountPercent: cfg.threeTermDiscountPercent
    });
  }
);
var checkoutSubSchema = z5.object({
  plan: z5.enum(["CORE", "COMPLETE"]),
  billingCycle: z5.enum(["TERM", "THREE_TERMS"]),
  nextTermVacationDate: z5.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  promoCode: z5.string().max(40).optional()
});
router5.post(
  "/subscription/checkout",
  requireRole("SCHOOL_ADMIN"),
  async (req, res) => {
    const body = parseBody(checkoutSubSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser.schoolId;
    if (body.nextTermVacationDate) {
      if (body.nextTermVacationDate <= getAccraTodayDateString()) {
        res.status(400).json({
          error: "Your next term vacation date must be a future calendar date."
        });
        return;
      }
      await SchoolModel.findByIdAndUpdate(schoolId, {
        termVacationDate: body.nextTermVacationDate
      });
    }
    const [school, activeStudents, cfg] = await Promise.all([
      SchoolModel.findById(schoolId),
      StudentModel.countDocuments({ schoolId, status: "ACTIVE" }),
      ensureSystemConfig()
    ]);
    const population = Math.max(activeStudents, school.studentPopulationEstimate || 1);
    let promoPercent = 0;
    if (body.promoCode) {
      const code = body.promoCode.trim().toUpperCase();
      const offer = cfg.promotionalOffers.find(
        (o) => o.code === code && o.active && (o.applicablePlan === "ALL" || o.applicablePlan === body.plan)
      );
      if (offer) promoPercent = offer.discountPercent;
    }
    const quote = calculateSubscriptionPrice({
      studentCount: population,
      plan: body.plan,
      billingCycle: body.billingCycle,
      bands: cfg.pricingBands,
      threeTermDiscountPercent: cfg.threeTermDiscountPercent,
      promoDiscountPercent: promoPercent
    });
    if (quote.isCustomQuote || quote.netPayableGhs === null) {
      res.status(400).json({
        error: "Schools with over 1,500 students require a custom quotation from NexaFlow."
      });
      return;
    }
    const invoiceNumber = `SUB-${Date.now().toString().slice(-6)}-${crypto8.randomBytes(2).toString("hex").toUpperCase()}`;
    const paystackRef = `NXS-SUB-${crypto8.randomBytes(8).toString("hex").toUpperCase()}`;
    const invoice = await SubscriptionInvoiceModel.create({
      schoolId,
      invoiceNumber,
      plan: body.plan,
      billingCycle: body.billingCycle,
      studentCountAtBilling: population,
      amountGhs: quote.netPayableGhs,
      discountAppliedGhs: quote.threeTermDiscountGhs + quote.promoDiscountGhs,
      promoCode: body.promoCode || "",
      status: "PENDING",
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1e3),
      paystackReference: paystackRef
    });
    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
    if (!secretKey) {
      res.json({
        invoice,
        paystackConfigured: false,
        message: "Invoice created. Online Paystack billing is not yet configured on this server."
      });
      return;
    }
    const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get("host")}`;
    const init = await initializePaystackTransaction({
      secretKey,
      email: school.email,
      amountGhs: quote.netPayableGhs,
      reference: paystackRef,
      callbackUrl: `${baseUrl}/dashboard?subVerify=${paystackRef}`,
      metadata: {
        type: "SUBSCRIPTION",
        schoolId,
        invoiceId: String(invoice._id),
        plan: body.plan,
        billingCycle: body.billingCycle,
        nextTermVacationDate: body.nextTermVacationDate || school?.termVacationDate || ""
      }
    });
    if (!init.ok) {
      res.status(400).json({ invoice, paystackConfigured: true, error: init.error });
      return;
    }
    res.json({
      invoice,
      paystackConfigured: true,
      authorizationUrl: init.authorizationUrl,
      reference: init.reference
    });
  }
);
router5.post(
  "/subscription/verify-payment",
  requireRole("SCHOOL_ADMIN"),
  async (req, res) => {
    const reference = String(req.body?.reference || "").trim();
    const schoolId = req.authUser.schoolId;
    const invoice = await SubscriptionInvoiceModel.findOne({ schoolId, paystackReference: reference });
    if (!invoice) {
      res.status(404).json({ error: "Subscription invoice not found." });
      return;
    }
    if (invoice.status === "PAID") {
      res.json({ alreadyProcessed: true, invoice });
      return;
    }
    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
    const verify = await verifyPaystackTransaction(secretKey, reference);
    if (!verify.ok || !verify.verified || (verify.amountGhs ?? 0) < invoice.amountGhs) {
      res.status(400).json({ error: verify.error || "Payment could not be verified with Paystack." });
      return;
    }
    invoice.status = "PAID";
    invoice.paidAt = /* @__PURE__ */ new Date();
    invoice.paymentMethod = verify.channel || "Paystack";
    await invoice.save();
    const days = invoice.billingCycle === "THREE_TERMS" ? 365 : 120;
    const now = /* @__PURE__ */ new Date();
    const school = await SchoolModel.findById(schoolId);
    const futureVac = school?.termVacationDate && school.termVacationDate > getAccraTodayDateString(now) ? school.termVacationDate : new Date(now.getTime() + days * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
    const end = /* @__PURE__ */ new Date(`${futureVac}T23:59:59.000Z`);
    await SubscriptionModel.findOneAndUpdate(
      { schoolId },
      {
        plan: invoice.plan,
        status: "ACTIVE",
        billingCycle: invoice.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        termVacationDate: futureVac,
        portalClosedReason: "",
        amountDueGhs: 0
      }
    );
    res.json({ verified: true, invoice });
  }
);
router5.get("/support-tickets", async (req, res) => {
  const tickets = await SupportTicketModel.find({ schoolId: req.authUser.schoolId }).sort({ createdAt: -1 }).lean();
  res.json({ tickets });
});
router5.post("/support-tickets", async (req, res) => {
  const schema = z5.object({
    subject: z5.string().min(3).max(160),
    category: z5.string().max(60).default("Technical Support"),
    priority: z5.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
    description: z5.string().min(10).max(2500)
  });
  const body = parseBody(schema, req, res);
  if (!body) return;
  const ticketNumber = `TKT-${Date.now().toString().slice(-6)}-${crypto8.randomBytes(2).toString("hex").toUpperCase()}`;
  const ticket = await SupportTicketModel.create({
    ticketNumber,
    schoolId: req.authUser.schoolId,
    userId: req.authUser._id,
    contactName: req.authUser.fullName,
    contactEmail: req.authUser.email,
    ...body
  });
  res.status(201).json({ ticket });
});
router5.get(
  "/data-export",
  requireRole("SCHOOL_ADMIN"),
  async (req, res) => {
    const schoolId = req.authUser.schoolId;
    const [school, students, classes, subjects, years, terms] = await Promise.all([
      SchoolModel.findById(schoolId).select("-paymentConfig.paystackSecretEncrypted").lean(),
      StudentModel.find({ schoolId }).lean(),
      ClassRoomModel.find({ schoolId }).lean(),
      SubjectModel.find({ schoolId }).lean(),
      AcademicYearModel.find({ schoolId }).lean(),
      TermModel.find({ schoolId }).lean()
    ]);
    await writeAuditLog({
      schoolId,
      userId: req.authUser._id,
      userEmail: req.authUser.email,
      userRole: req.authUser.role,
      action: "DATA_PROTECTION_EXPORT",
      resourceType: "School",
      resourceId: schoolId,
      ipAddress: req.ip
    });
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="nexasua-school-data-export.json"');
    res.send(JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), school, academicYears: years, terms, classes, subjects, students }, null, 2));
  }
);
var schoolCoreRoutes_default = router5;

// server/routes/superAdminRoutes.ts
import crypto9 from "crypto";
import express6 from "express";
import { z as z6 } from "zod";
var router6 = express6.Router();
router6.use(requireDb, authenticate, requireRole("SUPER_ADMIN"));
function generateUniqueSchoolCode(name) {
  const prefix = name.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3).padEnd(3, "X");
  const suffix = crypto9.randomInt(1e3, 9999);
  return `NXS-${prefix}-${suffix}`;
}
async function provisionApprovedSchoolDefaults(school, approverId) {
  const cfg = await ensureSystemConfig();
  if (!school.schoolCode || school.schoolCode.startsWith("PEND-")) {
    let code = generateUniqueSchoolCode(school.name);
    while (await SchoolModel.exists({ schoolCode: code })) {
      code = generateUniqueSchoolCode(school.name);
    }
    school.schoolCode = code;
  }
  school.status = "APPROVED";
  school.approvedAt = /* @__PURE__ */ new Date();
  school.approvedBy = approverId;
  await school.save();
  const existingSub = await SubscriptionModel.findOne({ schoolId: school._id });
  if (!existingSub) {
    const now = /* @__PURE__ */ new Date();
    const trialEnd = new Date(now.getTime() + cfg.trialDays * 24 * 60 * 60 * 1e3);
    const vacDate = school.termVacationDate || "";
    const periodEnd = vacDate ? /* @__PURE__ */ new Date(`${vacDate}T23:59:59.000Z`) : trialEnd;
    const quote = calculateSubscriptionPrice({
      studentCount: school.studentPopulationEstimate,
      plan: school.requestedPlan,
      billingCycle: "TERM",
      bands: cfg.pricingBands,
      threeTermDiscountPercent: cfg.threeTermDiscountPercent
    });
    await SubscriptionModel.create({
      schoolId: school._id,
      plan: school.requestedPlan,
      status: "TRIAL",
      billingCycle: "TERM",
      trialEndsAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      termVacationDate: vacDate,
      studentBand: quote.band.label,
      unitPriceGhs: quote.unitTermPriceGhs ?? 0,
      discountPercent: 0,
      amountDueGhs: quote.netPayableGhs ?? 0,
      gracePeriodDays: cfg.gracePeriodDays
    });
  }
  const existingAssessment = await AssessmentConfigModel.findOne({ schoolId: school._id });
  if (!existingAssessment) {
    await AssessmentConfigModel.create({
      schoolId: school._id,
      ...DEFAULT_30_70_TEMPLATE,
      level: "All",
      isDefault: true
    });
  }
}
router6.get("/overview", async (_req, res) => {
  const [
    totalSchools,
    pendingSchools,
    approvedSchools,
    suspendedSchools,
    activeSubs,
    trialSubs,
    expiredSubs,
    coreSubs,
    completeSubs,
    totalStudents,
    paidInvoices,
    pendingInvoices,
    customRequestsCount,
    openTicketsCount,
    recentAuditEvents,
    dbPing
  ] = await Promise.all([
    SchoolModel.countDocuments({}),
    SchoolModel.countDocuments({ status: "PENDING" }),
    SchoolModel.countDocuments({ status: "APPROVED" }),
    SchoolModel.countDocuments({ status: "SUSPENDED" }),
    SubscriptionModel.countDocuments({ status: "ACTIVE" }),
    SubscriptionModel.countDocuments({ status: "TRIAL" }),
    SubscriptionModel.countDocuments({ status: { $in: ["EXPIRED", "SUSPENDED"] } }),
    SubscriptionModel.countDocuments({ plan: "CORE" }),
    SubscriptionModel.countDocuments({ plan: "COMPLETE" }),
    StudentModel.countDocuments({ status: "ACTIVE" }),
    SubscriptionInvoiceModel.find({ status: "PAID" }).select("amountGhs").lean(),
    SubscriptionInvoiceModel.countDocuments({ status: "PENDING" }),
    CustomProjectRequestModel.countDocuments({}),
    SupportTicketModel.countDocuments({ status: { $in: ["OPEN", "IN_PROGRESS"] } }),
    AuditLogModel.find({}).sort({ createdAt: -1 }).limit(20).lean(),
    pingDatabase()
  ]);
  const subscriptionRevenueGhs = paidInvoices.reduce((sum, inv) => sum + (inv.amountGhs || 0), 0);
  const integrations = getPlatformIntegrationsStatus(getDbState());
  res.json({
    metrics: {
      totalSchools,
      pendingSchools,
      approvedSchools,
      suspendedSchools,
      activeSubs,
      trialSubs,
      expiredSubs,
      coreSubs,
      completeSubs,
      totalStudents,
      subscriptionRevenueGhs,
      pendingInvoices,
      customRequestsCount,
      openTicketsCount
    },
    integrations,
    systemHealth: {
      database: dbPing,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024)
    },
    recentAuditEvents
  });
});
router6.get("/schools", async (req, res) => {
  const status = req.query.status ? String(req.query.status) : void 0;
  const filter = {};
  if (status && ["PENDING", "APPROVED", "SUSPENDED", "REJECTED"].includes(status)) {
    filter.status = status;
  }
  const schools = await SchoolModel.find(filter).select("-paymentConfig.paystackSecretEncrypted").sort({ createdAt: -1 }).lean();
  const schoolIds = schools.map((s) => s._id);
  const [subs, studentCounts] = await Promise.all([
    SubscriptionModel.find({ schoolId: { $in: schoolIds } }).lean(),
    StudentModel.aggregate([
      { $match: { schoolId: { $in: schoolIds }, status: "ACTIVE" } },
      { $group: { _id: "$schoolId", count: { $sum: 1 } } }
    ])
  ]);
  const subMap = new Map(subs.map((s) => [String(s.schoolId), s]));
  const countMap = new Map(studentCounts.map((c) => [String(c._id), c.count]));
  res.json({
    schools: schools.map((s) => ({
      ...s,
      subscription: subMap.get(String(s._id)) || null,
      actualStudentCount: countMap.get(String(s._id)) || 0
    }))
  });
});
var createSchoolDirectSchema = z6.object({
  schoolName: z6.string().min(3).max(160),
  schoolType: z6.enum(["Private", "Public", "Mission", "International"]),
  educationalLevels: z6.array(z6.enum(["Kindergarten", "Primary", "Junior High School", "Senior High School"])).min(1),
  country: z6.string().default("Ghana"),
  region: z6.string().min(2),
  town: z6.string().min(2),
  address: z6.string().min(3),
  schoolEmail: z6.string().email(),
  schoolPhone: z6.string().min(7),
  adminName: z6.string().min(2),
  adminEmail: z6.string().email(),
  adminPassword: z6.string().min(8),
  studentPopulation: z6.number().int().min(1),
  selectedPlan: z6.enum(["CORE", "COMPLETE"])
});
router6.post("/schools", async (req, res) => {
  const body = parseBody(createSchoolDirectSchema, req, res);
  if (!body) return;
  const exists = await UserModel.findOne({ email: body.adminEmail.toLowerCase() });
  if (exists) {
    res.status(409).json({ error: "Administrator email already exists." });
    return;
  }
  const school = await SchoolModel.create({
    name: body.schoolName.trim(),
    schoolCode: generateUniqueSchoolCode(body.schoolName),
    schoolType: body.schoolType,
    educationalLevels: body.educationalLevels,
    country: body.country,
    region: body.region,
    town: body.town,
    address: body.address,
    email: body.schoolEmail.toLowerCase(),
    phone: body.schoolPhone,
    status: "APPROVED",
    studentPopulationEstimate: body.studentPopulation,
    requestedPlan: body.selectedPlan,
    dataProtectionConsentAt: /* @__PURE__ */ new Date()
  });
  await UserModel.create({
    email: body.adminEmail.toLowerCase(),
    passwordHash: hashPassword(body.adminPassword),
    fullName: body.adminName,
    phone: body.schoolPhone,
    role: "SCHOOL_ADMIN",
    schoolId: school._id,
    emailVerified: true,
    status: "ACTIVE"
  });
  await provisionApprovedSchoolDefaults(school, req.authUser._id);
  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SUPER_ADMIN_CREATED_SCHOOL",
    resourceType: "School",
    resourceId: String(school._id),
    ipAddress: req.ip
  });
  res.status(201).json({ school });
});
router6.post("/schools/:id/approve", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid school ID." });
    return;
  }
  const school = await SchoolModel.findById(id);
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  await provisionApprovedSchoolDefaults(school, req.authUser._id);
  const admins = await UserModel.find({ schoolId: school._id, role: "SCHOOL_ADMIN" });
  if (admins.length > 0) {
    await NotificationModel.insertMany(
      admins.map((a) => ({
        schoolId: school._id,
        userId: a._id,
        title: "School Approved on NexaSua",
        message: `${school.name} is approved. Your School Code is ${school.schoolCode}. Complete onboarding to begin.`,
        type: "SCHOOL_APPROVED"
      }))
    );
  }
  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SCHOOL_APPROVED",
    resourceType: "School",
    resourceId: String(school._id),
    details: { schoolCode: school.schoolCode },
    ipAddress: req.ip
  });
  res.json({ school });
});
router6.post("/schools/:id/reject", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid school ID." });
    return;
  }
  const school = await SchoolModel.findByIdAndUpdate(
    id,
    { status: "REJECTED", rejectionReason: String(req.body?.reason || "Application declined") },
    { new: true }
  );
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SCHOOL_REJECTED",
    resourceType: "School",
    resourceId: String(school._id),
    ipAddress: req.ip
  });
  res.json({ school });
});
router6.post("/schools/:id/suspend", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid school ID." });
    return;
  }
  const school = await SchoolModel.findByIdAndUpdate(
    id,
    { status: "SUSPENDED", suspensionReason: String(req.body?.reason || "Administrative suspension") },
    { new: true }
  );
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  await SubscriptionModel.updateOne({ schoolId: school._id }, { status: "SUSPENDED" });
  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SCHOOL_SUSPENDED",
    resourceType: "School",
    resourceId: String(school._id),
    ipAddress: req.ip
  });
  res.json({ school });
});
router6.post("/schools/:id/reactivate", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid school ID." });
    return;
  }
  const school = await SchoolModel.findByIdAndUpdate(
    id,
    { status: "APPROVED", suspensionReason: "" },
    { new: true }
  );
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  await SubscriptionModel.updateOne({ schoolId: school._id }, { status: "ACTIVE" });
  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SCHOOL_REACTIVATED",
    resourceType: "School",
    resourceId: String(school._id),
    ipAddress: req.ip
  });
  res.json({ school });
});
var overrideSubSchema = z6.object({
  plan: z6.enum(["CORE", "COMPLETE"]),
  status: z6.enum(["TRIAL", "ACTIVE", "GRACE_PERIOD", "EXPIRED", "SUSPENDED"]),
  periodDays: z6.number().int().min(1).max(730).optional(),
  termVacationDate: z6.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z6.literal("")),
  overrideNote: z6.string().max(400).optional()
});
router6.put("/schools/:id/subscription", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid school ID." });
    return;
  }
  const body = parseBody(overrideSubSchema, req, res);
  if (!body) return;
  let sub = await SubscriptionModel.findOne({ schoolId: id });
  const cfg = await ensureSystemConfig();
  const vacDate = body.termVacationDate !== void 0 ? body.termVacationDate : sub?.termVacationDate || "";
  if (!sub) {
    const end = vacDate ? /* @__PURE__ */ new Date(`${vacDate}T23:59:59.000Z`) : new Date(Date.now() + (body.periodDays || cfg.trialDays) * 24 * 60 * 60 * 1e3);
    sub = await SubscriptionModel.create({
      schoolId: id,
      plan: body.plan,
      status: body.status,
      billingCycle: "TERM",
      trialEndsAt: body.status === "TRIAL" ? end : null,
      currentPeriodStart: /* @__PURE__ */ new Date(),
      currentPeriodEnd: end,
      termVacationDate: vacDate,
      portalClosedReason: "",
      studentBand: "Platform Override",
      unitPriceGhs: 0,
      discountPercent: 0,
      amountDueGhs: 0,
      gracePeriodDays: cfg.gracePeriodDays,
      overrideNote: body.overrideNote || "Set by Super Admin"
    });
  } else {
    sub.plan = body.plan;
    sub.status = body.status;
    if (body.termVacationDate !== void 0) {
      sub.termVacationDate = body.termVacationDate;
      if (body.termVacationDate) {
        sub.currentPeriodEnd = /* @__PURE__ */ new Date(`${body.termVacationDate}T23:59:59.000Z`);
      }
    } else if (body.periodDays) {
      const end = new Date(Date.now() + body.periodDays * 24 * 60 * 60 * 1e3);
      sub.currentPeriodEnd = end;
      if (body.status === "TRIAL") sub.trialEndsAt = end;
    }
    if (body.status === "ACTIVE" || body.status === "TRIAL") {
      sub.portalClosedReason = "";
    }
    if (body.overrideNote !== void 0) sub.overrideNote = body.overrideNote;
    await sub.save();
  }
  if (body.termVacationDate !== void 0) {
    await SchoolModel.findByIdAndUpdate(id, { termVacationDate: body.termVacationDate });
  }
  await writeAuditLog({
    schoolId: id,
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SUBSCRIPTION_OVERRIDE",
    resourceType: "Subscription",
    resourceId: String(sub._id),
    details: body,
    ipAddress: req.ip
  });
  res.json({ subscription: sub });
});
function formatWorkspaceSummary(school, sub) {
  return {
    school: {
      id: String(school._id),
      name: school.name,
      schoolCode: school.schoolCode,
      logoDataUrl: school.logoDataUrl,
      motto: school.motto,
      educationalLevels: school.educationalLevels,
      currency: school.currency,
      termVacationDate: school.termVacationDate || sub?.termVacationDate || "",
      onboardingSteps: school.onboardingSteps,
      reportCardSettings: school.reportCardSettings,
      dashboardSettings: school.dashboardSettings,
      paymentConfig: school.paymentConfig ? {
        paystackPublicKey: school.paymentConfig.paystackPublicKey,
        hasPaystackSecret: Boolean(school.paymentConfig.paystackSecretEncrypted)
      } : void 0
    },
    subscription: sub ? {
      plan: sub.plan,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodEnd: sub.currentPeriodEnd,
      studentBand: sub.studentBand,
      termVacationDate: sub.termVacationDate || school.termVacationDate || "",
      portalClosedReason: sub.portalClosedReason || ""
    } : null
  };
}
router6.post("/schools/:id/workspace-context", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid school ID." });
    return;
  }
  const [school, sub] = await Promise.all([
    SchoolModel.findById(id).select("-paymentConfig.paystackSecretEncrypted").lean(),
    SubscriptionModel.findOne({ schoolId: id }).lean()
  ]);
  if (!school) {
    res.status(404).json({ error: "School not found." });
    return;
  }
  res.json(formatWorkspaceSummary(school, sub));
});
router6.post("/ensure-admin-workspace", async (req, res) => {
  const completeSub = await SubscriptionModel.findOne({ plan: "COMPLETE" }).sort({ createdAt: 1 }).lean();
  let school = completeSub ? await SchoolModel.findById(completeSub.schoolId).select("-paymentConfig.paystackSecretEncrypted").lean() : null;
  if (!school) {
    school = await SchoolModel.findOne({ status: "APPROVED" }).sort({ createdAt: 1 }).select("-paymentConfig.paystackSecretEncrypted").lean();
  }
  if (!school) {
    const created = await SchoolModel.create({
      name: "NexaFlow Flagship Academy",
      schoolCode: generateUniqueSchoolCode("NexaFlow Flagship"),
      schoolType: "Private",
      educationalLevels: ["Kindergarten", "Primary", "Junior High School", "Senior High School"],
      country: "Ghana",
      region: "Greater Accra",
      town: "Accra",
      address: "Airport Residential Area, Accra",
      email: req.authUser.email,
      phone: "+233 30 000 0000",
      status: "APPROVED",
      studentPopulationEstimate: 350,
      requestedPlan: "COMPLETE",
      dataProtectionConsentAt: /* @__PURE__ */ new Date()
    });
    await provisionApprovedSchoolDefaults(created, req.authUser._id);
    await SubscriptionModel.updateOne(
      { schoolId: created._id },
      {
        plan: "COMPLETE",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1e3),
        overrideNote: "Platform Super Admin All-Plans Workspace"
      }
    );
    school = await SchoolModel.findById(created._id).select("-paymentConfig.paystackSecretEncrypted").lean();
  }
  const sub = await SubscriptionModel.findOne({ schoolId: school._id }).lean();
  res.json(formatWorkspaceSummary(school, sub));
});
router6.get("/system-config", async (_req, res) => {
  const cfg = await ensureSystemConfig();
  res.json({ config: cfg });
});
var updateConfigSchema = z6.object({
  trialDays: z6.number().int().min(1).max(90),
  threeTermDiscountPercent: z6.number().min(0).max(50),
  gracePeriodDays: z6.number().int().min(0).max(30),
  platformAnnouncement: z6.string().max(1e3).optional(),
  pricingBands: z6.array(
    z6.object({
      code: z6.string(),
      label: z6.string(),
      minStudents: z6.number().int().min(1),
      maxStudents: z6.number().int().nullable(),
      corePriceGhs: z6.number().nullable(),
      completePriceGhs: z6.number().nullable(),
      isCustomQuote: z6.boolean()
    })
  ).min(1)
});
router6.put("/system-config", async (req, res) => {
  const body = parseBody(updateConfigSchema, req, res);
  if (!body) return;
  const cfg = await ensureSystemConfig();
  cfg.trialDays = body.trialDays;
  cfg.threeTermDiscountPercent = body.threeTermDiscountPercent;
  cfg.gracePeriodDays = body.gracePeriodDays;
  if (body.platformAnnouncement !== void 0) {
    cfg.platformAnnouncement = body.platformAnnouncement;
  }
  cfg.pricingBands = body.pricingBands;
  await cfg.save();
  await writeAuditLog({
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SYSTEM_CONFIG_UPDATED",
    resourceType: "SystemConfig",
    resourceId: String(cfg._id),
    ipAddress: req.ip
  });
  res.json({ config: cfg });
});
var updatePlansSchema = z6.object({
  planCatalog: z6.array(
    z6.object({
      code: z6.string().min(2).max(30),
      name: z6.string().min(2).max(120),
      tagline: z6.string().max(300).default(""),
      durationLabel: z6.string().min(2).max(160),
      durationDays: z6.number().int().min(1).max(1095),
      startingPriceLabel: z6.string().min(1).max(120),
      features: z6.array(z6.string().min(1).max(240)).max(30),
      isFeatured: z6.boolean().default(false),
      isActive: z6.boolean().default(true)
    })
  ).min(1)
});
router6.put("/plans", async (req, res) => {
  const body = parseBody(updatePlansSchema, req, res);
  if (!body) return;
  const cfg = await ensureSystemConfig();
  cfg.planCatalog = body.planCatalog.map((p) => ({
    ...p,
    code: p.code.toUpperCase().trim(),
    name: p.name.trim(),
    tagline: p.tagline.trim(),
    durationLabel: p.durationLabel.trim(),
    startingPriceLabel: p.startingPriceLabel.trim(),
    features: p.features.map((f) => f.trim()).filter(Boolean)
  }));
  await cfg.save();
  await writeAuditLog({
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "SUBSCRIPTION_PLANS_UPDATED",
    resourceType: "SystemConfig",
    resourceId: String(cfg._id),
    details: { planCodes: body.planCatalog.map((p) => p.code) },
    ipAddress: req.ip
  });
  res.json({ planCatalog: cfg.planCatalog, config: cfg });
});
var promoSchema = z6.object({
  code: z6.string().min(3).max(30),
  description: z6.string().min(3).max(200),
  discountPercent: z6.number().min(1).max(100),
  applicablePlan: z6.enum(["ALL", "CORE", "COMPLETE"]),
  expiresAt: z6.string().nullable().optional()
});
router6.post("/promotions", async (req, res) => {
  const body = parseBody(promoSchema, req, res);
  if (!body) return;
  const cfg = await ensureSystemConfig();
  cfg.promotionalOffers.push({
    code: body.code.toUpperCase().trim(),
    description: body.description.trim(),
    discountPercent: body.discountPercent,
    applicablePlan: body.applicablePlan,
    active: true,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null
  });
  await cfg.save();
  res.status(201).json({ promotions: cfg.promotionalOffers });
});
router6.get("/custom-projects", async (_req, res) => {
  const requests = await CustomProjectRequestModel.find({}).sort({ createdAt: -1 }).lean();
  res.json({ requests });
});
router6.put("/custom-projects/:id", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid project ID." });
    return;
  }
  const updateSchema = z6.object({
    status: z6.enum([
      "NEW",
      "REQUIREMENTS_REVIEW",
      "CONSULTATION",
      "QUOTATION_PREPARED",
      "QUOTATION_APPROVED",
      "DEVELOPMENT",
      "TESTING",
      "DEPLOYMENT",
      "MAINTENANCE",
      "COMPLETED"
    ]),
    quotationAmountGhs: z6.number().nullable().optional(),
    maintenanceFeeGhs: z6.number().nullable().optional(),
    internalNotes: z6.string().max(3e3).optional(),
    milestones: z6.array(
      z6.object({
        title: z6.string(),
        dueDate: z6.string(),
        completed: z6.boolean()
      })
    ).optional()
  });
  const body = parseBody(updateSchema, req, res);
  if (!body) return;
  const updated = await CustomProjectRequestModel.findByIdAndUpdate(id, body, { new: true });
  if (!updated) {
    res.status(404).json({ error: "Custom project request not found." });
    return;
  }
  await writeAuditLog({
    userId: req.authUser._id,
    userEmail: req.authUser.email,
    userRole: "SUPER_ADMIN",
    action: "CUSTOM_PROJECT_UPDATED",
    resourceType: "CustomProjectRequest",
    resourceId: String(updated._id),
    details: { status: body.status },
    ipAddress: req.ip
  });
  res.json({ project: updated });
});
router6.get("/support-tickets", async (_req, res) => {
  const tickets = await SupportTicketModel.find({}).sort({ createdAt: -1 }).lean();
  res.json({ tickets });
});
router6.post("/support-tickets/:id/reply", async (req, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID." });
    return;
  }
  const message = String(req.body?.message || "").trim();
  const status = req.body?.status ? String(req.body.status) : "IN_PROGRESS";
  if (!message) {
    res.status(400).json({ error: "Reply message is required." });
    return;
  }
  const ticket = await SupportTicketModel.findById(id);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }
  ticket.responses.push({
    authorName: req.authUser.fullName,
    role: "SUPER_ADMIN",
    message,
    createdAt: /* @__PURE__ */ new Date()
  });
  if (["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)) {
    ticket.status = status;
  }
  await ticket.save();
  res.json({ ticket });
});
router6.get("/subscription-invoices", async (_req, res) => {
  const invoices = await SubscriptionInvoiceModel.find({}).populate("schoolId", "name schoolCode").sort({ createdAt: -1 }).lean();
  res.json({ invoices });
});
router6.get("/audit-logs", async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit || 100));
  const logs = await AuditLogModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ logs });
});
var superAdminRoutes_default = router6;

// server/routes/webhookRoutes.ts
import crypto10 from "crypto";
import express7 from "express";
var router7 = express7.Router();
router7.post("/paystack", async (req, res) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: "Database unavailable" });
    return;
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.headers["x-paystack-signature"];
  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }
  const meta = event.data?.metadata;
  const reference = event.data?.reference || "";
  if (event.event !== "charge.success" || !reference || event.data?.currency !== "GHS") {
    res.status(200).json({ received: true });
    return;
  }
  if (meta?.type === "SUBSCRIPTION") {
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim() || "";
    if (!verifyPaystackWebhookSignature(rawBody, signature, secret)) {
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }
    const invoice = await SubscriptionInvoiceModel.findOne({ paystackReference: reference });
    if (!invoice || invoice.status === "PAID") {
      res.status(200).json({ received: true });
      return;
    }
    const paidGhs = (event.data.amount || 0) / 100;
    if (paidGhs < invoice.amountGhs) {
      res.status(400).json({ error: "Amount mismatch" });
      return;
    }
    invoice.status = "PAID";
    invoice.paidAt = /* @__PURE__ */ new Date();
    invoice.paymentMethod = event.data.channel || "Paystack";
    await invoice.save();
    const days = invoice.billingCycle === "THREE_TERMS" ? 365 : 120;
    const now = /* @__PURE__ */ new Date();
    await SubscriptionModel.findOneAndUpdate(
      { schoolId: invoice.schoolId },
      {
        plan: invoice.plan,
        status: "ACTIVE",
        billingCycle: invoice.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + days * 24 * 60 * 60 * 1e3)
      }
    );
    res.status(200).json({ processed: true });
    return;
  }
  if (meta?.type === "SCHOOL_FEE" && meta.schoolId) {
    const school = await SchoolModel.findById(meta.schoolId);
    const secret = school?.paymentConfig?.paystackSecretEncrypted ? decryptSecret(school.paymentConfig.paystackSecretEncrypted) : "";
    if (!secret || !verifyPaystackWebhookSignature(rawBody, signature, secret)) {
      res.status(401).json({ error: "Invalid school Paystack webhook signature" });
      return;
    }
    const payment = await FeePaymentModel.findOne({
      schoolId: school._id,
      reference
    });
    if (!payment || payment.status === "VERIFIED") {
      res.status(200).json({ received: true });
      return;
    }
    const invoice = await FeeInvoiceModel.findOne({
      _id: payment.invoiceId,
      schoolId: school._id
    });
    if (!invoice) {
      res.status(200).json({ received: true });
      return;
    }
    const paidGhs = roundCurrency((event.data.amount || 0) / 100);
    const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${crypto10.randomBytes(2).toString("hex").toUpperCase()}`;
    payment.status = "VERIFIED";
    payment.receiptNumber = receiptNumber;
    payment.verifiedAt = /* @__PURE__ */ new Date();
    payment.channel = event.data.channel === "card" ? "PAYSTACK_CARD" : "PAYSTACK_MOMO";
    payment.paystackData = event.data;
    await payment.save();
    invoice.amountPaidGhs = roundCurrency(invoice.amountPaidGhs + paidGhs);
    invoice.balanceGhs = roundCurrency(Math.max(0, invoice.totalGhs - invoice.amountPaidGhs));
    invoice.status = invoice.balanceGhs <= 0 ? "PAID" : "PARTIAL";
    await invoice.save();
    await FinancialLedgerModel.create({
      schoolId: school._id,
      entryType: "PAYMENT_CREDIT",
      studentId: invoice.studentId,
      invoiceId: invoice._id,
      paymentId: payment._id,
      amountGhs: -paidGhs,
      description: `Paystack webhook payment ${receiptNumber}`,
      createdBy: payment.recordedBy
    });
    res.status(200).json({ processed: true });
    return;
  }
  res.status(200).json({ received: true });
});
var webhookRoutes_default = router7;

// server/services/automationService.ts
var intervalHandle = null;
var running = false;
async function runAutomationCycle() {
  if (!isDbConnected() || running) return;
  running = true;
  const now = /* @__PURE__ */ new Date();
  try {
    const dueAnnouncements = await AnnouncementModel.find({
      status: "SCHEDULED",
      scheduledFor: { $lte: now }
    }).limit(25);
    for (const ann of dueAnnouncements) {
      ann.status = "PUBLISHED";
      ann.publishedAt = now;
      await ann.save();
      const roleFilter = ann.audience === "TEACHERS" ? { role: { $in: ["CLASS_TEACHER", "SUBJECT_TEACHER"] } } : ann.audience === "PARENTS" ? { role: "PARENT" } : ann.audience === "STUDENTS" ? { role: "STUDENT" } : {};
      const users = await UserModel.find({
        schoolId: ann.schoolId,
        status: "ACTIVE",
        ...roleFilter
      }).select("_id");
      if (users.length > 0) {
        await NotificationModel.insertMany(
          users.map((u) => ({
            schoolId: ann.schoolId,
            userId: u._id,
            title: ann.title,
            message: ann.body.slice(0, 240),
            type: "ANNOUNCEMENT"
          }))
        );
      }
    }
    const dueReminders = await FeeReminderModel.find({
      status: "SCHEDULED",
      scheduledFor: { $lte: now }
    }).limit(25);
    for (const rem of dueReminders) {
      if (rem.channel === "IN_APP") {
        if (rem.guardianUserId) {
          await NotificationModel.create({
            schoolId: rem.schoolId,
            userId: rem.guardianUserId,
            title: rem.subject,
            message: rem.message,
            type: "FEE_REMINDER"
          });
          rem.status = "SENT";
          rem.sentAt = /* @__PURE__ */ new Date();
        } else {
          rem.status = "FAILED";
          rem.errorMessage = "No verified guardian user linked to student.";
        }
      } else if (rem.channel === "EMAIL") {
        const user = rem.guardianUserId ? await UserModel.findById(rem.guardianUserId) : null;
        if (!user?.email) {
          rem.status = "FAILED";
          rem.errorMessage = "No verified guardian email address.";
        } else {
          const result = await sendTransactionalEmail({
            to: user.email,
            subject: rem.subject,
            text: rem.message
          });
          rem.status = result.status === "SENT" ? "SENT" : "FAILED";
          rem.sentAt = result.status === "SENT" ? /* @__PURE__ */ new Date() : null;
          rem.errorMessage = result.error || "";
        }
      } else if (rem.channel === "SMS") {
        const user = rem.guardianUserId ? await UserModel.findById(rem.guardianUserId) : null;
        if (!user?.phone) {
          rem.status = "FAILED";
          rem.errorMessage = "No verified guardian phone number.";
        } else {
          const result = await sendSmsMessage({
            toPhone: user.phone,
            message: rem.message
          });
          rem.status = result.status === "SENT" ? "SENT" : "FAILED";
          rem.sentAt = result.status === "SENT" ? /* @__PURE__ */ new Date() : null;
          rem.errorMessage = result.error || "";
        }
      }
      await rem.save();
    }
    const todayStr = now.toISOString().slice(0, 10);
    await FeeInvoiceModel.updateMany(
      {
        status: { $in: ["UNPAID", "PARTIAL"] },
        dueDate: { $lt: todayStr },
        balanceGhs: { $gt: 0 }
      },
      { $set: { status: "OVERDUE" } }
    );
    await SubscriptionModel.updateMany(
      {
        status: { $in: ["TRIAL", "ACTIVE", "GRACE_PERIOD"] },
        termVacationDate: { $ne: "", $lte: todayStr }
      },
      {
        $set: {
          status: "EXPIRED",
          portalClosedReason: "Term vacation date reached \u2014 subscription term ended and portal closed automatically."
        }
      }
    );
    await SubscriptionModel.updateMany(
      {
        status: "TRIAL",
        trialEndsAt: { $lt: now },
        $or: [{ termVacationDate: "" }, { termVacationDate: { $lte: todayStr } }]
      },
      { $set: { status: "GRACE_PERIOD" } }
    );
  } catch {
  } finally {
    running = false;
  }
}
var lastCycleAt = 0;
function triggerAutomationIfDue() {
  if (!isDbConnected() || running) return;
  const now = Date.now();
  if (now - lastCycleAt < 6e4) return;
  lastCycleAt = now;
  void runAutomationCycle();
}
function startAutomationEngine() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    void runAutomationCycle();
  }, 6e4);
  if (typeof intervalHandle.unref === "function") {
    intervalHandle.unref();
  }
}

// server/app.ts
dotenv.config();
function createApiApp() {
  const app = express8();
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use(
    "/api/webhooks/paystack",
    express8.raw({ type: "application/json", limit: "1mb" })
  );
  app.use(express8.json({ limit: "2mb" }));
  app.use(express8.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());
  app.use("/api", async (_req, _res, next) => {
    await ensureDatabaseConnection();
    if (process.env.VERCEL) {
      triggerAutomationIfDue();
    }
    next();
  });
  app.use("/api/public", publicRoutes_default);
  app.get("/api/health", (req, res, next) => {
    req.url = "/health";
    publicRoutes_default(req, res, next);
  });
  app.use("/api/auth", authRoutes_default);
  app.use("/api/super-admin", superAdminRoutes_default);
  app.use("/api/school", schoolCoreRoutes_default);
  app.use("/api/academics", academicsRoutes_default);
  app.use("/api/complete", completeRoutes_default);
  app.use("/api/webhooks", webhookRoutes_default);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found." });
  });
  app.use(
    (err, req, res, next) => {
      if (!req.path.startsWith("/api")) {
        next(err);
        return;
      }
      const message = err instanceof Error ? err.message : "Unexpected server error";
      res.status(500).json({ error: message });
    }
  );
  return app;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
function startServer() {
  const app = createApiApp();
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    let viteMiddleware = null;
    const viteReadyPromise = import("vite").then(
      ({ createServer: createViteServer }) => createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      })
    ).then((vite) => {
      viteMiddleware = vite.middlewares;
    }).catch((err) => {
      console.error("Failed to initialize Vite dev middleware:", err);
    });
    app.use(async (req, res, next) => {
      await viteReadyPromise;
      if (viteMiddleware) {
        viteMiddleware(req, res, next);
        return;
      }
      next();
    });
  } else {
    const distPath = path2.resolve(__dirname, "dist");
    app.use(express9.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path2.join(distPath, "index.html"));
    });
  }
  const PORT = Number(process.env.PORT || 3e3);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NexaSua platform server listening on http://0.0.0.0:${PORT}`);
  });
  void connectDatabase();
  startAutomationEngine();
}
startServer();
