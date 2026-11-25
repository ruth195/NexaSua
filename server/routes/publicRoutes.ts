import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  getJwtSecret,
  getPlatformIntegrationsStatus,
  getSchoolAdminEnvCredentials,
  getSuperAdminEnvCredentials,
  isGoogleOAuthConfigured,
} from '../config/env.js';
import { getAccraTodayDateString } from '../middleware/auth.js';
import { getDbState, isDbConnected, pingDatabase } from '../db.js';
import { requireDb } from '../middleware/auth.js';
import { parseBody } from '../middleware/validate.js';
import {
  AcademicYearModel,
  CustomProjectRequestModel,
  NotificationModel,
  ReportCardModel,
  SchoolModel,
  SupportTicketModel,
  SystemConfigModel,
  TermModel,
  UserModel,
} from '../models/index.js';
import { sendTransactionalEmail } from '../services/messagingService.js';
import {
  calculateSubscriptionPrice,
  DEFAULT_PLAN_CATALOG,
  DEFAULT_PRICING_BANDS,
  ensureSystemConfig,
} from '../services/pricingEngine.js';
import { hashPassword, hashToken, writeAuditLog } from '../services/securityService.js';

const router = express.Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again shortly.' },
});

router.get('/health', async (_req, res) => {
  const dbState = getDbState();
  const integrations = getPlatformIntegrationsStatus(dbState);

  let superAdminInitialized = false;
  let pricingBands = DEFAULT_PRICING_BANDS;
  let planCatalog = DEFAULT_PLAN_CATALOG;
  let trialDays = 7;
  let threeTermDiscountPercent = 10;
  let platformAnnouncement = '';
  let dbPing: { ok: boolean; latencyMs?: number; error?: string } = { ok: false };

  if (isDbConnected()) {
    dbPing = await pingDatabase();
    const cfg = await ensureSystemConfig();
    superAdminInitialized = Boolean(cfg.superAdminInitialized);
    if (cfg.pricingBands?.length) {
      pricingBands = cfg.pricingBands as unknown as typeof DEFAULT_PRICING_BANDS;
    }
    if (cfg.planCatalog?.length) {
      planCatalog = cfg.planCatalog as unknown as typeof DEFAULT_PLAN_CATALOG;
    }
    trialDays = cfg.trialDays;
    threeTermDiscountPercent = cfg.threeTermDiscountPercent;
    platformAnnouncement = cfg.platformAnnouncement || '';
  }

  const envCreds = getSuperAdminEnvCredentials();
  const adminEnvCreds = getSchoolAdminEnvCredentials();
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    dbConnected: isDbConnected(),
    dbPing,
    superAdminInitialized: superAdminInitialized || envCreds.configured,
    superAdminManagedBySecrets: envCreds.configured,
    adminManagedBySecrets: adminEnvCreds.configured,
    googleOAuthEnabled: isGoogleOAuthConfigured(),
    integrations,
    pricing: {
      currency: 'GH₵',
      trialDays,
      threeTermDiscountPercent,
      bands: pricingBands,
      plans: planCatalog,
    },
    platformAnnouncement,
  });
});

const quoteSchema = z.object({
  studentCount: z.number().int().min(1).max(100000),
  plan: z.enum(['CORE', 'COMPLETE']),
  billingCycle: z.enum(['TERM', 'THREE_TERMS']),
  promoCode: z.string().max(40).optional(),
});

router.post('/pricing-quote', async (req, res) => {
  const body = parseBody(quoteSchema, req, res);
  if (!body) return;

  let bands = DEFAULT_PRICING_BANDS;
  let threeTermDiscountPercent = 10;
  let promoDiscountPercent = 0;

  if (isDbConnected()) {
    const cfg = await ensureSystemConfig();
    if (cfg.pricingBands?.length) {
      bands = cfg.pricingBands as unknown as typeof DEFAULT_PRICING_BANDS;
    }
    threeTermDiscountPercent = cfg.threeTermDiscountPercent;

    if (body.promoCode) {
      const codeUpper = body.promoCode.trim().toUpperCase();
      const offer = cfg.promotionalOffers.find(
        (o: {
          code: string;
          active: boolean;
          applicablePlan: string;
          expiresAt?: Date | null;
          discountPercent: number;
        }) =>
          o.code === codeUpper &&
          o.active &&
          (o.applicablePlan === 'ALL' || o.applicablePlan === body.plan) &&
          (!o.expiresAt || new Date(o.expiresAt) > new Date())
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
    promoDiscountPercent,
  });

  res.json(quote);
});

const registerSchoolSchema = z.object({
  schoolName: z.string().min(3).max(160),
  schoolType: z.enum(['Private', 'Public', 'Mission', 'International']),
  educationalLevels: z
    .array(z.enum(['Kindergarten', 'Primary', 'Junior High School', 'Senior High School']))
    .min(1),
  country: z.string().min(2).max(80).default('Ghana'),
  region: z.string().min(2).max(80),
  town: z.string().min(2).max(80),
  address: z.string().min(4).max(240),
  schoolEmail: z.string().email(),
  schoolPhone: z.string().min(7).max(30),
  adminName: z.string().min(2).max(120),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128).optional().or(z.literal('')),
  googleOnboardingToken: z.string().optional(),
  studentPopulation: z.number().int().min(1).max(100000),
  selectedPlan: z.enum(['CORE', 'COMPLETE']),
  termVacationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a valid term vacation date (YYYY-MM-DD).'),
  dataConsentAccepted: z.literal(true, {
    message: 'Data protection consent must be accepted.',
  }),
});

router.post('/register-school', publicLimiter, requireDb, async (req, res) => {
  const body = parseBody(registerSchoolSchema, req, res);
  if (!body) return;

  if (body.termVacationDate <= getAccraTodayDateString()) {
    res.status(400).json({
      error: 'Please choose an upcoming term vacation date in the future.',
    });
    return;
  }

  let verifiedGoogle: { email: string; fullName: string; googleId: string } | null = null;
  if (body.googleOnboardingToken) {
    try {
      const decoded = jwt.verify(body.googleOnboardingToken, getJwtSecret()) as {
        stage?: string;
        email?: string;
        fullName?: string;
        googleId?: string;
      };
      if (decoded.stage === 'GOOGLE_ONBOARDING' && decoded.email && decoded.googleId) {
        verifiedGoogle = {
          email: decoded.email.toLowerCase().trim(),
          fullName: decoded.fullName || body.adminName,
          googleId: decoded.googleId,
        };
      }
    } catch {
      res.status(400).json({ error: 'Google verification expired. Please reconnect with Google or set a password.' });
      return;
    }
  }

  if (!verifiedGoogle && (!body.adminPassword || body.adminPassword.length < 8)) {
    res.status(400).json({ error: 'Administrator password (minimum 8 characters) is required.' });
    return;
  }

  const finalAdminEmail = verifiedGoogle ? verifiedGoogle.email : body.adminEmail.toLowerCase().trim();
  const superCreds = getSuperAdminEnvCredentials();
  if (superCreds.configured && finalAdminEmail === superCreds.email) {
    res.status(409).json({ error: 'This email address is reserved for the platform Super Admin.' });
    return;
  }

  const existingUser = await UserModel.findOne({ email: finalAdminEmail });
  if (existingUser) {
    res.status(409).json({ error: 'An account with this administrator email already exists.' });
    return;
  }

  const pendingCode = `PEND-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const verificationToken = crypto.randomBytes(24).toString('hex');

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
    status: 'PENDING',
    studentPopulationEstimate: body.studentPopulation,
    requestedPlan: body.selectedPlan,
    termVacationDate: body.termVacationDate,
    dataProtectionConsentAt: new Date(),
  });

  const adminUser = await UserModel.create({
    email: finalAdminEmail,
    passwordHash: body.adminPassword ? hashPassword(body.adminPassword) : '',
    googleId: verifiedGoogle ? verifiedGoogle.googleId : '',
    authProvider: verifiedGoogle ? (body.adminPassword ? 'HYBRID' : 'GOOGLE') : 'LOCAL',
    fullName: (verifiedGoogle ? verifiedGoogle.fullName : body.adminName).trim(),
    phone: body.schoolPhone.trim(),
    role: 'SCHOOL_ADMIN',
    schoolId: school._id,
    emailVerified: Boolean(verifiedGoogle),
    verificationTokenHash: verifiedGoogle ? '' : hashToken(verificationToken),
    status: 'ACTIVE',
    dataConsentAcceptedAt: new Date(),
  });

  // Notify Super Admins
  const superAdmins = await UserModel.find({ role: 'SUPER_ADMIN', status: 'ACTIVE' }).select('_id');
  if (superAdmins.length > 0) {
    await NotificationModel.insertMany(
      superAdmins.map((sa) => ({
        schoolId: null,
        userId: sa._id,
        title: 'New School Registration Pending',
        message: `${school.name} (${school.region}) applied for NexaSua ${school.requestedPlan}.`,
        type: 'SCHOOL_APPLICATION',
      }))
    );
  }

  let emailVerificationStatus = 'Google email verified automatically.';
  if (!verifiedGoogle) {
    const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const emailResult = await sendTransactionalEmail({
      to: adminUser.email,
      subject: 'Verify your NexaSua School Administrator Email',
      text: `Hello ${adminUser.fullName},\n\nThank you for registering ${school.name} on NexaSua.\nVerify your email at: ${baseUrl}/login?verifyToken=${verificationToken}\n\nYour school application is currently pending review by NexaFlow Technologies.`,
    });
    emailVerificationStatus =
      emailResult.status === 'SENT'
        ? 'Verification email sent.'
        : 'Email service not configured; verify via administrator dashboard or contact support.';
  }

  await writeAuditLog({
    schoolId: String(school._id),
    userId: String(adminUser._id),
    userEmail: adminUser.email,
    userRole: 'SCHOOL_ADMIN',
    action: 'SCHOOL_REGISTERED',
    resourceType: 'School',
    resourceId: String(school._id),
    details: { plan: body.selectedPlan, population: body.studentPopulation },
    ipAddress: req.ip,
  });

  res.status(201).json({
    message:
      'School application submitted and awaiting NexaFlow Super Admin approval.',
    school: {
      id: school._id,
      name: school.name,
      status: school.status,
      requestedPlan: school.requestedPlan,
    },
    emailVerificationStatus,
  });
});

const customRequestSchema = z.object({
  schoolName: z.string().min(2).max(160),
  contactPerson: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(30),
  location: z.string().min(2).max(120),
  studentPopulation: z.string().min(1).max(40),
  requestedFeatures: z.array(z.string().max(100)).max(20).default([]),
  budgetRange: z.string().min(2).max(80),
  timeline: z.string().min(2).max(80),
  requirements: z.string().max(2500).default(''),
});

router.post('/custom-request', publicLimiter, requireDb, async (req, res) => {
  const body = parseBody(customRequestSchema, req, res);
  if (!body) return;

  const ref = `NXC-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const doc = await CustomProjectRequestModel.create({
    referenceNumber: ref,
    ...body,
    status: 'NEW',
  });

  const superAdmins = await UserModel.find({ role: 'SUPER_ADMIN', status: 'ACTIVE' }).select('_id');
  if (superAdmins.length > 0) {
    await NotificationModel.insertMany(
      superAdmins.map((sa) => ({
        schoolId: null,
        userId: sa._id,
        title: 'New NexaSua Custom Inquiry',
        message: `${body.schoolName} (${body.location}) submitted a custom system inquiry (${ref}).`,
        type: 'CUSTOM_REQUEST',
      }))
    );
  }

  res.status(201).json({
    message: 'Custom school system inquiry received by NexaFlow Technologies.',
    referenceNumber: doc.referenceNumber,
  });
});

const contactSchema = z.object({
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email(),
  subject: z.string().min(3).max(160),
  category: z.string().max(60).default('General Inquiry'),
  description: z.string().min(10).max(2000),
});

router.post('/contact', publicLimiter, requireDb, async (req, res) => {
  const body = parseBody(contactSchema, req, res);
  if (!body) return;

  const ticketNumber = `TKT-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  await SupportTicketModel.create({
    ticketNumber,
    contactName: body.contactName.trim(),
    contactEmail: body.contactEmail.toLowerCase().trim(),
    subject: body.subject.trim(),
    category: body.category,
    priority: 'MEDIUM',
    description: body.description.trim(),
    status: 'OPEN',
  });

  res.status(201).json({
    message: 'Your inquiry has been logged with NexaFlow support.',
    ticketNumber,
  });
});

// Privacy-safe QR verification: NEVER expose full student records publicly!
router.get('/verify-report/:token', requireDb, async (req, res) => {
  const token = String(req.params.token || '').trim();
  if (!token || token.length > 120) {
    res.status(400).json({ valid: false, error: 'Invalid verification token.' });
    return;
  }

  const report = await ReportCardModel.findOne({ verificationToken: token }).lean();
  if (!report) {
    res.status(404).json({ valid: false, error: 'Report card reference could not be verified.' });
    return;
  }

  const [school, year, term] = await Promise.all([
    SchoolModel.findById(report.schoolId).select('name town region').lean(),
    AcademicYearModel.findById(report.academicYearId).select('name').lean(),
    TermModel.findById(report.termId).select('name').lean(),
  ]);

  res.json({
    valid: true,
    referenceNumber: report.referenceNumber,
    schoolName: school?.name || 'Verified School',
    location: school ? `${school.town}, ${school.region}` : '',
    academicYear: year?.name || '',
    termName: term?.name || '',
    issueDate: report.issuedAt,
    note: 'Authentic terminal report record. Student personal details and grades are protected.',
  });
});

export default router;
