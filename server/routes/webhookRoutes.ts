import crypto from 'crypto';
import express from 'express';
import { decryptSecret } from '../config/env.js';
import { isDbConnected } from '../db.js';
import {
  FeeInvoiceModel,
  FeePaymentModel,
  FinancialLedgerModel,
  SchoolModel,
  SubscriptionInvoiceModel,
  SubscriptionModel,
} from '../models/index.js';
import { verifyPaystackWebhookSignature } from '../services/paystackService.js';
import { roundCurrency } from '../services/pricingEngine.js';

const router = express.Router();

router.post('/paystack', async (req, res) => {
  if (!isDbConnected()) {
    res.status(503).json({ error: 'Database unavailable' });
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const signature = req.headers['x-paystack-signature'] as string | undefined;

  let event: {
    event?: string;
    data?: {
      reference?: string;
      amount?: number;
      currency?: string;
      channel?: string;
      metadata?: { type?: string; schoolId?: string };
    };
  };

  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON payload' });
    return;
  }

  const meta = event.data?.metadata;
  const reference = event.data?.reference || '';

  if (event.event !== 'charge.success' || !reference || event.data?.currency !== 'GHS') {
    res.status(200).json({ received: true });
    return;
  }

  // Case 1: NexaSua Platform Subscription payment
  if (meta?.type === 'SUBSCRIPTION') {
    const secret = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
    if (!verifyPaystackWebhookSignature(rawBody, signature, secret)) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const invoice = await SubscriptionInvoiceModel.findOne({ paystackReference: reference });
    if (!invoice || invoice.status === 'PAID') {
      res.status(200).json({ received: true });
      return;
    }

    const paidGhs = (event.data.amount || 0) / 100;
    if (paidGhs < invoice.amountGhs) {
      res.status(400).json({ error: 'Amount mismatch' });
      return;
    }

    invoice.status = 'PAID';
    invoice.paidAt = new Date();
    invoice.paymentMethod = event.data.channel || 'Paystack';
    await invoice.save();

    const days = invoice.billingCycle === 'THREE_TERMS' ? 365 : 120;
    const now = new Date();
    await SubscriptionModel.findOneAndUpdate(
      { schoolId: invoice.schoolId },
      {
        plan: invoice.plan,
        status: 'ACTIVE',
        billingCycle: invoice.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + days * 24 * 60 * 60 * 1000),
      }
    );

    res.status(200).json({ processed: true });
    return;
  }

  // Case 2: School Fee Payment (uses school's own Paystack secret)
  if (meta?.type === 'SCHOOL_FEE' && meta.schoolId) {
    const school = await SchoolModel.findById(meta.schoolId);
    const secret = school?.paymentConfig?.paystackSecretEncrypted
      ? decryptSecret(school.paymentConfig.paystackSecretEncrypted)
      : '';

    if (!secret || !verifyPaystackWebhookSignature(rawBody, signature, secret)) {
      res.status(401).json({ error: 'Invalid school Paystack webhook signature' });
      return;
    }

    const payment = await FeePaymentModel.findOne({
      schoolId: school!._id,
      reference,
    });
    if (!payment || payment.status === 'VERIFIED') {
      res.status(200).json({ received: true });
      return;
    }

    const invoice = await FeeInvoiceModel.findOne({
      _id: payment.invoiceId,
      schoolId: school!._id,
    });
    if (!invoice) {
      res.status(200).json({ received: true });
      return;
    }

    const paidGhs = roundCurrency((event.data.amount || 0) / 100);
    const receiptNumber = `RCP-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    payment.status = 'VERIFIED';
    payment.receiptNumber = receiptNumber;
    payment.verifiedAt = new Date();
    payment.channel = event.data.channel === 'card' ? 'PAYSTACK_CARD' : 'PAYSTACK_MOMO';
    payment.paystackData = event.data;
    await payment.save();

    invoice.amountPaidGhs = roundCurrency(invoice.amountPaidGhs + paidGhs);
    invoice.balanceGhs = roundCurrency(Math.max(0, invoice.totalGhs - invoice.amountPaidGhs));
    invoice.status = invoice.balanceGhs <= 0 ? 'PAID' : 'PARTIAL';
    await invoice.save();

    await FinancialLedgerModel.create({
      schoolId: school!._id,
      entryType: 'PAYMENT_CREDIT',
      studentId: invoice.studentId,
      invoiceId: invoice._id,
      paymentId: payment._id,
      amountGhs: -paidGhs,
      description: `Paystack webhook payment ${receiptNumber}`,
      createdBy: payment.recordedBy,
    });

    res.status(200).json({ processed: true });
    return;
  }

  res.status(200).json({ received: true });
});

export default router;
