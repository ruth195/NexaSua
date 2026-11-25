import crypto from 'crypto';
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import { z } from 'zod';
import {
  authenticate,
  requireActiveSubscriptionWrite,
  requireDb,
  requireRole,
  requireSchoolContext,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { parseBody, validObjectId } from '../middleware/validate.js';
import {
  AcademicYearModel,
  AssessmentConfigModel,
  AssessmentScoreModel,
  AttendanceModel,
  ClassRoomModel,
  GuardianLinkModel,
  ReportCardModel,
  SchoolModel,
  StudentModel,
  SubjectModel,
  TeacherAssignmentModel,
  TermModel,
} from '../models/index.js';
import { generateOptionalDraft } from '../services/aiAssistantService.js';
import { parseSpreadsheetBuffer } from '../services/csvExcelService.js';
import {
  calculateClassRankings,
  calculateStudentSubjectScore,
  DEFAULT_30_70_TEMPLATE,
  type AssessmentCategoryDef,
  type GradingScaleRule,
  type MissingMarkPolicy,
  type RoundingMode,
} from '../services/gradingEngine.js';
import { generateReportCardPdfBuffer, type ReportCardPdfData } from '../services/pdfService.js';
import { signReportVerificationToken, writeAuditLog } from '../services/securityService.js';

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(requireDb, authenticate, requireSchoolContext, requireActiveSubscriptionWrite);

// Assessment Configurations
router.get('/configs', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  let configs = await AssessmentConfigModel.find({ schoolId }).sort({ isDefault: -1 }).lean();
  if (configs.length === 0) {
    const created = await AssessmentConfigModel.create({
      schoolId,
      ...DEFAULT_30_70_TEMPLATE,
      level: 'All',
      isDefault: true,
    });
    configs = [created.toObject()];
  }
  res.json({ configs });
});

const assessmentConfigSchema = z.object({
  name: z.string().min(3).max(100),
  level: z
    .enum(['Kindergarten', 'Primary', 'Junior High School', 'Senior High School', 'All'])
    .default('All'),
  isDefault: z.boolean().default(false),
  passMark: z.number().min(0).max(100).default(50),
  roundingMode: z.enum(['NEAREST_INT', 'ONE_DECIMAL', 'TWO_DECIMAL']).default('ONE_DECIMAL'),
  showClassPosition: z.boolean().default(true),
  missingMarkPolicy: z
    .enum(['TREAT_AS_INCOMPLETE', 'TREAT_AS_ZERO'])
    .default('TREAT_AS_INCOMPLETE'),
  categories: z
    .array(
      z.object({
        key: z.string().min(2).max(40),
        label: z.string().min(2).max(80),
        type: z.enum([
          'CLASS_EXERCISE',
          'QUIZ',
          'ASSIGNMENT',
          'PROJECT',
          'CLASS_TEST',
          'PRACTICAL',
          'CONTINUOUS_ASSESSMENT',
          'END_OF_TERM_EXAM',
        ]),
        maxMarks: z.number().min(1).max(500),
        weightPercent: z.number().min(0).max(100),
        isExam: z.boolean(),
      })
    )
    .min(1),
  gradingScale: z
    .array(
      z.object({
        grade: z.string().min(1).max(10),
        minScore: z.number().min(0).max(100),
        maxScore: z.number().min(0).max(100),
        remark: z.string().min(1).max(40),
      })
    )
    .min(1),
});

router.post(
  '/configs',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(assessmentConfigSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const totalWeight = body.categories.reduce((sum, c) => sum + c.weightPercent, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      res.status(400).json({ error: `Category weights must sum to 100% (currently ${totalWeight}%).` });
      return;
    }

    if (body.isDefault) {
      await AssessmentConfigModel.updateMany({ schoolId }, { isDefault: false });
    }
    const config = await AssessmentConfigModel.create({ schoolId, ...body });
    await SchoolModel.updateOne({ _id: schoolId }, { 'onboardingSteps.gradingConfigured': true });
    res.status(201).json({ config });
  }
);

// Helper: verify teacher assignment when role is teacher
async function verifyTeacherAccess(
  req: AuthenticatedRequest,
  classId: string,
  subjectId: string,
  academicYearId: string
): Promise<boolean> {
  const role = req.authUser!.role;
  if (role === 'SUPER_ADMIN' || role === 'SCHOOL_ADMIN' || role === 'HEADTEACHER') return true;
  if (role !== 'CLASS_TEACHER' && role !== 'SUBJECT_TEACHER') return false;
  const assigned = await TeacherAssignmentModel.exists({
    schoolId: req.authUser!.schoolId,
    teacherId: req.authUser!._id,
    classId,
    subjectId,
    academicYearId,
  });
  return Boolean(assigned);
}

// Get scores for a class + subject + term
router.get(
  '/scores',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const academicYearId = validObjectId(String(req.query.academicYearId || ''));
    const termId = validObjectId(String(req.query.termId || ''));
    const classId = validObjectId(String(req.query.classId || ''));
    const subjectId = validObjectId(String(req.query.subjectId || ''));

    if (!academicYearId || !termId || !classId || !subjectId) {
      res.status(400).json({ error: 'academicYearId, termId, classId, and subjectId are required.' });
      return;
    }

    const allowed = await verifyTeacherAccess(req, classId, subjectId, academicYearId);
    if (!allowed) {
      res.status(403).json({ error: 'You are not assigned to this class and subject.' });
      return;
    }

    const [students, scores] = await Promise.all([
      StudentModel.find({ schoolId, currentClassId: classId, status: 'ACTIVE' })
        .sort({ fullName: 1 })
        .lean(),
      AssessmentScoreModel.find({
        schoolId,
        academicYearId,
        termId,
        classId,
        subjectId,
      }).lean(),
    ]);

    const scoreMap = new Map(scores.map((s) => [String(s.studentId), s]));
    res.json({
      rows: students.map((st) => ({
        student: st,
        scoreRecord: scoreMap.get(String(st._id)) || null,
      })),
    });
  }
);

const saveScoresSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  subjectId: z.string().min(12),
  assessmentConfigId: z.string().min(12),
  submitForReview: z.boolean().default(false),
  correctionReason: z.string().max(300).optional(),
  entries: z
    .array(
      z.object({
        studentId: z.string().min(12),
        scores: z.record(z.string(), z.number().nullable().optional()),
      })
    )
    .min(1),
});

router.post(
  '/scores',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(saveScoresSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);
    const subjectId = validObjectId(body.subjectId);
    const configId = validObjectId(body.assessmentConfigId);

    if (!academicYearId || !termId || !classId || !subjectId || !configId) {
      res.status(400).json({ error: 'Invalid academic reference IDs.' });
      return;
    }

    const allowed = await verifyTeacherAccess(req, classId, subjectId, academicYearId);
    if (!allowed) {
      res.status(403).json({ error: 'You are not assigned to enter scores for this class/subject.' });
      return;
    }

    const config = await AssessmentConfigModel.findOne({ _id: configId, schoolId }).lean();
    if (!config) {
      res.status(404).json({ error: 'Assessment configuration not found.' });
      return;
    }

    const validationErrors: string[] = [];
    const results: unknown[] = [];

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
        studentId,
      });

      // Protect published grades from unauthorized edits!
      if (existing && existing.status === 'PUBLISHED') {
        const isHead =
          req.authUser!.role === 'SUPER_ADMIN' ||
          req.authUser!.role === 'SCHOOL_ADMIN' ||
          req.authUser!.role === 'HEADTEACHER';
        if (!isHead || !body.correctionReason?.trim()) {
          validationErrors.push(
            'Published scores are locked. Headteacher/Admin approval and a correction reason are required.'
          );
          continue;
        }
      }

      const calc = calculateStudentSubjectScore({
        categories: config.categories as unknown as AssessmentCategoryDef[],
        gradingScale: config.gradingScale as unknown as GradingScaleRule[],
        passMark: config.passMark,
        roundingMode: config.roundingMode as RoundingMode,
        missingMarkPolicy: config.missingMarkPolicy as MissingMarkPolicy,
        inputScores: entry.scores,
      });

      if (!calc.valid) {
        validationErrors.push(...calc.errors);
        continue;
      }

      const nextStatus =
        existing?.status === 'PUBLISHED'
          ? 'PUBLISHED'
          : body.submitForReview
          ? 'SUBMITTED'
          : 'DRAFT';

      const doc = await AssessmentScoreModel.findOneAndUpdate(
        { schoolId, academicYearId, termId, classId, subjectId, studentId },
        {
          teacherId: req.authUser!._id,
          assessmentConfigId: config._id,
          categoryScores: calc.normalizedCategories,
          caScore: calc.caScore,
          examScore: calc.examScore,
          finalScore: calc.finalScore,
          grade: calc.grade,
          remark: calc.remark,
          hasMissingMarks: calc.hasMissingMarks,
          status: nextStatus,
          submittedAt: body.submitForReview ? new Date() : existing?.submittedAt || null,
          correctionReason: body.correctionReason || existing?.correctionReason || '',
          lastModifiedBy: req.authUser!._id,
        },
        { upsert: true, new: true }
      );

      if (existing?.status === 'PUBLISHED') {
        await writeAuditLog({
          schoolId,
          userId: req.authUser!._id,
          userEmail: req.authUser!.email,
          userRole: req.authUser!.role,
          action: 'PUBLISHED_GRADE_CORRECTED',
          resourceType: 'AssessmentScore',
          resourceId: String(doc._id),
          details: {
            reason: body.correctionReason,
            previousFinal: existing.finalScore,
            newFinal: calc.finalScore,
          },
          ipAddress: req.ip,
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
      scores: results,
    });
  }
);

// Bulk examination marks upload (CSV / Excel)
router.post(
  '/scores/import',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'),
  upload.single('file'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    if (!req.file) {
      res.status(400).json({ error: 'Upload a CSV or Excel (.xlsx) marks file.' });
      return;
    }
    const academicYearId = validObjectId(String(req.body?.academicYearId || ''));
    const termId = validObjectId(String(req.body?.termId || ''));
    const classId = validObjectId(String(req.body?.classId || ''));
    const subjectId = validObjectId(String(req.body?.subjectId || ''));
    const configId = validObjectId(String(req.body?.assessmentConfigId || ''));

    if (!academicYearId || !termId || !classId || !subjectId || !configId) {
      res.status(400).json({ error: 'Academic year, term, class, subject, and config IDs required.' });
      return;
    }

    const allowed = await verifyTeacherAccess(req, classId, subjectId, academicYearId);
    if (!allowed) {
      res.status(403).json({ error: 'Not assigned to this class/subject.' });
      return;
    }

    const [config, students] = await Promise.all([
      AssessmentConfigModel.findOne({ _id: configId, schoolId }).lean(),
      StudentModel.find({ schoolId, currentClassId: classId, status: 'ACTIVE' }).lean(),
    ]);

    if (!config) {
      res.status(404).json({ error: 'Assessment config not found.' });
      return;
    }

    const studentByAdm = new Map(students.map((s) => [s.admissionNumber.toUpperCase(), s]));
    const rows = await parseSpreadsheetBuffer(req.file.buffer, req.file.originalname);
    let saved = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const adm = (row.admissionNumber || row['Admission Number'] || '').toUpperCase().trim();
      const student = studentByAdm.get(adm);
      if (!student) {
        errors.push(`Student not found in class: ${adm || 'blank row'}`);
        continue;
      }

      const inputScores: Record<string, number | null> = {};
      for (const cat of config.categories as unknown as AssessmentCategoryDef[]) {
        const raw = row[cat.key] ?? row[cat.label] ?? '';
        inputScores[cat.key] = raw === '' ? null : Number(raw);
      }

      const calc = calculateStudentSubjectScore({
        categories: config.categories as unknown as AssessmentCategoryDef[],
        gradingScale: config.gradingScale as unknown as GradingScaleRule[],
        passMark: config.passMark,
        roundingMode: config.roundingMode as RoundingMode,
        missingMarkPolicy: config.missingMarkPolicy as MissingMarkPolicy,
        inputScores,
      });

      if (!calc.valid) {
        errors.push(`${adm}: ${calc.errors.join('; ')}`);
        continue;
      }

      const existing = await AssessmentScoreModel.findOne({
        schoolId,
        academicYearId,
        termId,
        classId,
        subjectId,
        studentId: student._id,
      }).select('status');

      if (existing?.status === 'PUBLISHED') {
        errors.push(`${adm}: Published scores are locked and cannot be overwritten by bulk import.`);
        continue;
      }

      await AssessmentScoreModel.findOneAndUpdate(
        { schoolId, academicYearId, termId, classId, subjectId, studentId: student._id },
        {
          teacherId: req.authUser!._id,
          assessmentConfigId: config._id,
          categoryScores: calc.normalizedCategories,
          caScore: calc.caScore,
          examScore: calc.examScore,
          finalScore: calc.finalScore,
          grade: calc.grade,
          remark: calc.remark,
          hasMissingMarks: calc.hasMissingMarks,
          status: 'DRAFT',
          lastModifiedBy: req.authUser!._id,
        },
        { upsert: true, new: true }
      );
      saved++;
    }

    res.json({ imported: saved, errors: errors.slice(0, 15) });
  }
);

// Class Teacher & Headteacher Review Summary (detects missing marks, unsubmitted subjects, pending approvals)
router.get(
  '/review-summary',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const academicYearId = validObjectId(String(req.query.academicYearId || ''));
    const termId = validObjectId(String(req.query.termId || ''));
    if (!academicYearId || !termId) {
      res.status(400).json({ error: 'academicYearId and termId are required.' });
      return;
    }

    const classFilter: Record<string, unknown> = { schoolId };
    if (req.authUser!.role === 'CLASS_TEACHER') {
      classFilter.classTeacherId = req.authUser!._id;
    }

    const classes = await ClassRoomModel.find(classFilter).lean();
    const classIds = classes.map((c) => c._id);

    const [assignments, scores, studentCounts] = await Promise.all([
      TeacherAssignmentModel.find({ schoolId, academicYearId, classId: { $in: classIds } })
        .populate('subjectId', 'name code')
        .populate('teacherId', 'fullName')
        .lean(),
      AssessmentScoreModel.find({
        schoolId,
        academicYearId,
        termId,
        classId: { $in: classIds },
      }).lean(),
      StudentModel.aggregate([
        {
          $match: {
            schoolId: new mongoose.Types.ObjectId(schoolId),
            currentClassId: { $in: classIds },
            status: 'ACTIVE',
          },
        },
        { $group: { _id: '$currentClassId', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map(studentCounts.map((c) => [String(c._id), c.count]));

    const summary = classes.map((cls) => {
      const clsAssignments = assignments.filter((a) => String(a.classId) === String(cls._id));
      const clsScores = scores.filter((s) => String(s.classId) === String(cls._id));
      const expectedStudents = countMap.get(String(cls._id)) || 0;

      const subjects = clsAssignments.map((a) => {
        const subjId = String((a.subjectId as { _id?: unknown })?._id || a.subjectId);
        const subjScores = clsScores.filter((s) => String(s.subjectId) === subjId);
        const missingCount = Math.max(0, expectedStudents - subjScores.length) +
          subjScores.filter((s) => s.hasMissingMarks).length;

        const statusCounts = {
          DRAFT: subjScores.filter((s) => s.status === 'DRAFT').length,
          SUBMITTED: subjScores.filter((s) => s.status === 'SUBMITTED').length,
          REVIEWED: subjScores.filter((s) => s.status === 'REVIEWED').length,
          APPROVED: subjScores.filter((s) => s.status === 'APPROVED').length,
          PUBLISHED: subjScores.filter((s) => s.status === 'PUBLISHED').length,
        };

        return {
          subjectId: subjId,
          subjectName: (a.subjectId as { name?: string })?.name || 'Subject',
          teacherName: (a.teacherId as { fullName?: string })?.fullName || 'Teacher',
          expectedStudents,
          enteredCount: subjScores.length,
          missingCount,
          statusCounts,
        };
      });

      return {
        classId: cls._id,
        className: cls.name,
        level: cls.level,
        expectedStudents,
        subjects,
      };
    });

    res.json({ summary });
  }
);

// Approval & Publication Workflow
const workflowSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  subjectId: z.string().optional(),
  action: z.enum(['REVIEW', 'APPROVE', 'PUBLISH', 'RETURN_TO_DRAFT']),
});

router.post(
  '/workflow',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(workflowSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);

    if (!academicYearId || !termId || !classId) {
      res.status(400).json({ error: 'Invalid academicYearId, termId, or classId.' });
      return;
    }

    if (
      (body.action === 'APPROVE' || body.action === 'PUBLISH') &&
      req.authUser!.role === 'CLASS_TEACHER'
    ) {
      res.status(403).json({
        error: 'Only Headteachers or School Administrators can approve and publish final results.',
      });
      return;
    }

    if (req.authUser!.role === 'CLASS_TEACHER') {
      const isClassTeacher = await ClassRoomModel.exists({
        _id: classId,
        schoolId,
        classTeacherId: req.authUser!._id,
      });
      if (!isClassTeacher) {
        res.status(403).json({ error: 'You are not the assigned class teacher for this class.' });
        return;
      }
    }

    const filter: Record<string, unknown> = { schoolId, academicYearId, termId, classId };
    if (body.subjectId) {
      const sid = validObjectId(body.subjectId);
      if (sid) filter.subjectId = sid;
    }

    let update: Record<string, unknown> = {};
    if (body.action === 'REVIEW') {
      filter.status = { $in: ['SUBMITTED', 'DRAFT'] };
      update = { status: 'REVIEWED', reviewedBy: req.authUser!._id, reviewedAt: new Date() };
    } else if (body.action === 'APPROVE') {
      filter.status = { $in: ['SUBMITTED', 'REVIEWED'] };
      update = { status: 'APPROVED', approvedBy: req.authUser!._id, approvedAt: new Date() };
    } else if (body.action === 'PUBLISH') {
      filter.status = { $in: ['APPROVED', 'REVIEWED', 'SUBMITTED'] };
      update = {
        status: 'PUBLISHED',
        approvedBy: req.authUser!._id,
        approvedAt: new Date(),
        publishedAt: new Date(),
      };
    } else if (body.action === 'RETURN_TO_DRAFT') {
      filter.status = { $in: ['SUBMITTED', 'REVIEWED', 'APPROVED'] };
      update = { status: 'DRAFT' };
    }

    const result = await AssessmentScoreModel.updateMany(filter, { $set: update });

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: `RESULTS_${body.action}`,
      resourceType: 'AssessmentScore',
      resourceId: `${classId}:${termId}`,
      details: { modifiedCount: result.modifiedCount, subjectId: body.subjectId || 'ALL' },
      ipAddress: req.ip,
    });

    res.json({ modifiedCount: result.modifiedCount, action: body.action });
  }
);

// Generate Terminal Report Cards for a class & term
const generateReportsSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  promotionStatus: z.string().max(80).optional(),
  defaultClassTeacherRemarks: z.string().max(300).optional(),
  defaultHeadteacherRemarks: z.string().max(300).optional(),
});

router.post(
  '/report-cards/generate',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(generateReportsSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);

    if (!academicYearId || !termId || !classId) {
      res.status(400).json({ error: 'Invalid IDs.' });
      return;
    }

    const [students, publishedScores, term, attendanceRecords] = await Promise.all([
      StudentModel.find({ schoolId, currentClassId: classId, status: 'ACTIVE' }).lean(),
      AssessmentScoreModel.find({
        schoolId,
        academicYearId,
        termId,
        classId,
        status: 'PUBLISHED',
      }).lean(),
      TermModel.findOne({ _id: termId, schoolId }).lean(),
      AttendanceModel.find({ schoolId, academicYearId, termId, classId }).lean(),
    ]);

    if (students.length === 0) {
      res.status(400).json({ error: 'No active students found in this class.' });
      return;
    }

    if (publishedScores.length === 0) {
      res.status(400).json({
        error: 'No published examination results found for this class and term. Approve and publish results first.',
      });
      return;
    }

    const studentAverages = students.map((st) => {
      const stScores = publishedScores.filter(
        (sc) => String(sc.studentId) === String(st._id) && sc.finalScore !== null
      );
      const avg =
        stScores.length > 0
          ? stScores.reduce((sum, s) => sum + (s.finalScore || 0), 0) / stScores.length
          : 0;
      return { studentId: String(st._id), averageScore: Math.round(avg * 10) / 10 };
    });

    const rankings = calculateClassRankings(studentAverages);
    const rankMap = new Map(rankings.map((r) => [r.studentId, r]));

    const generated: unknown[] = [];
    for (const st of students) {
      const stId = String(st._id);
      const rankInfo = rankMap.get(stId);
      const stAtt = attendanceRecords.filter((a) => String(a.studentId) === stId);

      const existing = await ReportCardModel.findOne({
        schoolId,
        studentId: st._id,
        academicYearId,
        termId,
      });

      const ref =
        existing?.referenceNumber ||
        `RC-${req.schoolDoc!.schoolCode}-${crypto.randomInt(100000, 999999)}`;
      const verificationToken =
        existing?.verificationToken || signReportVerificationToken(ref, schoolId);

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
            present: stAtt.filter((a) => a.status === 'PRESENT').length,
            absent: stAtt.filter((a) => a.status === 'ABSENT').length,
            late: stAtt.filter((a) => a.status === 'LATE').length,
            excused: stAtt.filter((a) => a.status === 'EXCUSED').length,
            totalDays: stAtt.length,
          },
          classTeacherRemarks:
            body.defaultClassTeacherRemarks ||
            existing?.classTeacherRemarks ||
            'Consistent classroom participation and effort.',
          headteacherRemarks:
            body.defaultHeadteacherRemarks ||
            existing?.headteacherRemarks ||
            'Keep up the good academic focus.',
          promotionStatus: body.promotionStatus || existing?.promotionStatus || 'In Progress',
          reopeningDate:
            term?.reopeningDate || req.schoolDoc!.reportCardSettings?.nextTermReopeningDate || '',
          issuedAt: new Date(),
          issuedBy: req.authUser!._id,
        },
        { upsert: true, new: true }
      );
      generated.push(doc);
    }

    res.json({ generatedCount: generated.length, reportCards: generated });
  }
);

router.get('/report-cards', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const role = req.authUser!.role;
  const query: Record<string, unknown> = { schoolId };

  if (req.query.academicYearId && validObjectId(String(req.query.academicYearId))) {
    query.academicYearId = req.query.academicYearId;
  }
  if (req.query.termId && validObjectId(String(req.query.termId))) {
    query.termId = req.query.termId;
  }
  if (req.query.classId && validObjectId(String(req.query.classId))) {
    query.classId = req.query.classId;
  }

  if (role === 'STUDENT') {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser!._id });
    if (!student) {
      res.json({ reportCards: [] });
      return;
    }
    query.studentId = student._id;
  } else if (role === 'PARENT') {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser!._id,
      verified: true,
    }).select('studentId');
    query.studentId = { $in: links.map((l) => l.studentId) };
  }

  const reportCards = await ReportCardModel.find(query)
    .populate('studentId', 'fullName admissionNumber')
    .populate('classId', 'name level')
    .populate('academicYearId', 'name')
    .populate('termId', 'name')
    .sort({ issuedAt: -1 })
    .lean();

  res.json({ reportCards });
});

async function buildReportCardPdfItem(
  report: Record<string, any>,
  school: InstanceType<typeof SchoolModel>,
  baseUrl: string
): Promise<ReportCardPdfData> {
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
      status: 'PUBLISHED',
    })
      .populate('subjectId', 'name')
      .lean(),
  ]);

  return {
    schoolName: school.name,
    schoolAddress: `${school.address}, ${school.town}, ${school.region}`,
    schoolPhone: school.phone,
    schoolEmail: school.email,
    schoolMotto: school.motto,
    schoolLogoDataUrl: school.logoDataUrl,
    studentName: student?.fullName || 'Student',
    admissionNumber: student?.admissionNumber || '',
    className: cls?.name || '',
    educationalLevel: cls?.level || 'Basic/Secondary',
    academicYear: year?.name || '',
    termName: term?.name || '',
    referenceNumber: report.referenceNumber,
    verificationUrl: `${baseUrl}/verify-report?token=${encodeURIComponent(report.verificationToken)}`,
    issueDate: new Date(report.issuedAt).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
    reopeningDate: report.reopeningDate || school.reportCardSettings?.nextTermReopeningDate || '',
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
      totalDays: 0,
    },
    subjects: scores.map((sc) => ({
      subjectName: (sc.subjectId as { name?: string } | null)?.name || 'Subject',
      caScore: sc.caScore,
      examScore: sc.examScore,
      finalScore: sc.finalScore,
      grade: sc.grade,
      remark: sc.remark,
    })),
    classTeacherRemarks: report.classTeacherRemarks || '',
    headteacherRemarks: report.headteacherRemarks || '',
    headteacherName: school.reportCardSettings?.headteacherName || '',
    promotionStatus: report.promotionStatus || '',
    footerNote: school.reportCardSettings?.footerNote || '',
  };
}

router.get('/report-cards/bulk/pdf', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  if (!['SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER'].includes(req.authUser!.role)) {
    res.status(403).json({ error: 'Not authorized for bulk report card PDF generation.' });
    return;
  }
  const classId = validObjectId(String(req.query.classId || ''));
  const academicYearId = validObjectId(String(req.query.academicYearId || ''));
  const termId = validObjectId(String(req.query.termId || ''));
  if (!classId || !academicYearId || !termId) {
    res.status(400).json({ error: 'classId, academicYearId, and termId are required.' });
    return;
  }

  const reports = await ReportCardModel.find({
    schoolId,
    classId,
    academicYearId,
    termId,
  }).lean();
  if (reports.length === 0) {
    res.status(404).json({ error: 'No report cards generated for this class and term.' });
    return;
  }

  const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
  const items = await Promise.all(
    reports.map((r) => buildReportCardPdfItem(r, req.schoolDoc!, baseUrl))
  );
  const pdf = await generateReportCardPdfBuffer(items);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="nexasua-class-report-cards.pdf"');
  res.send(pdf);
});

router.get('/report-cards/:id/pdf', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid report card ID.' });
    return;
  }

  const report = await ReportCardModel.findOne({ _id: id, schoolId }).lean();
  if (!report) {
    res.status(404).json({ error: 'Report card not found.' });
    return;
  }

  if (req.authUser!.role === 'STUDENT') {
    const student = await StudentModel.findOne({ schoolId, userId: req.authUser!._id });
    if (!student || String(student._id) !== String(report.studentId)) {
      res.status(403).json({ error: 'You may only download your own report card.' });
      return;
    }
  } else if (req.authUser!.role === 'PARENT') {
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser!._id,
      studentId: report.studentId,
      verified: true,
    });
    if (!verified) {
      res.status(403).json({ error: 'Verified guardian relationship required.' });
      return;
    }
  }

  const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
  const item = await buildReportCardPdfItem(report, req.schoolDoc!, baseUrl);
  const pdf = await generateReportCardPdfBuffer([item]);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${report.referenceNumber}.pdf"`
  );
  res.send(pdf);
});

// Student & Parent Published Results (strictly PUBLISHED only!)
router.get('/published-results', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  let studentId = '';

  if (req.authUser!.role === 'STUDENT') {
    const st = await StudentModel.findOne({ schoolId, userId: req.authUser!._id });
    if (!st) {
      res.json({ results: [] });
      return;
    }
    studentId = String(st._id);
  } else if (req.authUser!.role === 'PARENT') {
    const requested = validObjectId(String(req.query.studentId || ''));
    if (!requested) {
      res.status(400).json({ error: 'studentId is required.' });
      return;
    }
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser!._id,
      studentId: requested,
      verified: true,
    });
    if (!verified) {
      res.status(403).json({ error: 'Access denied: guardian link is not verified.' });
      return;
    }
    studentId = requested;
  } else {
    res.status(403).json({ error: 'Use class marks endpoints for staff views.' });
    return;
  }

  const results = await AssessmentScoreModel.find({
    schoolId,
    studentId,
    status: 'PUBLISHED',
  })
    .populate('subjectId', 'name code')
    .populate('academicYearId', 'name')
    .populate('termId', 'name')
    .populate('classId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ results });
});

// Academic Analytics (real DB calculations)
router.get(
  '/analytics',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const query: Record<string, unknown> = { schoolId, status: 'PUBLISHED' };
    if (req.query.academicYearId && validObjectId(String(req.query.academicYearId))) {
      query.academicYearId = req.query.academicYearId;
    }
    if (req.query.termId && validObjectId(String(req.query.termId))) {
      query.termId = req.query.termId;
    }

    const scores = await AssessmentScoreModel.find(query)
      .populate('classId', 'name')
      .populate('subjectId', 'name')
      .populate('studentId', 'fullName admissionNumber')
      .lean();

    if (scores.length === 0) {
      res.json({
        hasData: false,
        overallMean: 0,
        passRate: 0,
        totalEvaluated: 0,
        gradeDistribution: [],
        byClass: [],
        bySubject: [],
        studentsNeedingSupport: [],
      });
      return;
    }

    const validScores = scores.filter((s) => s.finalScore !== null);
    const overallMean =
      validScores.length > 0
        ? Math.round(
            (validScores.reduce((sum, s) => sum + (s.finalScore || 0), 0) / validScores.length) *
              10
          ) / 10
        : 0;
    const passCount = validScores.filter((s) => (s.finalScore || 0) >= 50).length;
    const passRate =
      validScores.length > 0 ? Math.round((passCount / validScores.length) * 1000) / 10 : 0;

    const gradeMap = new Map<string, number>();
    const classMap = new Map<string, { name: string; total: number; count: number }>();
    const subjectMap = new Map<string, { name: string; total: number; count: number }>();
    const studentMap = new Map<
      string,
      { fullName: string; admissionNumber: string; total: number; count: number }
    >();

    for (const s of validScores) {
      gradeMap.set(s.grade, (gradeMap.get(s.grade) || 0) + 1);

      const cls = s.classId as { _id?: unknown; name?: string } | null;
      if (cls?._id) {
        const key = String(cls._id);
        const cur = classMap.get(key) || { name: cls.name || 'Class', total: 0, count: 0 };
        cur.total += s.finalScore || 0;
        cur.count += 1;
        classMap.set(key, cur);
      }

      const subj = s.subjectId as { _id?: unknown; name?: string } | null;
      if (subj?._id) {
        const key = String(subj._id);
        const cur = subjectMap.get(key) || { name: subj.name || 'Subject', total: 0, count: 0 };
        cur.total += s.finalScore || 0;
        cur.count += 1;
        subjectMap.set(key, cur);
      }

      const st = s.studentId as { _id?: unknown; fullName?: string; admissionNumber?: string } | null;
      if (st?._id) {
        const key = String(st._id);
        const cur = studentMap.get(key) || {
          fullName: st.fullName || 'Student',
          admissionNumber: st.admissionNumber || '',
          total: 0,
          count: 0,
        };
        cur.total += s.finalScore || 0;
        cur.count += 1;
        studentMap.set(key, cur);
      }
    }

    const studentsNeedingSupport = Array.from(studentMap.values())
      .map((st) => ({
        fullName: st.fullName,
        admissionNumber: st.admissionNumber,
        average: Math.round((st.total / st.count) * 10) / 10,
        subjectsCount: st.count,
      }))
      .filter((st) => st.average < 50)
      .sort((a, b) => a.average - b.average)
      .slice(0, 20);

    res.json({
      hasData: true,
      overallMean,
      passRate,
      totalEvaluated: validScores.length,
      gradeDistribution: Array.from(gradeMap.entries()).map(([grade, count]) => ({
        grade,
        count,
      })),
      byClass: Array.from(classMap.values()).map((c) => ({
        name: c.name,
        average: Math.round((c.total / c.count) * 10) / 10,
        count: c.count,
      })),
      bySubject: Array.from(subjectMap.values()).map((s) => ({
        name: s.name,
        average: Math.round((s.total / s.count) * 10) / 10,
        count: s.count,
      })),
      studentsNeedingSupport,
    });
  }
);

// Optional Gemini AI draft endpoint (never uses student PII)
router.post(
  '/ai-draft',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      task: z.enum(['TEACHER_REMARK', 'ANNOUNCEMENT_DRAFT', 'ACADEMIC_SUMMARY']),
      context: z.record(z.string(), z.union([z.string(), z.number()])),
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

export default router;
