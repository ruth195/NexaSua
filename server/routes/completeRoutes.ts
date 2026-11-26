import crypto from 'crypto';
import express from 'express';
import { z } from 'zod';
import { decryptSecret } from '../config/env.js';
import {
  authenticate,
  requireActiveSubscriptionWrite,
  requireCompletePlan,
  requireDb,
  requireRole,
  requireSchoolContext,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { parseBody, validObjectId } from '../middleware/validate.js';
import {
  AcademicYearModel,
  AdmissionApplicationModel,
  AnnouncementModel,
  ClassRoomModel,
  FeeCouponModel,
  FeeInvoiceModel,
  FeePaymentModel,
  FeeReminderModel,
  FeeStructureModel,
  FinancialLedgerModel,
  GuardianLinkModel,
  NotificationModel,
  SchoolModel,
  StaffRecordModel,
  StudentModel,
  SubjectModel,
  TermModel,
  TimetableSlotModel,
  UserModel,
} from '../models/index.js';
import { generateCsvString } from '../services/csvExcelService.js';
import { sendSmsMessage, sendTransactionalEmail } from '../services/messagingService.js';
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from '../services/paystackService.js';
import {
  generateFinancialSummaryPdfBuffer,
  generateReceiptPdfBuffer,
} from '../services/pdfService.js';
import { roundCurrency } from '../services/pricingEngine.js';
import { writeAuditLog } from '../services/securityService.js';

const router = express.Router();

router.use(
  requireDb,
  authenticate,
  requireSchoolContext,
  requireCompletePlan,
  requireActiveSubscriptionWrite
);

// =====================
// 1. FEE STRUCTURES
// =====================
router.get(
  '/fee-structures',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const structures = await FeeStructureModel.find({ schoolId: req.authUser!.schoolId })
      .populate('targetClassId', 'name')
      .populate('academicYearId', 'name')
      .populate('termId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ structures });
  }
);

const feeStructureSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  name: z.string().min(2).max(120),
  category: z.enum([
    'Tuition',
    'Examination',
    'Feeding',
    'Transport',
    'Boarding',
    'Development Levy',
    'Other',
  ]),
  amountGhs: z.number().min(0),
  targetClassId: z.string().nullable().optional(),
  targetStudentCategory: z.enum(['All', 'Day', 'Boarding', 'Scholarship']).default('All'),
});

router.post(
  '/fee-structures',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(feeStructureSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const structure = await FeeStructureModel.create({
      schoolId,
      academicYearId: validObjectId(body.academicYearId),
      termId: validObjectId(body.termId),
      name: body.name.trim(),
      category: body.category,
      amountGhs: roundCurrency(body.amountGhs),
      targetClassId: body.targetClassId ? validObjectId(body.targetClassId) : null,
      targetStudentCategory: body.targetStudentCategory,
    });
    res.status(201).json({ structure });
  }
);

// =====================
// 1B. SCHOOL FEE COUPONS (Student Fee Discounts / Vouchers)
// =====================
router.get(
  '/fee-coupons',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const coupons = await FeeCouponModel.find({ schoolId: req.authUser!.schoolId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ coupons });
  }
);

const feeCouponSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, 'Coupon code can only use letters, numbers, hyphens, or underscores.'),
  description: z.string().min(3).max(200),
  discountType: z.enum(['PERCENT', 'FIXED_GHS']).default('PERCENT'),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmountGhs: z.number().min(0).max(100000).default(0),
  maxUses: z.number().int().min(1).max(100000).nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

router.post(
  '/fee-coupons',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(feeCouponSchema, req, res);
    if (!body) return;
    if (body.discountType === 'PERCENT' && body.discountPercent < 1) {
      res.status(400).json({ error: 'Percentage discount must be between 1% and 100%.' });
      return;
    }
    if (body.discountType === 'FIXED_GHS' && body.discountAmountGhs <= 0) {
      res.status(400).json({ error: 'Fixed GH₵ discount must be greater than 0.' });
      return;
    }

    const schoolId = req.authUser!.schoolId!;
    const code = body.code.trim().toUpperCase();
    const exists = await FeeCouponModel.exists({ schoolId, code });
    if (exists) {
      res.status(409).json({ error: `Fee coupon "${code}" already exists.` });
      return;
    }

    const coupon = await FeeCouponModel.create({
      schoolId,
      code,
      description: body.description.trim(),
      discountType: body.discountType,
      discountPercent: body.discountType === 'PERCENT' ? body.discountPercent : 0,
      discountAmountGhs: body.discountType === 'FIXED_GHS' ? body.discountAmountGhs : 0,
      maxUses: body.maxUses ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      createdBy: req.authUser!._id,
    });

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'FEE_COUPON_CREATED',
      resourceType: 'FeeCoupon',
      resourceId: String(coupon._id),
      details: { code },
      ipAddress: req.ip,
    });

    res.status(201).json({ coupon });
  }
);

router.patch(
  '/fee-coupons/:id/toggle',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid coupon ID.' });
      return;
    }
    const schoolId = req.authUser!.schoolId!;
    const coupon = await FeeCouponModel.findOne({ _id: id, schoolId });
    if (!coupon) {
      res.status(404).json({ error: 'Fee coupon not found.' });
      return;
    }
    coupon.active = !coupon.active;
    await coupon.save();
    res.json({ coupon });
  }
);

router.delete(
  '/fee-coupons/:id',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid coupon ID.' });
      return;
    }
    const schoolId = req.authUser!.schoolId!;
    const deleted = await FeeCouponModel.findOneAndDelete({ _id: id, schoolId });
    if (!deleted) {
      res.status(404).json({ error: 'Fee coupon not found.' });
      return;
    }
    res.json({ ok: true });
  }
);

// =====================
// 2. INVOICES & LEDGER
// =====================
router.get('/invoices', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const role = req.authUser!.role;
  const query: Record<string, unknown> = { schoolId };

  if (role === 'PARENT') {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser!._id,
      verified: true,
    }).select('studentId');
    query.studentId = { $in: links.map((l) => l.studentId) };
  } else if (role === 'STUDENT') {
    const st = await StudentModel.findOne({ schoolId, userId: req.authUser!._id });
    if (!st) {
      res.json({ invoices: [] });
      return;
    }
    query.studentId = st._id;
  } else if (!['SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR', 'ADMIN_STAFF'].includes(role)) {
    res.status(403).json({ error: 'Not authorized to view fee invoices.' });
    return;
  }

  const invoices = await FeeInvoiceModel.find(query)
    .populate({
      path: 'studentId',
      select: 'fullName admissionNumber currentClassId',
      populate: { path: 'currentClassId', select: 'name' },
    })
    .populate('academicYearId', 'name')
    .populate('termId', 'name')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ invoices });
});

const createInvoiceSchema = z.object({
  studentId: z.string().min(12),
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  dueDate: z.string().min(8).max(20),
  discountGhs: z.number().min(0).default(0),
  waiverGhs: z.number().min(0).default(0),
  couponCode: z.string().max(40).optional(),
  notes: z.string().max(400).optional(),
  items: z
    .array(
      z.object({
        description: z.string().min(2).max(120),
        category: z.string().min(2).max(40),
        amountGhs: z.number().min(0),
      })
    )
    .min(1),
});

router.post(
  '/invoices',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(createInvoiceSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const studentId = validObjectId(body.studentId);
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);

    if (!studentId || !academicYearId || !termId) {
      res.status(400).json({ error: 'Invalid student, academic year, or term ID.' });
      return;
    }
    const studentExists = await StudentModel.exists({ _id: studentId, schoolId });
    if (!studentExists) {
      res.status(404).json({ error: 'Student not found in this school.' });
      return;
    }

    const subtotalGhs = roundCurrency(
      body.items.reduce((sum, item) => sum + roundCurrency(item.amountGhs), 0)
    );
    let couponDiscountGhs = 0;
    let appliedFeeCouponCode = '';
    if (body.couponCode && body.couponCode.trim()) {
      const code = body.couponCode.trim().toUpperCase();
      const coupon = await FeeCouponModel.findOne({ schoolId, code });
      if (!coupon || !coupon.active) {
        res.status(400).json({ error: `Fee coupon "${code}" is invalid or inactive.` });
        return;
      }
      if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
        res.status(400).json({ error: `Fee coupon "${code}" has expired.` });
        return;
      }
      if (typeof coupon.maxUses === 'number' && coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
        res.status(400).json({ error: `Fee coupon "${code}" has reached its usage limit.` });
        return;
      }
      couponDiscountGhs =
        coupon.discountType === 'FIXED_GHS'
          ? roundCurrency(Math.min(subtotalGhs, coupon.discountAmountGhs || 0))
          : roundCurrency(subtotalGhs * ((coupon.discountPercent || 0) / 100));
      coupon.usedCount += 1;
      await coupon.save();
      appliedFeeCouponCode = coupon.code;
    }

    const discountGhs = roundCurrency(body.discountGhs + couponDiscountGhs);
    const waiverGhs = roundCurrency(body.waiverGhs);
    const totalGhs = roundCurrency(Math.max(0, subtotalGhs - discountGhs - waiverGhs));

    const invoiceNumber = `INV-${req.schoolDoc!.schoolCode}-${crypto.randomInt(10000, 99999)}`;
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
      status: totalGhs === 0 ? 'PAID' : 'UNPAID',
      notes: appliedFeeCouponCode
        ? `${body.notes ? `${body.notes} · ` : ''}Coupon ${appliedFeeCouponCode} applied`
        : body.notes || '',
      createdBy: req.authUser!._id,
    });

    await FinancialLedgerModel.create({
      schoolId,
      entryType: 'INVOICE_CHARGE',
      studentId,
      invoiceId: invoice._id,
      amountGhs: subtotalGhs,
      description: `Invoice ${invoiceNumber} issued`,
      createdBy: req.authUser!._id,
    });

    if (discountGhs > 0) {
      await FinancialLedgerModel.create({
        schoolId,
        entryType: 'DISCOUNT',
        studentId,
        invoiceId: invoice._id,
        amountGhs: -discountGhs,
        description: appliedFeeCouponCode
          ? `Discount & Coupon (${appliedFeeCouponCode}) on ${invoiceNumber}`
          : `Discount on ${invoiceNumber}`,
        createdBy: req.authUser!._id,
      });
    }
    if (waiverGhs > 0) {
      await FinancialLedgerModel.create({
        schoolId,
        entryType: 'WAIVER',
        studentId,
        invoiceId: invoice._id,
        amountGhs: -waiverGhs,
        description: `Scholarship/Waiver on ${invoiceNumber}`,
        createdBy: req.authUser!._id,
      });
    }

    res.status(201).json({ invoice });
  }
);

// =====================
// 3. PAYMENTS, PAYSTACK & RECEIPTS
// =====================
router.get('/payments', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const role = req.authUser!.role;
  const query: Record<string, unknown> = { schoolId };

  if (role === 'PARENT') {
    const links = await GuardianLinkModel.find({
      schoolId,
      parentUserId: req.authUser!._id,
      verified: true,
    }).select('studentId');
    query.studentId = { $in: links.map((l) => l.studentId) };
  } else if (role === 'STUDENT') {
    const st = await StudentModel.findOne({ schoolId, userId: req.authUser!._id });
    query.studentId = st ? st._id : null;
  } else if (!['SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR', 'ADMIN_STAFF'].includes(role)) {
    res.status(403).json({ error: 'Not authorized.' });
    return;
  }

  const payments = await FeePaymentModel.find(query)
    .populate('studentId', 'fullName admissionNumber')
    .populate('invoiceId', 'invoiceNumber totalGhs balanceGhs')
    .sort({ createdAt: -1 })
    .lean();

  res.json({ payments });
});

async function applyVerifiedFeePayment(params: {
  schoolId: string;
  invoice: InstanceType<typeof FeeInvoiceModel>;
  amountGhs: number;
  channel: 'OFFLINE_CASH' | 'OFFLINE_MOMO' | 'OFFLINE_BANK' | 'PAYSTACK_CARD' | 'PAYSTACK_MOMO';
  reference: string;
  recordedBy: string;
  paystackData?: unknown;
}) {
  // Duplicate payment protection
  const existing = await FeePaymentModel.findOne({
    reference: params.reference,
    status: 'VERIFIED',
  });
  if (existing) {
    return { duplicate: true, payment: existing };
  }

  const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const payment = await FeePaymentModel.findOneAndUpdate(
    { reference: params.reference },
    {
      schoolId: params.schoolId,
      invoiceId: params.invoice._id,
      studentId: params.invoice.studentId,
      receiptNumber,
      amountGhs: roundCurrency(params.amountGhs),
      channel: params.channel,
      status: 'VERIFIED',
      recordedBy: params.recordedBy,
      verifiedAt: new Date(),
      paystackData: params.paystackData || null,
    },
    { upsert: true, new: true }
  );

  params.invoice.amountPaidGhs = roundCurrency(params.invoice.amountPaidGhs + params.amountGhs);
  params.invoice.balanceGhs = roundCurrency(
    Math.max(0, params.invoice.totalGhs - params.invoice.amountPaidGhs)
  );
  params.invoice.status = params.invoice.balanceGhs <= 0 ? 'PAID' : 'PARTIAL';
  await params.invoice.save();

  await FinancialLedgerModel.create({
    schoolId: params.schoolId,
    entryType: 'PAYMENT_CREDIT',
    studentId: params.invoice.studentId,
    invoiceId: params.invoice._id,
    paymentId: payment._id,
    amountGhs: -roundCurrency(params.amountGhs),
    description: `Payment ${receiptNumber} (${params.channel})`,
    createdBy: params.recordedBy,
  });

  return { duplicate: false, payment };
}

const offlinePaymentSchema = z.object({
  invoiceId: z.string().min(12),
  amountGhs: z.number().min(0.01),
  channel: z.enum(['OFFLINE_CASH', 'OFFLINE_MOMO', 'OFFLINE_BANK']),
  externalReference: z.string().max(80).optional(),
});

router.post(
  '/payments/offline',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(offlinePaymentSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const invoiceId = validObjectId(body.invoiceId);
    if (!invoiceId) {
      res.status(400).json({ error: 'Invalid invoiceId.' });
      return;
    }

    const invoice = await FeeInvoiceModel.findOne({ _id: invoiceId, schoolId });
    if (!invoice || invoice.status === 'VOID') {
      res.status(404).json({ error: 'Active invoice not found.' });
      return;
    }
    if (body.amountGhs > invoice.balanceGhs + 0.01) {
      res.status(400).json({
        error: `Amount (GH₵${body.amountGhs}) exceeds remaining balance (GH₵${invoice.balanceGhs}).`,
      });
      return;
    }

    const ref =
      body.externalReference?.trim() ||
      `OFF-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    const result = await applyVerifiedFeePayment({
      schoolId,
      invoice,
      amountGhs: body.amountGhs,
      channel: body.channel,
      reference: ref,
      recordedBy: req.authUser!._id,
    });

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'OFFLINE_FEE_PAYMENT_RECORDED',
      resourceType: 'FeePayment',
      resourceId: String(result.payment._id),
      details: { amountGhs: body.amountGhs, channel: body.channel },
      ipAddress: req.ip,
    });

    res.status(201).json({ payment: result.payment, invoice });
  }
);

// Payment reversal (never silently delete financial records!)
router.post(
  '/payments/:id/reverse',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const id = validObjectId(req.params.id);
    const reason = String(req.body?.reason || '').trim();
    if (!id || reason.length < 5) {
      res.status(400).json({ error: 'Valid payment ID and reversal reason are required.' });
      return;
    }

    const payment = await FeePaymentModel.findOne({ _id: id, schoolId, status: 'VERIFIED' });
    if (!payment) {
      res.status(404).json({ error: 'Verified payment not found.' });
      return;
    }

    const invoice = await FeeInvoiceModel.findOne({ _id: payment.invoiceId, schoolId });
    if (!invoice) {
      res.status(404).json({ error: 'Associated invoice not found.' });
      return;
    }

    payment.status = 'REVERSED';
    payment.reversalReason = reason;
    await payment.save();

    invoice.amountPaidGhs = roundCurrency(Math.max(0, invoice.amountPaidGhs - payment.amountGhs));
    invoice.balanceGhs = roundCurrency(Math.max(0, invoice.totalGhs - invoice.amountPaidGhs));
    invoice.status = invoice.amountPaidGhs <= 0 ? 'UNPAID' : 'PARTIAL';
    await invoice.save();

    await FinancialLedgerModel.create({
      schoolId,
      entryType: 'REVERSAL',
      studentId: payment.studentId,
      invoiceId: invoice._id,
      paymentId: payment._id,
      amountGhs: payment.amountGhs,
      description: `Reversal of ${payment.receiptNumber}: ${reason}`,
      createdBy: req.authUser!._id,
    });

    await writeAuditLog({
      schoolId,
      userId: req.authUser!._id,
      userEmail: req.authUser!.email,
      userRole: req.authUser!.role,
      action: 'PAYMENT_REVERSED',
      resourceType: 'FeePayment',
      resourceId: String(payment._id),
      details: { reason, amountGhs: payment.amountGhs },
      ipAddress: req.ip,
    });

    res.json({ payment, invoice });
  }
);

// Online School Fee Paystack Initialization (School's own merchant config!)
router.post(
  '/payments/paystack/initialize',
  requireRole('PARENT', 'SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const invoiceId = validObjectId(String(req.body?.invoiceId || ''));
    const amountGhs = Number(req.body?.amountGhs || 0);
    if (!invoiceId || amountGhs <= 0) {
      res.status(400).json({ error: 'Valid invoiceId and positive amountGhs required.' });
      return;
    }

    const school = await SchoolModel.findById(schoolId);
    const encryptedKey = school?.paymentConfig?.paystackSecretEncrypted;
    const secretKey = encryptedKey ? decryptSecret(encryptedKey) : '';

    if (!school?.paymentConfig?.isConfigured || !secretKey) {
      res.status(400).json({ error: 'Online payment is not yet configured.' });
      return;
    }

    const invoice = await FeeInvoiceModel.findOne({ _id: invoiceId, schoolId });
    if (!invoice || invoice.balanceGhs <= 0) {
      res.status(404).json({ error: 'Payable invoice not found.' });
      return;
    }

    if (req.authUser!.role === 'PARENT') {
      const verified = await GuardianLinkModel.exists({
        schoolId,
        parentUserId: req.authUser!._id,
        studentId: invoice.studentId,
        verified: true,
      });
      if (!verified) {
        res.status(403).json({ error: 'Verified guardian link required.' });
        return;
      }
    }

    const payable = roundCurrency(Math.min(amountGhs, invoice.balanceGhs));
    const reference = `NXS-FEE-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

    await FeePaymentModel.create({
      schoolId,
      invoiceId: invoice._id,
      studentId: invoice.studentId,
      receiptNumber: `PEND-${reference.slice(-8)}`,
      reference,
      amountGhs: payable,
      channel: 'PAYSTACK_MOMO',
      status: 'PENDING',
      recordedBy: req.authUser!._id,
    });

    const baseUrl = process.env.APP_URL?.trim() || `${req.protocol}://${req.get('host')}`;
    const init = await initializePaystackTransaction({
      secretKey,
      email: req.authUser!.email,
      amountGhs: payable,
      reference,
      callbackUrl: `${baseUrl}/dashboard?feeVerify=${reference}`,
      metadata: {
        type: 'SCHOOL_FEE',
        schoolId,
        invoiceId: String(invoice._id),
      },
    });

    if (!init.ok) {
      res.status(400).json({ error: init.error });
      return;
    }

    res.json({ authorizationUrl: init.authorizationUrl, reference });
  }
);

router.post(
  '/payments/paystack/verify',
  requireRole('PARENT', 'SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const reference = String(req.body?.reference || '').trim();
    const pending = await FeePaymentModel.findOne({ schoolId, reference });
    if (!pending) {
      res.status(404).json({ error: 'Payment reference not found.' });
      return;
    }
    if (pending.status === 'VERIFIED') {
      res.json({ alreadyVerified: true, payment: pending });
      return;
    }

    const school = await SchoolModel.findById(schoolId);
    const secretKey = school?.paymentConfig?.paystackSecretEncrypted
      ? decryptSecret(school.paymentConfig.paystackSecretEncrypted)
      : '';
    if (!secretKey) {
      res.status(400).json({ error: 'Online payment is not yet configured.' });
      return;
    }

    const verification = await verifyPaystackTransaction(secretKey, reference);
    if (!verification.ok || !verification.verified || (verification.amountGhs ?? 0) < pending.amountGhs) {
      pending.status = 'FAILED';
      await pending.save();
      res.status(400).json({ error: verification.error || 'Payment verification failed.' });
      return;
    }

    const invoice = await FeeInvoiceModel.findOne({ _id: pending.invoiceId, schoolId });
    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    const channel = verification.channel === 'card' ? 'PAYSTACK_CARD' : 'PAYSTACK_MOMO';
    const result = await applyVerifiedFeePayment({
      schoolId,
      invoice,
      amountGhs: pending.amountGhs,
      channel,
      reference,
      recordedBy: req.authUser!._id,
      paystackData: verification.raw,
    });

    res.json({ verified: true, payment: result.payment, invoice });
  }
);

router.get('/payments/:id/receipt/pdf', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const id = validObjectId(req.params.id);
  if (!id) {
    res.status(400).json({ error: 'Invalid payment ID.' });
    return;
  }

  const payment = await FeePaymentModel.findOne({ _id: id, schoolId, status: 'VERIFIED' }).lean();
  if (!payment) {
    res.status(404).json({ error: 'Verified receipt not found.' });
    return;
  }

  if (req.authUser!.role === 'PARENT') {
    const verified = await GuardianLinkModel.exists({
      schoolId,
      parentUserId: req.authUser!._id,
      studentId: payment.studentId,
      verified: true,
    });
    if (!verified) {
      res.status(403).json({ error: 'Access denied.' });
      return;
    }
  }

  const [student, invoice] = await Promise.all([
    StudentModel.findById(payment.studentId).populate('currentClassId', 'name').lean(),
    FeeInvoiceModel.findById(payment.invoiceId).lean(),
  ]);

  const pdf = await generateReceiptPdfBuffer({
    schoolName: req.schoolDoc!.name,
    schoolAddress: `${req.schoolDoc!.address}, ${req.schoolDoc!.town}`,
    schoolPhone: req.schoolDoc!.phone,
    receiptNumber: payment.receiptNumber,
    paymentReference: payment.reference,
    studentName: student?.fullName || 'Student',
    admissionNumber: student?.admissionNumber || '',
    className: (student?.currentClassId as { name?: string } | null)?.name || '',
    invoiceNumber: invoice?.invoiceNumber || '',
    amountPaidGhs: payment.amountGhs,
    balanceRemainingGhs: invoice?.balanceGhs || 0,
    channel: payment.channel,
    paidAt: new Date(payment.verifiedAt || payment.createdAt).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }),
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${payment.receiptNumber}.pdf"`);
  res.send(pdf);
});

router.get(
  '/ledger',
  requireRole('SCHOOL_ADMIN', 'BURSAR', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const entries = await FinancialLedgerModel.find({ schoolId: req.authUser!.schoolId })
      .populate('studentId', 'fullName admissionNumber')
      .populate('invoiceId', 'invoiceNumber')
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ entries });
  }
);

// =====================
// 4. FEE REMINDERS
// =====================
router.get(
  '/reminders',
  requireRole('SCHOOL_ADMIN', 'BURSAR', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const reminders = await FeeReminderModel.find({ schoolId: req.authUser!.schoolId })
      .populate('studentId', 'fullName admissionNumber')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ reminders });
  }
);

const createReminderSchema = z.object({
  invoiceId: z.string().min(12),
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS']),
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(600),
  scheduledFor: z.string().optional(),
});

router.post(
  '/reminders',
  requireRole('SCHOOL_ADMIN', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(createReminderSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const invoiceId = validObjectId(body.invoiceId);
    if (!invoiceId) {
      res.status(400).json({ error: 'Invalid invoiceId.' });
      return;
    }

    const invoice = await FeeInvoiceModel.findOne({ _id: invoiceId, schoolId });
    if (!invoice || invoice.balanceGhs <= 0) {
      res.status(404).json({ error: 'Outstanding invoice not found.' });
      return;
    }

    const link = await GuardianLinkModel.findOne({
      schoolId,
      studentId: invoice.studentId,
      verified: true,
    });

    const schedDate = body.scheduledFor ? new Date(body.scheduledFor) : new Date();
    const dateBucket = schedDate.toISOString().slice(0, 13); // hourly dedupe key
    const dedupeKey = `${schoolId}:${invoice._id}:${body.channel}:${dateBucket}`;

    const existing = await FeeReminderModel.findOne({ dedupeKey });
    if (existing) {
      res.status(409).json({ error: 'A reminder for this invoice and channel was already scheduled for this period.' });
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
      status: 'SCHEDULED',
      dedupeKey,
    });

    // Immediate send if scheduledFor <= now
    if (schedDate <= new Date()) {
      if (body.channel === 'IN_APP' && link?.parentUserId) {
        await NotificationModel.create({
          schoolId,
          userId: link.parentUserId,
          title: body.subject,
          message: body.message,
          type: 'FEE_REMINDER',
        });
        reminder.status = 'SENT';
        reminder.sentAt = new Date();
      } else if (body.channel === 'EMAIL' && link?.parentUserId) {
        const user = await UserModel.findById(link.parentUserId);
        const r = user?.email
          ? await sendTransactionalEmail({ to: user.email, subject: body.subject, text: body.message })
          : { status: 'FAILED' as const, error: 'Guardian email missing.' };
        reminder.status = r.status === 'SENT' ? 'SENT' : 'FAILED';
        reminder.errorMessage = r.error || '';
        if (r.status === 'SENT') reminder.sentAt = new Date();
      } else if (body.channel === 'SMS' && link?.parentUserId) {
        const user = await UserModel.findById(link.parentUserId);
        const r = user?.phone
          ? await sendSmsMessage({ toPhone: user.phone, message: body.message })
          : { status: 'FAILED' as const, error: 'Guardian phone missing.' };
        reminder.status = r.status === 'SENT' ? 'SENT' : 'FAILED';
        reminder.errorMessage = r.error || '';
        if (r.status === 'SENT') reminder.sentAt = new Date();
      } else {
        reminder.status = 'FAILED';
        reminder.errorMessage = 'No verified guardian account linked to this student.';
      }
      await reminder.save();
    }

    res.status(201).json({ reminder });
  }
);

// =====================
// 5. ANNOUNCEMENTS
// =====================
router.get('/announcements', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const role = req.authUser!.role;
  const query: Record<string, unknown> = { schoolId };

  if (role === 'STUDENT') {
    query.status = 'PUBLISHED';
    query.audience = { $in: ['ALL', 'STUDENTS'] };
  } else if (role === 'PARENT') {
    query.status = 'PUBLISHED';
    query.audience = { $in: ['ALL', 'PARENTS'] };
  } else if (role === 'CLASS_TEACHER' || role === 'SUBJECT_TEACHER') {
    query.status = 'PUBLISHED';
    query.audience = { $in: ['ALL', 'TEACHERS'] };
  }

  const announcements = await AnnouncementModel.find(query)
    .populate('createdBy', 'fullName')
    .sort({ createdAt: -1 })
    .lean();
  res.json({ announcements });
});

const announcementSchema = z.object({
  title: z.string().min(3).max(160),
  body: z.string().min(10).max(3000),
  category: z
    .enum(['Reopening', 'Exams', 'Parent Meeting', 'Event', 'Emergency', 'Holiday', 'Fees', 'Notice'])
    .default('Notice'),
  audience: z.enum(['ALL', 'TEACHERS', 'PARENTS', 'STUDENTS', 'CLASS']).default('ALL'),
  targetClassId: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED']).default('PUBLISHED'),
  scheduledFor: z.string().nullable().optional(),
});

router.post(
  '/announcements',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(announcementSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;

    const announcement = await AnnouncementModel.create({
      schoolId,
      title: body.title.trim(),
      body: body.body.trim(),
      category: body.category,
      audience: body.audience,
      targetClassId: body.targetClassId ? validObjectId(body.targetClassId) : null,
      status: body.status,
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      publishedAt: body.status === 'PUBLISHED' ? new Date() : null,
      createdBy: req.authUser!._id,
    });

    if (body.status === 'PUBLISHED') {
      const roleFilter =
        body.audience === 'TEACHERS'
          ? { role: { $in: ['CLASS_TEACHER', 'SUBJECT_TEACHER'] } }
          : body.audience === 'PARENTS'
          ? { role: 'PARENT' }
          : body.audience === 'STUDENTS'
          ? { role: 'STUDENT' }
          : {};
      const recipients = await UserModel.find({
        schoolId,
        status: 'ACTIVE',
        ...roleFilter,
      }).select('_id');
      if (recipients.length > 0) {
        await NotificationModel.insertMany(
          recipients.map((r) => ({
            schoolId,
            userId: r._id,
            title: announcement.title,
            message: announcement.body.slice(0, 220),
            type: 'ANNOUNCEMENT',
          }))
        );
      }
    }

    res.status(201).json({ announcement });
  }
);

// =====================
// 6. ADMISSIONS MANAGEMENT
// =====================
router.get(
  '/admissions',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const applications = await AdmissionApplicationModel.find({ schoolId: req.authUser!.schoolId })
      .populate('applyingForClassId', 'name level')
      .populate('academicYearId', 'name')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ applications });
  }
);

const admissionSchema = z.object({
  applicantName: z.string().min(2).max(120),
  gender: z.enum(['Male', 'Female']),
  dateOfBirth: z.string().max(20).optional(),
  applyingForClassId: z.string().min(12),
  academicYearId: z.string().min(12),
  guardianName: z.string().min(2).max(120),
  guardianPhone: z.string().min(7).max(30),
  guardianEmail: z.string().email().optional().or(z.literal('')),
  previousSchool: z.string().max(120).optional(),
  notes: z.string().max(600).optional(),
});

router.post(
  '/admissions',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(admissionSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const applicationNumber = `APP-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;

    const application = await AdmissionApplicationModel.create({
      schoolId,
      applicationNumber,
      applicantName: body.applicantName.trim(),
      gender: body.gender,
      dateOfBirth: body.dateOfBirth || '',
      applyingForClassId: validObjectId(body.applyingForClassId),
      academicYearId: validObjectId(body.academicYearId),
      guardianName: body.guardianName.trim(),
      guardianPhone: body.guardianPhone.trim(),
      guardianEmail: body.guardianEmail || '',
      previousSchool: body.previousSchool || '',
      notes: body.notes || '',
      status: 'SUBMITTED',
    });

    res.status(201).json({ application });
  }
);

router.post(
  '/admissions/:id/status',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const id = validObjectId(req.params.id);
    const status = String(req.body?.status || '');
    if (!id || !['UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED'].includes(status)) {
      res.status(400).json({ error: 'Valid application ID and target status required.' });
      return;
    }

    const app = await AdmissionApplicationModel.findOneAndUpdate(
      { _id: id, schoolId: req.authUser!.schoolId },
      { status, reviewedBy: req.authUser!._id },
      { new: true }
    );
    if (!app) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    res.json({ application: app });
  }
);

router.post(
  '/admissions/:id/enroll',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid application ID.' });
      return;
    }

    const app = await AdmissionApplicationModel.findOne({ _id: id, schoolId });
    if (!app) {
      res.status(404).json({ error: 'Application not found.' });
      return;
    }
    if (app.status === 'ENROLLED' && app.enrolledStudentId) {
      res.status(409).json({ error: 'Applicant has already been enrolled into the student database.' });
      return;
    }
    if (app.status !== 'ACCEPTED') {
      res.status(400).json({ error: 'Only ACCEPTED applicants can be enrolled.' });
      return;
    }

    const [cls, year] = await Promise.all([
      ClassRoomModel.findOne({ _id: app.applyingForClassId, schoolId }),
      AcademicYearModel.findOne({ _id: app.academicYearId, schoolId }),
    ]);

    const admissionNumber = `ADM-${new Date().getFullYear()}-${crypto.randomInt(1000, 9999)}`;
    const student = await StudentModel.create({
      schoolId,
      admissionNumber,
      fullName: app.applicantName,
      gender: app.gender,
      dateOfBirth: app.dateOfBirth,
      currentClassId: app.applyingForClassId,
      academicYearId: app.academicYearId,
      admissionDate: new Date().toISOString().slice(0, 10),
      guardianSummary: {
        name: app.guardianName,
        phone: app.guardianPhone,
        email: app.guardianEmail,
        relationship: 'Parent/Guardian',
      },
      academicHistory: [
        {
          academicYearId: app.academicYearId,
          academicYearName: year?.name || '',
          classId: app.applyingForClassId,
          className: cls?.name || '',
          status: 'ACTIVE',
        },
      ],
    });

    app.status = 'ENROLLED';
    app.enrolledStudentId = student._id;
    await app.save();

    res.status(201).json({ student, application: app });
  }
);

// =====================
// 7. STAFF MANAGEMENT
// =====================
router.get(
  '/staff',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const staff = await StaffRecordModel.find({ schoolId: req.authUser!.schoolId })
      .sort({ fullName: 1 })
      .lean();
    res.json({ staff });
  }
);

const staffSchema = z.object({
  fullName: z.string().min(2).max(120),
  department: z.string().min(2).max(80),
  jobRole: z.string().min(2).max(80),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal('')),
  dateJoined: z.string().min(8).max(20),
  responsibilities: z.string().max(400).optional(),
});

router.post(
  '/staff',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(staffSchema, req, res);
    if (!body) return;
    const staffNumber = `STF-${new Date().getFullYear()}-${crypto.randomInt(100, 999)}`;
    const record = await StaffRecordModel.create({
      schoolId: req.authUser!.schoolId!,
      staffNumber,
      ...body,
    });
    res.status(201).json({ staff: record });
  }
);

router.post(
  '/staff/:id/leave-request',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid staff ID.' });
      return;
    }
    const schema = z.object({
      startDate: z.string().min(8),
      endDate: z.string().min(8),
      reason: z.string().min(4).max(300),
    });
    const body = parseBody(schema, req, res);
    if (!body) return;

    const staff = await StaffRecordModel.findOne({ _id: id, schoolId: req.authUser!.schoolId });
    if (!staff) {
      res.status(404).json({ error: 'Staff record not found.' });
      return;
    }

    staff.leaveRequests.push({
      startDate: body.startDate,
      endDate: body.endDate,
      reason: body.reason,
      status: 'PENDING',
    });
    await staff.save();
    res.status(201).json({ staff });
  }
);

router.post(
  '/staff/:id/leave-request/:leaveId/review',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const id = validObjectId(req.params.id);
    const decision = String(req.body?.status || '');
    if (!id || !['APPROVED', 'REJECTED'].includes(decision)) {
      res.status(400).json({ error: 'Valid staff ID and APPROVED/REJECTED status required.' });
      return;
    }

    const staff = await StaffRecordModel.findOne({ _id: id, schoolId: req.authUser!.schoolId });
    if (!staff) {
      res.status(404).json({ error: 'Staff record not found.' });
      return;
    }
    const leave = staff.leaveRequests.id(req.params.leaveId);
    if (!leave) {
      res.status(404).json({ error: 'Leave request not found.' });
      return;
    }
    leave.status = decision as 'APPROVED' | 'REJECTED';
    leave.reviewedBy = req.authUser!._id as unknown as typeof leave.reviewedBy;
    leave.reviewedAt = new Date();
    if (decision === 'APPROVED') staff.employmentStatus = 'ON_LEAVE';
    await staff.save();

    res.json({ staff });
  }
);

// =====================
// 8. TIMETABLE MANAGEMENT (WITH CONFLICT PREVENTION)
// =====================
router.get('/timetables', async (req: AuthenticatedRequest, res) => {
  const schoolId = req.authUser!.schoolId!;
  const query: Record<string, unknown> = { schoolId };
  if (req.query.classId && validObjectId(String(req.query.classId))) {
    query.classId = req.query.classId;
  }
  const slots = await TimetableSlotModel.find(query)
    .populate('classId', 'name')
    .populate('subjectId', 'name code')
    .populate('teacherId', 'fullName')
    .sort({ dayOfWeek: 1, periodNumber: 1 })
    .lean();
  res.json({ slots });
});

const timetableSlotSchema = z.object({
  academicYearId: z.string().min(12),
  termId: z.string().min(12),
  classId: z.string().min(12),
  subjectId: z.string().nullable().optional(),
  teacherId: z.string().nullable().optional(),
  dayOfWeek: z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']),
  periodNumber: z.number().int().min(1).max(12),
  startTime: z.string().min(4).max(10),
  endTime: z.string().min(4).max(10),
  room: z.string().max(40).optional(),
  isBreak: z.boolean().default(false),
  breakLabel: z.string().max(40).optional(),
});

router.post(
  '/timetables',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(timetableSlotSchema, req, res);
    if (!body) return;
    const schoolId = req.authUser!.schoolId!;
    const academicYearId = validObjectId(body.academicYearId);
    const termId = validObjectId(body.termId);
    const classId = validObjectId(body.classId);

    // 1. Class period conflict check
    const classConflict = await TimetableSlotModel.findOne({
      schoolId,
      termId,
      classId,
      dayOfWeek: body.dayOfWeek,
      periodNumber: body.periodNumber,
    });
    if (classConflict) {
      res.status(409).json({
        error: `Scheduling conflict: This class already has a slot on ${body.dayOfWeek} Period ${body.periodNumber}.`,
      });
      return;
    }

    // 2. Teacher double-booking conflict check
    if (!body.isBreak && body.teacherId) {
      const teacherId = validObjectId(body.teacherId);
      const teacherConflict = await TimetableSlotModel.findOne({
        schoolId,
        termId,
        teacherId,
        dayOfWeek: body.dayOfWeek,
        periodNumber: body.periodNumber,
      }).populate('classId', 'name');
      if (teacherConflict) {
        res.status(409).json({
          error: `Teacher conflict: Assigned teacher is already scheduled with ${(teacherConflict.classId as { name?: string } | null)?.name || 'another class'} on ${body.dayOfWeek} Period ${body.periodNumber}.`,
        });
        return;
      }
    }

    // 3. Room conflict check
    if (!body.isBreak && body.room?.trim()) {
      const roomConflict = await TimetableSlotModel.findOne({
        schoolId,
        termId,
        room: body.room.trim(),
        dayOfWeek: body.dayOfWeek,
        periodNumber: body.periodNumber,
      });
      if (roomConflict) {
        res.status(409).json({
          error: `Room conflict: ${body.room} is already booked on ${body.dayOfWeek} Period ${body.periodNumber}.`,
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
      room: body.room?.trim() || '',
      isBreak: body.isBreak,
      breakLabel: body.breakLabel || '',
    });

    res.status(201).json({ slot });
  }
);

router.delete(
  '/timetables/:id',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'ADMIN_STAFF'),
  async (req: AuthenticatedRequest, res) => {
    const id = validObjectId(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Invalid slot ID.' });
      return;
    }
    await TimetableSlotModel.deleteOne({ _id: id, schoolId: req.authUser!.schoolId });
    res.json({ ok: true });
  }
);

// =====================
// 9. FINANCIAL & ADMINISTRATIVE ANALYTICS + EXPORTS
// =====================
router.get(
  '/analytics',
  requireRole('SCHOOL_ADMIN', 'HEADTEACHER', 'BURSAR'),
  async (req: AuthenticatedRequest, res) => {
    const schoolId = req.authUser!.schoolId!;
    const invoiceFilter: Record<string, unknown> = { schoolId, status: { $ne: 'VOID' } };
    if (req.query.academicYearId && validObjectId(String(req.query.academicYearId))) {
      invoiceFilter.academicYearId = req.query.academicYearId;
    }
    if (req.query.termId && validObjectId(String(req.query.termId))) {
      invoiceFilter.termId = req.query.termId;
    }

    const [invoices, payments, admissions, staff] = await Promise.all([
      FeeInvoiceModel.find(invoiceFilter).populate('studentId', 'fullName').lean(),
      FeePaymentModel.find({ schoolId, status: 'VERIFIED' }).sort({ createdAt: -1 }).lean(),
      AdmissionApplicationModel.find({ schoolId }).lean(),
      StaffRecordModel.find({ schoolId }).lean(),
    ]);

    const totalBilledGhs = roundCurrency(invoices.reduce((s, i) => s + i.totalGhs, 0));
    const totalCollectedGhs = roundCurrency(invoices.reduce((s, i) => s + i.amountPaidGhs, 0));
    const outstandingGhs = roundCurrency(invoices.reduce((s, i) => s + i.balanceGhs, 0));
    const overdueCount = invoices.filter((i) => i.status === 'OVERDUE').length;
    const collectionRatePercent =
      totalBilledGhs > 0 ? Math.round((totalCollectedGhs / totalBilledGhs) * 1000) / 10 : 0;

    const categoryTotals = new Map<string, number>();
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
          amountGhs,
        })),
      },
      admissions: {
        total: admissions.length,
        submitted: admissions.filter((a) => a.status === 'SUBMITTED').length,
        accepted: admissions.filter((a) => a.status === 'ACCEPTED').length,
        enrolled: admissions.filter((a) => a.status === 'ENROLLED').length,
      },
      staff: {
        total: staff.length,
        active: staff.filter((s) => s.employmentStatus === 'ACTIVE').length,
        onLeave: staff.filter((s) => s.employmentStatus === 'ON_LEAVE').length,
      },
    });
  }
);

router.get(
  '/analytics/export/csv',
  requireRole('SCHOOL_ADMIN', 'BURSAR', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const invoices = await FeeInvoiceModel.find({
      schoolId: req.authUser!.schoolId,
      status: { $ne: 'VOID' },
    })
      .populate('studentId', 'fullName admissionNumber')
      .lean();

    const csv = generateCsvString(
      ['Invoice Number', 'Admission No', 'Student Name', 'Billed (GH₵)', 'Paid (GH₵)', 'Balance (GH₵)', 'Due Date', 'Status'],
      invoices.map((inv) => {
        const st = inv.studentId as { fullName?: string; admissionNumber?: string } | null;
        return [
          inv.invoiceNumber,
          st?.admissionNumber || '',
          st?.fullName || '',
          inv.totalGhs.toFixed(2),
          inv.amountPaidGhs.toFixed(2),
          inv.balanceGhs.toFixed(2),
          inv.dueDate,
          inv.status,
        ];
      })
    );

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="nexasua-financial-summary.csv"');
    res.send(csv);
  }
);

router.get(
  '/analytics/export/pdf',
  requireRole('SCHOOL_ADMIN', 'BURSAR', 'HEADTEACHER'),
  async (req: AuthenticatedRequest, res) => {
    const invoices = await FeeInvoiceModel.find({
      schoolId: req.authUser!.schoolId,
      status: { $ne: 'VOID' },
    })
      .populate('studentId', 'fullName')
      .lean();

    const totalBilledGhs = roundCurrency(invoices.reduce((s, i) => s + i.totalGhs, 0));
    const totalCollectedGhs = roundCurrency(invoices.reduce((s, i) => s + i.amountPaidGhs, 0));
    const outstandingGhs = roundCurrency(invoices.reduce((s, i) => s + i.balanceGhs, 0));
    const collectionRatePercent =
      totalBilledGhs > 0 ? Math.round((totalCollectedGhs / totalBilledGhs) * 1000) / 10 : 0;

    const pdf = await generateFinancialSummaryPdfBuffer({
      schoolName: req.schoolDoc!.name,
      generatedAt: new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      totalBilledGhs,
      totalCollectedGhs,
      outstandingGhs,
      collectionRatePercent,
      invoices: invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        studentName: (inv.studentId as { fullName?: string } | null)?.fullName || 'Student',
        totalGhs: inv.totalGhs,
        paidGhs: inv.amountPaidGhs,
        balanceGhs: inv.balanceGhs,
        status: inv.status,
      })),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="nexasua-financial-summary.pdf"');
    res.send(pdf);
  }
);

export default router;
