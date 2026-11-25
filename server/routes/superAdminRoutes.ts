import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { getPlatformIntegrationsStatus } from '../config/env.js';
import { getDbState, pingDatabase } from '../db.js';
import {
  authenticate,
  requireDb,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { parseBody, validObjectId } from '../middleware/validate.js';
import {
  AssessmentConfigModel,
  AuditLogModel,
  CustomProjectRequestModel,
  NotificationModel,
  SchoolModel,
  StudentModel,
  SubscriptionInvoiceModel,
  SubscriptionModel,
  SupportTicketModel,
  UserModel,
} from '../models/index.js';
import { DEFAULT_30_70_TEMPLATE } from '../services/gradingEngine.js';
import { calculateSubscriptionPrice, ensureSystemConfig } from '../services/pricingEngine.js';
import { hashPassword, writeAuditLog } from '../services/securityService.js';

const router = express.Router();

router.use(requireDb, authenticate, requireRole('SUPER_ADMIN'));

function generateUniqueSchoolCode(name: string): string {
  const prefix = name
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  const suffix = crypto.randomInt(1000, 9999);
  return `NXS-${prefix}-${suffix}`;
}

async function provisionApprovedSchoolDefaults(
  school: InstanceType<typeof SchoolModel>,
  approverId: string
) {
  const cfg = await ensureSystemConfig();
  if (!school.schoolCode || school.schoolCode.startsWith('PEND-')) {
    let code = generateUniqueSchoolCode(school.name);
    while (await SchoolModel.exists({ schoolCode: code })) {
      code = generateUniqueSchoolCode(school.name);
    }
    school.schoolCode = code;
  }
  school.status = 'APPROVED';
  school.approvedAt = new Date();
  school.approvedBy = approverId as unknown as typeof school.approvedBy;
  await school.save();

  const existingSub = await SubscriptionModel.findOne({ schoolId: school._id });
  if (!existingSub) {
    const now = new Date();
    const trialEnd = new Date(now.getTime() + cfg.trialDays * 24 * 60 * 60 * 1000);
    const vacDate = school.termVacationDate || '';
    const periodEnd = vacDate ? new Date(`${vacDate}T23:59:59.000Z`) : trialEnd;
    const quote = calculateSubscriptionPrice({
      studentCount: school.studentPopulationEstimate,
      plan: school.requestedPlan,
      billingCycle: 'TERM',
      bands: cfg.pricingBands as unknown as Parameters<typeof calculateSubscriptionPrice>[0]['bands'],
      threeTermDiscountPercent: cfg.threeTermDiscountPercent,
    });

    await SubscriptionModel.create({
      schoolId: school._id,
      plan: school.requestedPlan,
      status: 'TRIAL',
      billingCycle: 'TERM',
      trialEndsAt: trialEnd,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      termVacationDate: vacDate,
      studentBand: quote.band.label,
      unitPriceGhs: quote.unitTermPriceGhs ?? 0,
      discountPercent: 0,
      amountDueGhs: quote.netPayableGhs ?? 0,
      gracePeriodDays: cfg.gracePeriodDays,
    });
  }

  const existingAssessment = await AssessmentConfigModel.findOne({ schoolId: school._id });
  if (!existingAssessment) {
    await AssessmentConfigModel.create({
      schoolId: school._id,
      ...DEFAULT_30_70_TEMPLATE,
      level: 'All',
      isDefault: true,
    });
  }
}

router.get('/overview', async (_req, res) => {
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
    dbPing,
  ] = await Promise.all([
    SchoolModel.countDocuments({}),
    SchoolModel.countDocuments({ status: 'PENDING' }),
    SchoolModel.countDocuments({ status: 'APPROVED' }),
    SchoolModel.countDocuments({ status: 'SUSPENDED' }),
    SubscriptionModel.countDocuments({ status: 'ACTIVE' }),
    SubscriptionModel.countDocuments({ status: 'TRIAL' }),
    SubscriptionModel.countDocuments({ status: { $in: ['EXPIRED', 'SUSPENDED'] } }),
    SubscriptionModel.countDocuments({ plan: 'CORE' }),
    SubscriptionModel.countDocuments({ plan: 'COMPLETE' }),
    StudentModel.countDocuments({ status: 'ACTIVE' }),
    SubscriptionInvoiceModel.find({ status: 'PAID' }).select('amountGhs').lean(),
    SubscriptionInvoiceModel.countDocuments({ status: 'PENDING' }),
    CustomProjectRequestModel.countDocuments({}),
    SupportTicketModel.countDocuments({ status: { $in: ['OPEN', 'IN_PROGRESS'] } }),
    AuditLogModel.find({}).sort({ createdAt: -1 }).limit(20).lean(),
    pingDatabase(),
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
      openTicketsCount,
    },
    integrations,
    systemHealth: {
      database: dbPing,
      uptimeSeconds: Math.floor(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    },
    recentAuditEvents,
  });
});

router.get('/schools', async (req, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const filter: Record<string, unknown> = {};
  if (status && ['PENDING', 'APPROVED', 'SUSPENDED', 'REJECTED'].includes(status)) {
    filter.status = status;
  }

  const schools = await SchoolModel.find(filter)
    .select('-paymentConfig.paystackSecretEncrypted')
    .sort({ createdAt: -1 })
    .lean();

  const schoolIds = schools.map((s) => s._id);
  const [subs, studentCounts] = await Promise.all([
    SubscriptionModel.find({ schoolId: { $in: schoolIds } }).lean(),
    StudentModel.aggregate([
      { $match: { schoolId: { $in: schoolIds }, status: 'ACTIVE' } },
      { $group: { _id: '$schoolId', count: { $sum: 1 } } },
    ]),
  ]);

  const subMap = new Map(subs.map((s) => [String(s.schoolId), s]));
  const countMap = new Map(studentCounts.map((c) => [String(c._id), c.count]));

  res.json({
    schools: schools.map((s) => ({
      ...s,
      subscription: subMap.get(String(s._id)) || null,
      actualStudentCount: countMap.get(String(s._id)) || 0,
    })),
  });
});

const createSchoolDirectSchema = z.object({
  schoolName: z.string().min(3).max(160),
  schoolType: z.enum(['Private', 'Public', 'Mission', 'International']),
  educationalLevels: z
    .array(z.enum(['Kindergarten', 'Primary', 'Junior High School', 'Senior High School']))
    .min(1),
  country: z.string().default('Ghana'),
  region: z.string().min(2),
  town: z.string().min(2),
  address: z.string().min(3),
  schoolEmail: z.string().email(),
  schoolPhone: z.string().min(7),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8),
  studentPopulation: z.number().int().min(1),
  selectedPlan: z.enum(['CORE', 'COMPLETE']),
});

router.post('/schools', async (req: AuthenticatedRequest, res) => {
  const body = parseBody(createSchoolDirectSchema, req, res);
  if (!body) return;

  const exists = await UserModel.findOne({ email: body.adminEmail.toLowerCase() });
  if (exists) {
    res.status(409).json({ error: 'Administrator email already exists.' });
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
    status: 'APPROVED',
    studentPopulationEstimate: body.studentPopulation,
    requestedPlan: body.selectedPlan,
    dataProtectionConsentAt: new Date(),
  });

  await UserModel.create({
    email: body.adminEmail.toLowerCase(),
    passwordHash: hashPassword(body.adminPassword),
    fullName: body.adminName,
    phone: body.schoolPhone,
    role: 'SCHOOL_ADMIN',
    schoolId: school._id,
    emailVerified: true,
    status: 'ACTIVE',
  });

  await provisionApprovedSchoolDefaults(school, req.authUser!._id);

  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SUPER_ADMIN_CREATED_SCHOOL',
    resourceType: 'School',
    resourceId: String(school._id),
    ipAddress: req.ip,
  });

  res.status(201).json({ school });
});

router.post('/schools/:id/approve', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid school ID.' });
    return;
  }

  const school = await SchoolModel.findById(id);
  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }

  await provisionApprovedSchoolDefaults(school, req.authUser!._id);

  const admins = await UserModel.find({ schoolId: school._id, role: 'SCHOOL_ADMIN' });
  if (admins.length > 0) {
    await NotificationModel.insertMany(
      admins.map((a) => ({
        schoolId: school._id,
        userId: a._id,
        title: 'School Approved on NexaSua',
        message: `${school.name} is approved. Your School Code is ${school.schoolCode}. Complete onboarding to begin.`,
        type: 'SCHOOL_APPROVED',
      }))
    );
  }

  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SCHOOL_APPROVED',
    resourceType: 'School',
    resourceId: String(school._id),
    details: { schoolCode: school.schoolCode },
    ipAddress: req.ip,
  });

  res.json({ school });
});

router.post('/schools/:id/reject', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid school ID.' });
    return;
  }
  const school = await SchoolModel.findByIdAndUpdate(
    id,
    { status: 'REJECTED', rejectionReason: String(req.body?.reason || 'Application declined') },
    { new: true }
  );
  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }

  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SCHOOL_REJECTED',
    resourceType: 'School',
    resourceId: String(school._id),
    ipAddress: req.ip,
  });

  res.json({ school });
});

router.post('/schools/:id/suspend', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid school ID.' });
    return;
  }
  const school = await SchoolModel.findByIdAndUpdate(
    id,
    { status: 'SUSPENDED', suspensionReason: String(req.body?.reason || 'Administrative suspension') },
    { new: true }
  );
  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }
  await SubscriptionModel.updateOne({ schoolId: school._id }, { status: 'SUSPENDED' });

  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SCHOOL_SUSPENDED',
    resourceType: 'School',
    resourceId: String(school._id),
    ipAddress: req.ip,
  });

  res.json({ school });
});

router.post('/schools/:id/reactivate', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid school ID.' });
    return;
  }
  const school = await SchoolModel.findByIdAndUpdate(
    id,
    { status: 'APPROVED', suspensionReason: '' },
    { new: true }
  );
  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }
  await SubscriptionModel.updateOne({ schoolId: school._id }, { status: 'ACTIVE' });

  await writeAuditLog({
    schoolId: String(school._id),
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SCHOOL_REACTIVATED',
    resourceType: 'School',
    resourceId: String(school._id),
    ipAddress: req.ip,
  });

  res.json({ school });
});

const overrideSubSchema = z.object({
  plan: z.enum(['CORE', 'COMPLETE']),
  status: z.enum(['TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED']),
  periodDays: z.number().int().min(1).max(730).optional(),
  termVacationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  overrideNote: z.string().max(400).optional(),
});

router.put('/schools/:id/subscription', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid school ID.' });
    return;
  }
  const body = parseBody(overrideSubSchema, req, res);
  if (!body) return;

  let sub = await SubscriptionModel.findOne({ schoolId: id });
  const cfg = await ensureSystemConfig();
  const vacDate = body.termVacationDate !== undefined ? body.termVacationDate : sub?.termVacationDate || '';
  if (!sub) {
    const end = vacDate
      ? new Date(`${vacDate}T23:59:59.000Z`)
      : new Date(Date.now() + (body.periodDays || cfg.trialDays) * 24 * 60 * 60 * 1000);
    sub = await SubscriptionModel.create({
      schoolId: id,
      plan: body.plan,
      status: body.status,
      billingCycle: 'TERM',
      trialEndsAt: body.status === 'TRIAL' ? end : null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: end,
      termVacationDate: vacDate,
      portalClosedReason: '',
      studentBand: 'Platform Override',
      unitPriceGhs: 0,
      discountPercent: 0,
      amountDueGhs: 0,
      gracePeriodDays: cfg.gracePeriodDays,
      overrideNote: body.overrideNote || 'Set by Super Admin',
    });
  } else {
    sub.plan = body.plan;
    sub.status = body.status;
    if (body.termVacationDate !== undefined) {
      sub.termVacationDate = body.termVacationDate;
      if (body.termVacationDate) {
        sub.currentPeriodEnd = new Date(`${body.termVacationDate}T23:59:59.000Z`);
      }
    } else if (body.periodDays) {
      const end = new Date(Date.now() + body.periodDays * 24 * 60 * 60 * 1000);
      sub.currentPeriodEnd = end;
      if (body.status === 'TRIAL') sub.trialEndsAt = end;
    }
    if (body.status === 'ACTIVE' || body.status === 'TRIAL') {
      sub.portalClosedReason = '';
    }
    if (body.overrideNote !== undefined) sub.overrideNote = body.overrideNote;
    await sub.save();
  }

  if (body.termVacationDate !== undefined) {
    await SchoolModel.findByIdAndUpdate(id, { termVacationDate: body.termVacationDate });
  }

  await writeAuditLog({
    schoolId: id,
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SUBSCRIPTION_OVERRIDE',
    resourceType: 'Subscription',
    resourceId: String(sub._id),
    details: body,
    ipAddress: req.ip,
  });

  res.json({ subscription: sub });
});

function formatWorkspaceSummary(
  school: any,
  sub: any
) {
  return {
    school: {
      id: String(school._id),
      name: school.name,
      schoolCode: school.schoolCode,
      logoDataUrl: school.logoDataUrl,
      motto: school.motto,
      educationalLevels: school.educationalLevels,
      currency: school.currency,
      termVacationDate: school.termVacationDate || sub?.termVacationDate || '',
      onboardingSteps: school.onboardingSteps,
      reportCardSettings: school.reportCardSettings,
      dashboardSettings: school.dashboardSettings,
      paymentConfig: school.paymentConfig
        ? {
            paystackPublicKey: school.paymentConfig.paystackPublicKey,
            hasPaystackSecret: Boolean(school.paymentConfig.paystackSecretEncrypted),
          }
        : undefined,
    },
    subscription: sub
      ? {
          plan: sub.plan,
          status: sub.status,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
          studentBand: sub.studentBand,
          termVacationDate: sub.termVacationDate || school.termVacationDate || '',
          portalClosedReason: sub.portalClosedReason || '',
        }
      : null,
  };
}

router.post('/schools/:id/workspace-context', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid school ID.' });
    return;
  }

  const [school, sub] = await Promise.all([
    SchoolModel.findById(id).select('-paymentConfig.paystackSecretEncrypted').lean(),
    SubscriptionModel.findOne({ schoolId: id }).lean(),
  ]);

  if (!school) {
    res.status(404).json({ error: 'School not found.' });
    return;
  }

  res.json(formatWorkspaceSummary(school, sub));
});

router.post('/ensure-admin-workspace', async (req: AuthenticatedRequest, res) => {
  // Prefer an existing COMPLETE approved school, else any approved school, else provision a flagship NexaFlow workspace
  const completeSub = await SubscriptionModel.findOne({ plan: 'COMPLETE' }).sort({ createdAt: 1 }).lean();
  let school = completeSub
    ? await SchoolModel.findById(completeSub.schoolId).select('-paymentConfig.paystackSecretEncrypted').lean()
    : null;

  if (!school) {
    school = await SchoolModel.findOne({ status: 'APPROVED' })
      .sort({ createdAt: 1 })
      .select('-paymentConfig.paystackSecretEncrypted')
      .lean();
  }

  if (!school) {
    const created = await SchoolModel.create({
      name: 'NexaFlow Flagship Academy',
      schoolCode: generateUniqueSchoolCode('NexaFlow Flagship'),
      schoolType: 'Private',
      educationalLevels: ['Kindergarten', 'Primary', 'Junior High School', 'Senior High School'],
      country: 'Ghana',
      region: 'Greater Accra',
      town: 'Accra',
      address: 'Airport Residential Area, Accra',
      email: req.authUser!.email,
      phone: '+233 30 000 0000',
      status: 'APPROVED',
      studentPopulationEstimate: 350,
      requestedPlan: 'COMPLETE',
      dataProtectionConsentAt: new Date(),
    });
    await provisionApprovedSchoolDefaults(created, req.authUser!._id);
    await SubscriptionModel.updateOne(
      { schoolId: created._id },
      {
        plan: 'COMPLETE',
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        overrideNote: 'Platform Super Admin All-Plans Workspace',
      }
    );
    school = await SchoolModel.findById(created._id)
      .select('-paymentConfig.paystackSecretEncrypted')
      .lean();
  }

  const sub = await SubscriptionModel.findOne({ schoolId: school!._id }).lean();
  res.json(formatWorkspaceSummary(school, sub));
});

router.get('/system-config', async (_req, res) => {
  const cfg = await ensureSystemConfig();
  res.json({ config: cfg });
});

const updateConfigSchema = z.object({
  trialDays: z.number().int().min(1).max(90),
  threeTermDiscountPercent: z.number().min(0).max(50),
  gracePeriodDays: z.number().int().min(0).max(30),
  platformAnnouncement: z.string().max(1000).optional(),
  pricingBands: z
    .array(
      z.object({
        code: z.string(),
        label: z.string(),
        minStudents: z.number().int().min(1),
        maxStudents: z.number().int().nullable(),
        corePriceGhs: z.number().nullable(),
        completePriceGhs: z.number().nullable(),
        isCustomQuote: z.boolean(),
      })
    )
    .min(1),
});

router.put('/system-config', async (req: AuthenticatedRequest, res) => {
  const body = parseBody(updateConfigSchema, req, res);
  if (!body) return;

  const cfg = await ensureSystemConfig();
  cfg.trialDays = body.trialDays;
  cfg.threeTermDiscountPercent = body.threeTermDiscountPercent;
  cfg.gracePeriodDays = body.gracePeriodDays;
  if (body.platformAnnouncement !== undefined) {
    cfg.platformAnnouncement = body.platformAnnouncement;
  }
  cfg.pricingBands = body.pricingBands as unknown as typeof cfg.pricingBands;
  await cfg.save();

  await writeAuditLog({
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SYSTEM_CONFIG_UPDATED',
    resourceType: 'SystemConfig',
    resourceId: String(cfg._id),
    ipAddress: req.ip,
  });

  res.json({ config: cfg });
});

const updatePlansSchema = z.object({
  planCatalog: z
    .array(
      z.object({
        code: z.string().min(2).max(30),
        name: z.string().min(2).max(120),
        tagline: z.string().max(300).default(''),
        durationLabel: z.string().min(2).max(160),
        durationDays: z.number().int().min(1).max(1095),
        startingPriceLabel: z.string().min(1).max(120),
        features: z.array(z.string().min(1).max(240)).max(30),
        isFeatured: z.boolean().default(false),
        isActive: z.boolean().default(true),
      })
    )
    .min(1),
});

router.put('/plans', async (req: AuthenticatedRequest, res) => {
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
    features: p.features.map((f) => f.trim()).filter(Boolean),
  })) as unknown as typeof cfg.planCatalog;
  await cfg.save();

  await writeAuditLog({
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'SUBSCRIPTION_PLANS_UPDATED',
    resourceType: 'SystemConfig',
    resourceId: String(cfg._id),
    details: { planCodes: body.planCatalog.map((p) => p.code) },
    ipAddress: req.ip,
  });

  res.json({ planCatalog: cfg.planCatalog, config: cfg });
});

const promoSchema = z.object({
  code: z.string().min(3).max(30),
  description: z.string().min(3).max(200),
  discountPercent: z.number().min(1).max(100),
  applicablePlan: z.enum(['ALL', 'CORE', 'COMPLETE']),
  expiresAt: z.string().nullable().optional(),
});

router.post('/promotions', async (req: AuthenticatedRequest, res) => {
  const body = parseBody(promoSchema, req, res);
  if (!body) return;

  const cfg = await ensureSystemConfig();
  cfg.promotionalOffers.push({
    code: body.code.toUpperCase().trim(),
    description: body.description.trim(),
    discountPercent: body.discountPercent,
    applicablePlan: body.applicablePlan,
    active: true,
    expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
  });
  await cfg.save();

  res.status(201).json({ promotions: cfg.promotionalOffers });
});

router.get('/custom-projects', async (_req, res) => {
  const requests = await CustomProjectRequestModel.find({}).sort({ createdAt: -1 }).lean();
  res.json({ requests });
});

router.put('/custom-projects/:id', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid project ID.' });
    return;
  }

  const updateSchema = z.object({
    status: z.enum([
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
    ]),
    quotationAmountGhs: z.number().nullable().optional(),
    maintenanceFeeGhs: z.number().nullable().optional(),
    internalNotes: z.string().max(3000).optional(),
    milestones: z
      .array(
        z.object({
          title: z.string(),
          dueDate: z.string(),
          completed: z.boolean(),
        })
      )
      .optional(),
  });
  const body = parseBody(updateSchema, req, res);
  if (!body) return;

  const updated = await CustomProjectRequestModel.findByIdAndUpdate(id, body, { new: true });
  if (!updated) {
    res.status(404).json({ error: 'Custom project request not found.' });
    return;
  }

  await writeAuditLog({
    userId: req.authUser!._id,
    userEmail: req.authUser!.email,
    userRole: 'SUPER_ADMIN',
    action: 'CUSTOM_PROJECT_UPDATED',
    resourceType: 'CustomProjectRequest',
    resourceId: String(updated._id),
    details: { status: body.status },
    ipAddress: req.ip,
  });

  res.json({ project: updated });
});

router.get('/support-tickets', async (_req, res) => {
  const tickets = await SupportTicketModel.find({}).sort({ createdAt: -1 }).lean();
  res.json({ tickets });
});

router.post('/support-tickets/:id/reply', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid ticket ID.' });
    return;
  }

  const message = String(req.body?.message || '').trim();
  const status = req.body?.status ? String(req.body.status) : 'IN_PROGRESS';
  if (!message) {
    res.status(400).json({ error: 'Reply message is required.' });
    return;
  }

  const ticket = await SupportTicketModel.findById(id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found.' });
    return;
  }

  ticket.responses.push({
    authorName: req.authUser!.fullName,
    role: 'SUPER_ADMIN',
    message,
    createdAt: new Date(),
  });
  if (['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
    ticket.status = status as typeof ticket.status;
  }
  await ticket.save();

  res.json({ ticket });
});

router.get('/subscription-invoices', async (_req, res) => {
  const invoices = await SubscriptionInvoiceModel.find({})
    .populate('schoolId', 'name schoolCode')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ invoices });
});

router.get('/audit-logs', async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit || 100));
  const logs = await AuditLogModel.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ logs });
});

export default router;
