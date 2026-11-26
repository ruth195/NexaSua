import crypto from 'crypto';
import express from 'express';
import multer from 'multer';
import { z } from 'zod';
import { encryptSecret } from '../config/env.js';
import {
  authenticate,
  getAccraTodayDateString,
  requireActiveSubscriptionWrite,
  requireDb,
  requireRole,
  requireSchoolContext,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { escapeRegex, parseBody, validObjectId } from '../middleware/validate.js';
import {
  AcademicYearModel,
  AssessmentScoreModel,
  AttendanceModel,
  ClassRoomModel,
  GuardianLinkModel,
  NotificationModel,
  SchoolModel,
  StudentModel,
  SubjectModel,
  SubscriptionInvoiceModel,
  SubscriptionModel,
  SupportTicketModel,
  TeacherAssignmentModel,
  TermModel,
  UserModel,
} from '../models/index.js';
import { generateCsvString, parseSpreadsheetBuffer } from '../services/csvExcelService.js';
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from '../services/paystackService.js';
import {
  calculateSubscriptionPrice,
  ensureSystemConfig,
  validateCouponForSchool,
} from '../services/pricingEngine.js';
import { hashPassword, writeAuditLog } from '../services/securityService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(requireDb, authenticate, requireSchoolContext, requireActiveSubscriptionWrite);

// Overview Dashboard (strictly real DB statistics, scoped by role)
router.get('/overview', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const role = req.authUser!.role;
  const today = new Date().toISOString().slice(0, 10);

  if (role === 'STUDENT') {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser!._id })
      .populate('currentClassId', 'name level')
      .lean();
    if (!student) {
      res.json({ role, student: null, publishedResultsCount: 0, attendanceSummary: null, notifications: [] });
      return;
    }
    const [publishedCount, attendanceRecords, notifications] = await Promise.all([
      AssessmentScoreModel.countDocuments({ schoolId, studentId: student._id, status: 'PUBLISHED' }),
      AttendanceModel.find({ schoolId, studentId: student._id }).lean(),
      NotificationModel.find({ userId: req.authUser!._id }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);
    const summary = {
      total: attendanceRecords.length,
      present: attendanceRecords.filter((a) => a.status === 'PRESENT').length,
      absent: attendanceRecords.filter((a) => a.status === 'ABSENT').length,
      late: attendanceRecords.filter((a) => a.status === 'LATE').length,
      excused: attendanceRecords.filter((a) => a.status === 'EXCUSED').length,
    };
    res.json({ role, student, publishedResultsCount: publishedCount, attendanceSummary: summary, notifications });
    return;
  }

  if (role === 'PARENT') {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser!._id,
      verified: true,
    })
      .populate({
        path: 'studentId',
        populate: { path: 'currentClassId', select: 'name level' },
      })
      .lean();
    const notifications = await NotificationModel.find({ userId: req.authUser!._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json({ role, children: links.map((l) => l.studentId).filter(Boolean), notifications });
    return;
  }

  if (role === 'CLASS_TEACHER' || role === 'SUBJECT_TEACHER') {
    const assignments = await TeacherAssignmentModel.find({
      schoolId,
      teacherId: req.authUser!._id,
    })
      .populate('classId', 'name level')
      .populate('subjectId', 'name code')
      .lean();

    const assignedClassIds = [...new Set(assignments.map((a) => String(a.classId?._id || a.classId)))];
    const [studentCount, pendingMarks, submittedMarks, publishedMarks, notifications] =
      await Promise.all([
        StudentModel.countDocuments({
          schoolId,
          currentClassId: { $in: assignedClassIds },
          status: 'ACTIVE',
        }),
        AssessmentScoreModel.countDocuments({
          schoolId,
          teacherId: req.authUser!._id,
          status: 'DRAFT',
        }),
        AssessmentScoreModel.countDocuments({
          schoolId,
          teacherId: req.authUser!._id,
          status: { $in: ['SUBMITTED', 'REVIEWED', 'APPROVED'] },
        }),
        AssessmentScoreModel.countDocuments({
          schoolId,
          teacherId: req.authUser!._id,
          status: 'PUBLISHED',
        }),
        NotificationModel.find({ userId: req.authUser!._id }).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

    res.json({
      role,
      assignments,
      metrics: {
        assignedClasses: assignedClassIds.length,
        assignedSubjects: assignments.length,
        studentsInAssignedClasses: studentCount,
        draftScores: pendingMarks,
        submittedScores: submittedMarks,
        publishedScores: publishedMarks,
      },
      notifications,
    });
    return;
  }

  // Admin / Headteacher / Bursar / Staff
  const [
    studentCount,
    teacherCount,
    classCount,
    subjectCount,
    pendingApprovalScores,
    publishedScores,
    todayPresent,
    todayTotal,
    notifications,
  ] = await Promise.all([
    StudentModel.countDocuments({ schoolId, status: 'ACTIVE' }),
    UserModel.countDocuments({
      schoolId,
      role: { $in: ['CLASS_TEACHER', 'SUBJECT_TEACHER'] },
      status: 'ACTIVE',
    }),
    ClassRoomModel.countDocuments({ schoolId }),
    SubjectModel.countDocuments({ schoolId }),
    AssessmentScoreModel.countDocuments({
      schoolId,
      status: { $in: ['SUBMITTED', 'REVIEWED'] },
    }),
    AssessmentScoreModel.countDocuments({ schoolId, status: 'PUBLISHED' }),
    AttendanceModel.countDocuments({ schoolId, date: today, status: { $in: ['PRESENT', 'LATE'] } }),
    AttendanceModel.countDocuments({ schoolId, date: today }),
    NotificationModel.find({ userId: req.authUser!._id }).sort({ createdAt: -1 }).limit(10).lean(),
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
      todayAttendancePresent: todayPresent,
    },
    onboardingSteps: req.schoolDoc!.onboardingSteps,
    dashboardSettings: req.schoolDoc!.dashboardSettings,
    subscription: req.subscriptionDoc,
    notifications,
  });
});

// Notifications
router.get('/notifications', async (req: AuthenticatedRequest, res) => {
  const notifications = await NotificationModel.find({ userId: req.authUser!._id })
    .sort({ createdAt: -1 })
    .limit(40)
    .lean();
  res.json({ notifications });
});

router.post('/notifications/:id/read', async (req: AuthenticatedRequest, res) => {
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid notification ID.' });
    return;
  }
  await NotificationModel.updateOne({ _id: id, userId: req.authUser!._id }, { read: true });
  res.json({ ok: true });
});

// School Profile & Settings
router.get(
  '/settings',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const school = await SchoolModel.findById(req.authUser!.schoolId)
      .select('-paymentConfig.paystackSecretEncrypted')
      .lean();
    res.json({ school });
  }
);

const updateSettingsSchema = z.object({
  motto: z.string().max(180).optional(),
  phone: z.string().min(7).max(30).optional(),
  address: z.string().min(3).max(240).optional(),
  logoDataUrl: z.string().max(1_500_000).optional(),
  dataRetentionYears: z.number().int().min(1).max(25).optional(),
  reportCardSettings: z
    .object({
      headteacherName: z.string().max(120).optional(),
      showClassPosition: z.boolean().optional(),
      showAttendanceSummary: z.boolean().optional(),
      showQrVerification: z.boolean().optional(),
      footerNote: z.string().max(240).optional(),
      nextTermReopeningDate: z.string().max(40).optional(),
    })
    .optional(),
  dashboardSettings: z
    .object({
      customTitle: z.string().max(120).optional(),
      welcomeMessage: z.string().max(400).optional(),
      primaryColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Primary color must be a valid 6-digit hex color.')
        .optional(),
      accentColor: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'Accent color must be a valid 6-digit hex color.')
        .optional(),
      defaultLandingTab: z
        .enum([
          'overview',
          'students',
          'academics',
          'marks',
          'reports',
          'attendance',
          'analytics',
          'finance',
          'operations',
        ])
        .optional(),
      showSubscriptionBanner: z.boolean().optional(),
      showMetricsCards: z.boolean().optional(),
      showOnboardingChecklist: z.boolean().optional(),
      showNotificationsWidget: z.boolean().optional(),
      showSchoolLogoInSidebar: z.boolean().optional(),
    })
    .optional(),
  paymentConfig: z
    .object({
      paystackPublicKey: z.string().max(120).optional(),
      paystackSecretKey: z.string().max(120).optional(),
      settlementAccountName: z.string().max(120).optional(),
      mobileMoneyInstructions: z.string().max(400).optional(),
      bankTransferInstructions: z.string().max(400).optional(),
    })
    .optional(),
});

router.put(
  '/settings',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(updateSettingsSchema, req, res);
    if (!body) return;

    const school = req.schoolDoc!;
    if (body.motto !== undefined) school.motto = body.motto;
    if (body.phone !== undefined) school.phone = body.phone;
    if (body.address !== undefined) school.address = body.address;
    if (body.dataRetentionYears !== undefined) school.dataRetentionYears = body.dataRetentionYears;

    if (body.logoDataUrl !== undefined) {
      if (body.logoDataUrl && !body.logoDataUrl.startsWith('data:image/')) {
        res.status(400).json({ error: 'Logo must be a valid PNG/JPEG image data URL.' });
        return;
      }
      school.logoDataUrl = body.logoDataUrl;
      if (body.logoDataUrl) school.onboardingSteps.logoUploaded = true;
    }

    if (body.reportCardSettings) {
      school.reportCardSettings = {
        ...school.reportCardSettings,
        ...body.reportCardSettings,
      };
      school.onboardingSteps.reportCardCustomized = true;
    }

    if (body.dashboardSettings) {
      school.dashboardSettings = {
        ...school.dashboardSettings,
        ...body.dashboardSettings,
        ...(body.dashboardSettings.customTitle !== undefined
          ? { customTitle: body.dashboardSettings.customTitle.trim() }
          : {}),
        ...(body.dashboardSettings.welcomeMessage !== undefined
          ? { welcomeMessage: body.dashboardSettings.welcomeMessage.trim() }
          : {}),
      };
    }

    if (body.paymentConfig) {
      const pc = body.paymentConfig;
      if (pc.paystackPublicKey !== undefined) {
        school.paymentConfig.paystackPublicKey = pc.paystackPublicKey.trim();
      }
      if (pc.paystackSecretKey && pc.paystackSecretKey.trim().startsWith('sk_')) {
        school.paymentConfig.paystackSecretEncrypted = encryptSecret(pc.paystackSecretKey.trim());
      }
      if (pc.settlementAccountName !== undefined) {
        school.paymentConfig.settlementAccountName = pc.settlementAccountName.trim();
      }
      if (pc.mobileMoneyInstructions !== undefined) {
        school.paymentConfig.mobileMoneyInstructions = pc.mobileMoneyInstructions.trim();
      }
      if (pc.bankTransferInstructions !== undefined) {
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
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'SCHOOL_SETTINGS_UPDATED',
      resourceType: 'School',
      resourceId: String(school._id),
      ipAddress: req.ip,
    });

    const sanitized = await SchoolModel.findById(school._id)
      .select('-paymentConfig.paystackSecretEncrypted')
      .lean();
    res.json({ school: sanitized });
  }
);

// Academic Years & Terms
router.get('/academic-years', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const [years, terms] = await Promise.all([
    AcademicYearModel.find({ schoolId }).sort({ startDate: -1 }).lean(),
    TermModel.find({ schoolId }).sort({ startDate: 1 }).lean(),
  ]);
  res.json({ academicYears: years, terms });
});

const yearSchema = z.object({
  name: z.string().min(4).max(40),
  startDate: z.string().min(8).max(20),
  endDate: z.string().min(8).max(20),
  isCurrent: z.boolean().default(true),
});

router.post(
  '/academic-years',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(yearSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    if (body.isCurrent) {
      await AcademicYearModel.updateMany({ schoolId }, { isCurrent: false });
    }
    const year = await AcademicYearModel.create({ schoolId, ...body });
    await SchoolModel.updateOne(
      { _id: schoolId },
      { 'onboardingSteps.academicYearSet': true }
    );
    res.status(201).json({ academicYear: year });
  }
);

const termSchema = z.object({
  academicYearId: z.string().min(12),
  name: z.string().min(3).max(40),
  startDate: z.string().min(8).max(20),
  endDate: z.string().min(8).max(20),
  reopeningDate: z.string().max(20).optional(),
  isCurrent: z.boolean().default(true),
});

router.post(
  '/terms',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(termSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const yearId = validObjectId(body.academicYearId);
    if (!yearId || !(await AcademicYearModel.exists({ _id: yearId, schoolId }))) {
      res.status(404).json({ error: 'Academic year not found in this school.' });
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
      reopeningDate: body.reopeningDate || '',
      isCurrent: body.isCurrent,
    });
    await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.termSet': true });
    res.status(201).json({ term });
  }
);

// Classes & Subjects
router.get('/classes', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const classes = await ClassRoomModel.find({ schoolId })
    .populate('classTeacherId', 'fullName email')
    .sort({ level: 1, name: 1 })
    .lean();
  res.json({ classes });
});

const classSchema = z.object({
  name: z.string().min(2).max(60),
  level: z.enum(['Kindergarten', 'Primary', 'Junior High School', 'Senior High School']),
  capacity: z.number().int().min(1).max(300).default(45),
  room: z.string().max(40).optional(),
  classTeacherId: z.string().nullable().optional(),
});

router.post(
  '/classes',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(classSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    let teacherId: string | null = null;
    if (body.classTeacherId) {
      teacherId = validObjectId(body.classTeacherId);
      if (!teacherId || !(await UserModel.exists({ _id: teacherId, schoolId }))) {
        res.status(400).json({ error: 'Selected class teacher does not belong to this school.' });
        return;
      }
    }

    const cls = await ClassRoomModel.create({
      schoolId,
      name: body.name.trim(),
      level: body.level,
      capacity: body.capacity,
      room: body.room || '',
      classTeacherId: teacherId,
    });
    await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.classesCreated': true });
    res.status(201).json({ classRoom: cls });
  }
);

router.get('/subjects', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const subjects = await SubjectModel.find({ schoolId }).sort({ name: 1 }).lean();
  res.json({ subjects });
});

const subjectSchema = z.object({
  name: z.string().min(2).max(80),
  code: z.string().min(2).max(16),
  level: z
    .enum(['Kindergarten', 'Primary', 'Junior High School', 'Senior High School', 'All'])
    .default('All'),
  isCore: z.boolean().default(true),
});

router.post(
  '/subjects',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(subjectSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const subject = await SubjectModel.create({
      schoolId,
      name: body.name.trim(),
      code: body.code.toUpperCase().trim(),
      level: body.level,
      isCore: body.isCore,
    });
    await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.subjectsConfigured': true });
    res.status(201).json({ subject });
  }
);

// School Users (Teachers, Headteacher, Bursar, Admin Staff, Parents) & Teacher Assignments
router.get(
  '/users',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const roleFilter = req.query.role ? String(req.query.role) : undefined;
    const query: Record<string, unknown> = { schoolId };
    if (roleFilter) query.role = roleFilter;
    const users = await UserModel.find(query)
      .select('-passwordHash -mfaSecretEncrypted -mfaBackupCodesHash -verificationTokenHash -resetTokenHash')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ users });
  }
);

const createSchoolUserSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  phone: z.string().max(30).optional(),
  password: z.string().min(8).max(128),
  role: z.enum([
    'HEADTEACHER',
    'CLASS_TEACHER',
    'SUBJECT_TEACHER',
    'BURSAR',
    'ADMIN_STAFF',
    'PARENT',
    'STUDENT',
  ]),
});

router.post(
  '/users',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(createSchoolUserSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const exists = await UserModel.findOne({ email: body.email.toLowerCase().trim() });
    if (exists) {
      res.status(409).json({ error: 'A user with this email already exists.' });
      return;
    }

    const user = await UserModel.create({
      schoolId,
      fullName: body.fullName.trim(),
      email: body.email.toLowerCase().trim(),
      phone: body.phone?.trim() || '',
      passwordHash: hashPassword(body.password),
      role: body.role,
      emailVerified: true,
      status: 'ACTIVE',
    });

    if (body.role === 'CLASS_TEACHER' || body.role === 'SUBJECT_TEACHER') {
      await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.teachersInvited': true });
    }

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'SCHOOL_USER_CREATED',
      resourceType: 'User',
      resourceId: String(user._id),
      details: { role: body.role },
      ipAddress: req.ip,
    });

    res.status(201).json({
      user: {
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
      },
    });
  }
);

router.get('/teacher-assignments', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const query: Record<string, unknown> = { schoolId };
  if (req.authUser!.role === 'CLASS_TEACHER' || req.authUser!.role === 'SUBJECT_TEACHER') {
    query.teacherId = req.authUser!._id;
  }
  const assignments = await TeacherAssignmentModel.find(query)
    .populate('teacherId', 'fullName email role')
    .populate('classId', 'name level')
    .populate('subjectId', 'name code')
    .populate('academicYearId', 'name')
    .lean();
  res.json({ assignments });
});

const assignTeacherSchema = z.object({
  teacherId: z.string().min(12),
  classId: z.string().min(12),
  subjectId: z.string().min(12),
  academicYearId: z.string().min(12),
  isClassTeacher: z.boolean().default(false),
});

router.post(
  '/teacher-assignments',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(assignTeacherSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const [teacher, cls, subj, year] = await Promise.all([
      UserModel.findOne({
        _id: validObjectId(body.teacherId),
        schoolId,
        role: { $in: ['CLASS_TEACHER', 'SUBJECT_TEACHER', 'HEADTEACHER'] },
      }),
      ClassRoomModel.findOne({ _id: validObjectId(body.classId), schoolId }),
      SubjectModel.findOne({ _id: validObjectId(body.subjectId), schoolId }),
      AcademicYearModel.findOne({ _id: validObjectId(body.academicYearId), schoolId }),
    ]);

    if (!teacher || !cls || !subj || !year) {
      res.status(400).json({ error: 'Teacher, class, subject, and academic year must belong to this school.' });
      return;
    }

    const assignment = await TeacherAssignmentModel.findOneAndUpdate(
      {
        schoolId,
        teacherId: teacher._id,
        classId: cls._id,
        subjectId: subj._id,
        academicYearId: year._id,
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

// Students Management
router.get(
  '/students',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER', 'BURSAR', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const search = req.query.search ? String(req.query.search).trim() : '';
    const classId = req.query.classId ? validObjectId(String(req.query.classId)) : null;
    const status = req.query.status ? String(req.query.status) : 'ACTIVE';

    const query: Record<string, unknown> = { schoolId };
    if (status !== 'ALL') query.status = status;
    if (classId) query.currentClassId = classId;

    // Teachers only see students in classes assigned to them!
    if (req.authUser!.role === 'CLASS_TEACHER' || req.authUser!.role === 'SUBJECT_TEACHER') {
      const assignments = await TeacherAssignmentModel.find({
        schoolId,
        teacherId: req.authUser!._id,
      })
        .select('classId')
        .lean();
      const allowedClassIds = assignments.map((a) => String(a.classId));
      if (classId && !allowedClassIds.includes(classId)) {
        res.status(403).json({ error: 'You are not assigned to this class.' });
        return;
      }
      query.currentClassId = classId || { $in: allowedClassIds };
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ fullName: rx }, { admissionNumber: rx }];
    }

    const [students, total] = await Promise.all([
      StudentModel.find(query)
        .populate('currentClassId', 'name level')
        .populate('academicYearId', 'name')
        .sort({ fullName: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      StudentModel.countDocuments(query),
    ]);

    res.json({ students, total, page, limit });
  }
);

const enrollStudentSchema = z.object({
  fullName: z.string().min(2).max(120),
  admissionNumber: z.string().min(2).max(40).optional(),
  gender: z.enum(['Male', 'Female']),
  dateOfBirth: z.string().max(20).optional(),
  classId: z.string().min(12),
  academicYearId: z.string().min(12),
  admissionDate: z.string().min(8).max(20),
  studentCategory: z.enum(['Day', 'Boarding', 'Scholarship']).default('Day'),
  guardianName: z.string().max(120).optional(),
  guardianPhone: z.string().max(30).optional(),
  guardianEmail: z.string().email().optional().or(z.literal('')),
  portalAccount: z
    .object({
      email: z.string().email(),
      password: z.string().min(8),
    })
    .optional(),
});

router.post(
  '/students',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(enrollStudentSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const [cls, year] = await Promise.all([
      ClassRoomModel.findOne({ _id: validObjectId(body.classId), schoolId }),
      AcademicYearModel.findOne({ _id: validObjectId(body.academicYearId), schoolId }),
    ]);

    if (!cls || !year) {
      res.status(400).json({ error: 'Selected class or academic year not found in this school.' });
      return;
    }

    const admissionNumber =
      body.admissionNumber?.trim() ||
      `ADM-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;

    let userId = null;
    if (body.portalAccount) {
      const existing = await UserModel.findOne({ email: body.portalAccount.email.toLowerCase() });
      if (existing) {
        res.status(409).json({ error: 'Student portal email is already registered.' });
        return;
      }
      const user = await UserModel.create({
        schoolId,
        fullName: body.fullName.trim(),
        email: body.portalAccount.email.toLowerCase().trim(),
        passwordHash: hashPassword(body.portalAccount.password),
        role: 'STUDENT',
        emailVerified: true,
        status: 'ACTIVE',
      });
      userId = user._id;
    }

    const student = await StudentModel.create({
      schoolId,
      userId,
      admissionNumber,
      fullName: body.fullName.trim(),
      gender: body.gender,
      dateOfBirth: body.dateOfBirth || '',
      currentClassId: cls._id,
      academicYearId: year._id,
      admissionDate: body.admissionDate,
      studentCategory: body.studentCategory,
      guardianSummary: {
        name: body.guardianName || '',
        phone: body.guardianPhone || '',
        email: body.guardianEmail || '',
        relationship: 'Parent/Guardian',
      },
      academicHistory: [
        {
          academicYearId: year._id,
          academicYearName: year.name,
          classId: cls._id,
          className: cls.name,
          status: 'ACTIVE',
        },
      ],
    });

    await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.studentsEnrolled': true });

    res.status(201).json({ student });
  }
);

router.post(
  '/students/:id/status',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid student ID.' });
      return;
    }

    const schema = z.object({
      status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'ARCHIVED']),
      newClassId: z.string().optional(),
      newAcademicYearId: z.string().optional(),
    });
    const body = parseBody(schema, req, res);
    if (!body) return;

    const student = await StudentModel.findOne({ _id: id, schoolId });
    if (!student) {
      res.status(404).json({ error: 'Student not found.' });
      return;
    }

    let className = '';
    let yearName = '';

    if (body.newClassId) {
      const cls = await ClassRoomModel.findOne({ _id: validObjectId(body.newClassId), schoolId });
      if (!cls) {
        res.status(400).json({ error: 'Target class not found.' });
        return;
      }
      student.currentClassId = cls._id;
      className = cls.name;
    }
    if (body.newAcademicYearId) {
      const yr = await AcademicYearModel.findOne({
        _id: validObjectId(body.newAcademicYearId),
        schoolId,
      });
      if (!yr) {
        res.status(400).json({ error: 'Target academic year not found.' });
        return;
      }
      student.academicYearId = yr._id;
      yearName = yr.name;
    }

    student.status = body.status;
    student.academicHistory.push({
      academicYearId: student.academicYearId,
      academicYearName: yearName || 'Updated Record',
      classId: student.currentClassId,
      className: className || 'Current Class',
      status: body.status,
      recordedAt: new Date(),
    });
    await student.save();

    res.json({ student });
  }
);

router.post(
  '/students/import',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    if (!req.file) {
      res.status(400).json({ error: 'Upload a CSV or Excel (.xlsx) file.' });
      return;
    }
    const classId = validObjectId(String(req.body?.classId || ''));
    const academicYearId = validObjectId(String(req.body?.academicYearId || ''));
    if (!classId || !academicYearId) {
      res.status(400).json({ error: 'Target classId and academicYearId are required.' });
      return;
    }

    const [cls, year] = await Promise.all([
      ClassRoomModel.findOne({ _id: classId, schoolId }),
      AcademicYearModel.findOne({ _id: academicYearId, schoolId }),
    ]);
    if (!cls || !year) {
      res.status(400).json({ error: 'Class or academic year not found in school.' });
      return;
    }

    const rows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    let imported = 0;
    const skipped: string[] = [];

    for (const row of rows) {
      const fullName = row.fullName || row['Full Name'] || row.Name || '';
      if (!fullName) {
        skipped.push('Missing student name');
        continue;
      }
      const adm =
        row.admissionNumber ||
        row['Admission Number'] ||
        `ADM-${new Date().getFullYear()}-${crypto.randomInt(10000, 99999)}`;
      const genderRaw = (row.gender || row.Gender || 'Male').toLowerCase();
      const gender = genderRaw.startsWith('f') ? 'Female' : 'Male';

      try {
        await StudentModel.create({
          schoolId,
          admissionNumber: adm,
          fullName,
          gender,
          dateOfBirth: row.dateOfBirth || row['Date of Birth'] || '',
          currentClassId: cls._id,
          academicYearId: year._id,
          admissionDate: row.admissionDate || new Date().toISOString().slice(0, 10),
          studentCategory: 'Day',
          guardianSummary: {
            name: row.guardianName || row['Guardian Name'] || '',
            phone: row.guardianPhone || row['Guardian Phone'] || '',
            email: row.guardianEmail || row['Guardian Email'] || '',
            relationship: 'Parent/Guardian',
          },
          academicHistory: [
            {
              academicYearId: year._id,
              academicYearName: year.name,
              classId: cls._id,
              className: cls.name,
              status: 'ACTIVE',
            },
          ],
        });
        imported++;
      } catch {
        skipped.push(`Duplicate admission number: ${adm}`);
      }
    }

    if (imported > 0) {
      await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.studentsEnrolled': true });
    }

    res.json({ imported, skippedCount: skipped.length, skipped: skipped.slice(0, 10) });
  }
);

router.get(
  '/students/export',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const students = await StudentModel.find({ schoolId })
      .populate('currentClassId', 'name')
      .sort({ fullName: 1 })
      .lean();

    const csv = generateCsvString(
      ['Admission Number', 'Full Name', 'Gender', 'Class', 'Category', 'Status', 'Guardian Name', 'Guardian Phone'],
      students.map((s) => [
        s.admissionNumber,
        s.fullName,
        s.gender,
        (s.currentClassId as { name?: string } | null)?.name || '',
        s.studentCategory,
        s.status,
        s.guardianSummary?.name || '',
        s.guardianSummary?.phone || '',
      ])
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nexasua-students.csv"');
    res.send(csv);
  }
);

// Verified Guardian-Child Linking
router.get(
  '/guardian-links',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const links = await GuardianLinkModel.find({ schoolId })
      .populate('parentUserId', 'fullName email phone')
      .populate('studentId', 'fullName admissionNumber')
      .lean();
    res.json({ links });
  }
);

const linkGuardianSchema = z.object({
  parentUserId: z.string().min(12),
  studentId: z.string().min(12),
  relationship: z.string().min(2).max(40).default('Parent/Guardian'),
  verified: z.boolean().default(true),
});

router.post(
  '/guardian-links',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(linkGuardianSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const [parent, student] = await Promise.all([
      UserModel.findOne({ _id: validObjectId(body.parentUserId), schoolId, role: 'PARENT' }),
      StudentModel.findOne({ _id: validObjectId(body.studentId), schoolId }),
    ]);

    if (!parent || !student) {
      res.status(400).json({ error: 'Parent user and student must both belong to this school.' });
      return;
    }

    const link = await GuardianLinkModel.findOneAndUpdate(
      { schoolId, parentUserId: parent._id, studentId: student._id },
      {
        relationship: body.relationship,
        verified: body.verified,
        verifiedBy: body.verified ? req.authUser!._id : null,
        verifiedAt: body.verified ? new Date() : null,
      },
      { upsert: true, new: true }
    );

    res.status(201).json({ link });
  }
);

// Attendance Management
router.get('/attendance', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const classId = req.query.classId ? validObjectId(String(req.query.classId)) : null;
  const date = req.query.date ? String(req.query.date) : null;

  if (req.authUser!.role === 'STUDENT') {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser!._id });
    if (!student) {
      res.json({ records: [] });
      return;
    }
    const records = await AttendanceModel.find({ schoolId, studentId: student._id })
      .sort({ date: -1 })
      .limit(90)
      .lean();
    res.json({ records });
    return;
  }

  if (req.authUser!.role === 'PARENT') {
    const studentId = validObjectId(String(req.query.studentId || ''));
    if (!studentId) {
      res.status(400).json({ error: 'studentId is required.' });
      return;
    }
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser!._id,
      studentId,
      verified: true,
    });
    if (!verified) {
      res.status(403).json({ error: 'Verified guardian relationship required.' });
      return;
    }
    const records = await AttendanceModel.find({ schoolId, studentId })
      .sort({ date: -1 })
      .limit(90)
      .lean();
    res.json({ records });
    return;
  }

  const query: Record<string, unknown> = { schoolId };
  if (classId) query.classId = classId;
  if (date) query.date = date;

  const records = await AttendanceModel.find(query)
    .populate('studentId', 'fullName admissionNumber')
    .sort({ date: -1 })
    .limit(200)
    .lean();
  res.json({ records });
});

const markAttendanceSchema = z.object({
  classId: z.string().min(12),
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  date: z.string().min(8).max(20),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(12),
        status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
        note: z.string().max(200).optional(),
      })
    )
    .min(1),
});

router.post(
  '/attendance',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(markAttendanceSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const classId = validObjectId(body.classId);
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);

    if (!classId || !academicYearId || !termId) {
      res.status(400).json({ error: 'Valid class, academic year, and term IDs are required.' });
      return;
    }

    if (req.authUser!.role === 'CLASS_TEACHER' || req.authUser!.role === 'SUBJECT_TEACHER') {
      const assigned = await TeacherAssignmentModel.exists({
        schoolId,
        teacherId: req.authUser!._id,
        classId,
      });
      if (!assigned) {
        res.status(403).json({ error: 'You are not assigned to mark attendance for this class.' });
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
          note: entry.note || '',
          markedBy: req.authUser!._id,
        },
        { upsert: true, new: true }
      );
      saved++;
    }

    res.json({ saved });
  }
);

// Subscription Management for School Admin (Core -> Complete Upgrade, Renewals, Paystack)
const vacationDateSchema = z.object({
  termVacationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Please select a valid vacation date (YYYY-MM-DD).'),
});

router.put(
  '/term-vacation-date',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(vacationDateSchema, req, res);
    if (!body) return;

    if (body.termVacationDate <= getAccraTodayDateString()) {
      res.status(400).json({
        error: 'Your vacation date must be a future calendar date.',
      });
      return;
    }

    const schoolId = req.authUser!.schoolId!;
    const endOfVacation = new Date(`${body.termVacationDate}T23:59:59.000Z`);

    const [school, subscription] = await Promise.all([
      SchoolModel.findByIdAndUpdate(
        schoolId,
        { termVacationDate: body.termVacationDate },
        { new: true }
      ).select('-paymentConfig.paystackSecretEncrypted'),
      SubscriptionModel.findOneAndUpdate(
        { schoolId },
        {
          termVacationDate: body.termVacationDate,
          currentPeriodEnd: endOfVacation,
        },
        { new: true }
      ),
    ]);

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'TERM_VACATION_DATE_SET',
      resourceType: 'School',
      resourceId: schoolId,
      details: { termVacationDate: body.termVacationDate },
      ipAddress: req.ip,
    });

    res.json({
      message: `Term vacation date saved (${body.termVacationDate}). Your school portal will remain open until this date.`,
      termVacationDate: body.termVacationDate,
      school,
      subscription,
    });
  }
);

router.get(
  '/subscription',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const [sub, invoices, activeStudentCount, cfg] = await Promise.all([
      SubscriptionModel.findOne({ schoolId }).lean(),
      SubscriptionInvoiceModel.find({ schoolId }).sort({ createdAt: -1 }).lean(),
      StudentModel.countDocuments({ schoolId, status: 'ACTIVE' }),
      ensureSystemConfig(),
    ]);

    const assignedCoupons = (cfg.promotionalOffers || [])
      .filter((o: any) => {
        if (!o.active) return false;
        if (!o.assignedSchoolId || String(o.assignedSchoolId) !== String(schoolId)) return false;
        if (o.expiresAt && new Date(o.expiresAt).getTime() < Date.now()) return false;
        if (typeof o.maxUses === 'number' && o.maxUses > 0 && (o.usedCount ?? 0) >= o.maxUses) {
          return false;
        }
        return true;
      })
      .map((o: any) => ({
        code: o.code,
        description: o.description,
        discountType: o.discountType || 'PERCENT',
        discountPercent: o.discountPercent || 0,
        discountAmountGhs: o.discountAmountGhs || 0,
        applicablePlan: o.applicablePlan || 'ALL',
        expiresAt: o.expiresAt || null,
      }));

    res.json({
      subscription: sub,
      invoices,
      activeStudentCount,
      pricingBands: cfg.pricingBands,
      planCatalog: cfg.planCatalog,
      threeTermDiscountPercent: cfg.threeTermDiscountPercent,
      assignedCoupons,
    });
  }
);

const validateCouponSchema = z.object({
  promoCode: z.string().min(2).max(40),
  plan: z.enum(['CORE', 'COMPLETE']),
  billingCycle: z.enum(['TERM', 'THREE_TERMS']).default('TERM'),
});

router.post(
  '/subscription/validate-coupon',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(validateCouponSchema, req, res);
    if (!body) return;

    const schoolId = req.authUser!.schoolId!;
    const [school, activeStudents, cfg] = await Promise.all([
      SchoolModel.findById(schoolId),
      StudentModel.countDocuments({ schoolId, status: 'ACTIVE' }),
      ensureSystemConfig(),
    ]);

    const check = validateCouponForSchool({
      coupons: cfg.promotionalOffers || [],
      code: body.promoCode,
      plan: body.plan,
      schoolId,
    });

    if (!check.valid) {
      res.status(400).json({ error: check.error });
      return;
    }

    const population = Math.max(activeStudents, school!.studentPopulationEstimate || 1);
    const quote = calculateSubscriptionPrice({
      studentCount: population,
      plan: body.plan,
      billingCycle: body.billingCycle,
      bands: cfg.pricingBands as unknown as Parameters<typeof calculateSubscriptionPrice>[0]['bands'],
      threeTermDiscountPercent: cfg.threeTermDiscountPercent,
      promoDiscountPercent: check.promoDiscountPercent,
      promoFixedDiscountGhs: check.promoFixedDiscountGhs,
    });

    res.json({
      valid: true,
      coupon: {
        code: check.coupon.code,
        description: check.coupon.description || '',
        discountType: check.coupon.discountType || 'PERCENT',
        discountPercent: check.promoDiscountPercent,
        discountAmountGhs: check.promoFixedDiscountGhs,
        applicablePlan: check.coupon.applicablePlan || 'ALL',
      },
      quote,
    });
  }
);

const checkoutSubSchema = z.object({
  plan: z.enum(['CORE', 'COMPLETE']),
  billingCycle: z.enum(['TERM', 'THREE_TERMS']),
  nextTermVacationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  promoCode: z.string().max(40).optional(),
});

router.post(
  '/subscription/checkout',
  requireRole('SCHOOL_ADMIN'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(checkoutSubSchema, req, res);
    if (!body) return;

    const schoolId = req.authUser!.schoolId!;
    if (body.nextTermVacationDate) {
      if (body.nextTermVacationDate <= getAccraTodayDateString()) {
        res.status(400).json({
          error: 'Your next term vacation date must be a future calendar date.',
        });
        return;
      }
      await SchoolModel.findByIdAndUpdate(schoolId, {
        termVacationDate: body.nextTermVacationDate,
      });
    }

    const [school, activeStudents, cfg] = await Promise.all([
      SchoolModel.findById(schoolId),
      StudentModel.countDocuments({ schoolId, status: 'ACTIVE' }),
      ensureSystemConfig(),
    ]);

    const population = Math.max(activeStudents, school!.studentPopulationEstimate || 1);
    let promoDiscountPercent = 0;
    let promoFixedDiscountGhs = 0;
    let appliedCouponCode = '';

    if (body.promoCode && body.promoCode.trim()) {
      const check = validateCouponForSchool({
        coupons: cfg.promotionalOffers || [],
        code: body.promoCode,
        plan: body.plan,
        schoolId,
      });
      if (!check.valid) {
        res.status(400).json({ error: check.error });
        return;
      }
      promoDiscountPercent = check.promoDiscountPercent;
      promoFixedDiscountGhs = check.promoFixedDiscountGhs;
      appliedCouponCode = check.coupon.code;
    }

    const quote = calculateSubscriptionPrice({
      studentCount: population,
      plan: body.plan,
      billingCycle: body.billingCycle,
      bands: cfg.pricingBands as unknown as Parameters<typeof calculateSubscriptionPrice>[0]['bands'],
      threeTermDiscountPercent: cfg.threeTermDiscountPercent,
      promoDiscountPercent,
      promoFixedDiscountGhs,
    });

    if (quote.isCustomQuote || quote.netPayableGhs === null) {
      res.status(400).json({
        error: 'Schools with over 1,500 students require a custom quotation from NexaFlow.',
      });
      return;
    }

    if (appliedCouponCode) {
      const targetOffer = cfg.promotionalOffers.find(
        (o: { code: string }) => o.code.toUpperCase() === appliedCouponCode
      );
      if (targetOffer) {
        targetOffer.usedCount = Number(targetOffer.usedCount || 0) + 1;
        await cfg.save();
      }
    }

    const invoiceNumber = `SUB-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const paystackRef = `NXS-SUB-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    if (quote.netPayableGhs === 0) {
      const now = new Date();
      const days = body.billingCycle === 'THREE_TERMS' ? 365 : 120;
      const futureVac =
        body.nextTermVacationDate ||
        (school?.termVacationDate && school.termVacationDate > getAccraTodayDateString(now)
          ? school.termVacationDate
          : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      const end = new Date(`${futureVac}T23:59:59.000Z`);

      const invoice = await SubscriptionInvoiceModel.create({
        schoolId,
        invoiceNumber,
        plan: body.plan,
        billingCycle: body.billingCycle,
        studentCountAtBilling: population,
        amountGhs: 0,
        discountAppliedGhs: quote.threeTermDiscountGhs + quote.promoDiscountGhs,
        promoCode: appliedCouponCode,
        status: 'PAID',
        paidAt: now,
        paymentMethod: `Coupon (${appliedCouponCode})`,
        dueDate: now,
        paystackReference: paystackRef,
      });

      await SubscriptionModel.findOneAndUpdate(
        { schoolId },
        {
          plan: body.plan,
          status: 'ACTIVE',
          billingCycle: body.billingCycle,
          currentPeriodStart: now,
          currentPeriodEnd: end,
          termVacationDate: futureVac,
          portalClosedReason: '',
          amountDueGhs: 0,
        }
      );

      res.json({
        invoice,
        paystackConfigured: false,
        activatedFree: true,
        message: `Coupon ${appliedCouponCode} covered 100% — NexaSua ${body.plan} activated immediately!`,
      });
      return;
    }

    const invoice = await SubscriptionInvoiceModel.create({
      schoolId,
      invoiceNumber,
      plan: body.plan,
      billingCycle: body.billingCycle,
      studentCountAtBilling: population,
      amountGhs: quote.netPayableGhs,
      discountAppliedGhs: quote.threeTermDiscountGhs + quote.promoDiscountGhs,
      promoCode: appliedCouponCode,
      status: 'PENDING',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paystackReference: paystackRef,
    });

    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
    if (!secretKey) {
      res.json({
        invoice,
        paystackConfigured: false,
        message: 'Invoice created. Online Paystack billing is not yet configured on this server.',
      });
      return;
    }

    const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const init = await initializePaystackTransaction({
      secretKey,
      email: school!.email,
      amountGhs: quote.netPayableGhs,
      reference: paystackRef,
      callbackUrl: `${baseUrl}/dashboard?subVerify=${paystackRef}`,
      metadata: {
        type: 'SUBSCRIPTION',
        schoolId,
        invoiceId: String(invoice._id),
        plan: body.plan,
        billingCycle: body.billingCycle,
        nextTermVacationDate: body.nextTermVacationDate || school?.termVacationDate || '',
      },
    });

    if (!init.ok) {
      res.status(400).json({ invoice, paystackConfigured: true, error: init.error });
      return;
    }

    res.json({
      invoice,
      paystackConfigured: true,
      authorizationUrl: init.authorizationUrl,
      reference: init.reference,
    });
  }
);

router.post(
  '/subscription/verify-payment',
  requireRole('SCHOOL_ADMIN'),
  async (req: AuthenticatedRequest, res) => {
    const reference = String(req.body?.reference || '').trim();
    const schoolId = req.authUser!.schoolId!;
    const invoice = await SubscriptionInvoiceModel.findOne({ schoolId, paystackReference: reference });
    if (!invoice) {
      res.status(404).json({ error: 'Subscription invoice not found.' });
      return;
    }
    if (invoice.status === 'PAID') {
      res.json({ alreadyProcessed: true, invoice });
      return;
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
    const verify = await verifyPaystackTransaction(secretKey, reference);
    if (!verify.ok || !verify.verified || (verify.amountGhs ?? 0) < invoice.amountGhs) {
      res.status(400).json({ error: verify.error || 'Payment could not be verified with Paystack.' });
      return;
    }

    invoice.status = 'PAID';
    invoice.paidAt = new Date();
    invoice.paymentMethod = verify.channel || 'Paystack';
    await invoice.save();

    const days = invoice.billingCycle === 'THREE_TERMS' ? 365 : 120;
    const now = new Date();
    const school = await SchoolModel.findById(schoolId);
    const futureVac =
      school?.termVacationDate && school.termVacationDate > getAccraTodayDateString(now)
        ? school.termVacationDate
        : new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = new Date(`${futureVac}T23:59:59.000Z`);

    await SubscriptionModel.findOneAndUpdate(
      { schoolId },
      {
        plan: invoice.plan,
        status: 'ACTIVE',
        billingCycle: invoice.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        termVacationDate: futureVac,
        portalClosedReason: '',
        amountDueGhs: 0,
      }
    );

    res.json({ verified: true, invoice });
  }
);

// School Support Tickets
router.get('/support-tickets', async (req: AuthenticatedRequest, res) => {
  const tickets = await SupportTicketModel.find({ schoolId: req.authUser!.schoolId })
    .sort({ createdAt: -1 })
    .lean();
  res.json({ tickets });
});

router.post('/support-tickets', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    subject: z.string().min(3).max(160),
    category: z.string().max(60).default('Technical Support'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    description: z.string().min(10).max(2500),
  });
  const body = parseBody(schema, req, res);
  if (!body) return;

  const ticketNumber = `TKT-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const ticket = await SupportTicketModel.create({
    ticketNumber,
    schoolId: req.authUser!.schoolId,
    userId: req.authUser!._id,
    contactName: req.authUser!.fullName,
    contactEmail: req.authUser!.email,
    ...body,
  });

  res.status(201).json({ ticket });
});

// Data Protection Act (Act 843) Authorized School Data Export
router.get(
  '/data-export',
  requireRole('SCHOOL_ADMIN'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const [school, students, classes, subjects, years, terms] = await Promise.all([
      SchoolModel.findById(schoolId).select('-paymentConfig.paystackSecretEncrypted').lean(),
      StudentModel.find({ schoolId }).lean(),
      ClassRoomModel.find({ schoolId }).lean(),
      SubjectModel.find({ schoolId }).lean(),
      AcademicYearModel.find({ schoolId }).lean(),
      TermModel.find({ schoolId }).lean(),
    ]);

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'DATA_PROTECTION_EXPORT',
      resourceType: 'School',
      resourceId: schoolId,
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="nexasua-school-data-export.json"');
    res.send(JSON.stringify({ exportedAt: new Date().toISOString(), school, academicYears: years, terms, classes, subjects, students }, null, 2));
  }
);

export default router;
