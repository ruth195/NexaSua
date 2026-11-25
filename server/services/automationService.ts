import { isDbConnected } from '../db.js';
import {
  AnnouncementModel,
  FeeInvoiceModel,
  FeeReminderModel,
  NotificationModel,
  SubscriptionModel,
  UserModel,
} from '../models/index.js';
import { sendSmsMessage, sendTransactionalEmail } from './messagingService.js';

let intervalHandle: NodeJS.Timeout | null = null;
let running = false;

export async function runAutomationCycle() {
  if (!isDbConnected() || running) return;
  running = true;
  const now = new Date();

  try {
    // 1. Publish scheduled announcements whose scheduledFor <= now
    const dueAnnouncements = await AnnouncementModel.find({
      status: 'SCHEDULED',
      scheduledFor: { $lte: now },
    }).limit(25);

    for (const ann of dueAnnouncements) {
      ann.status = 'PUBLISHED';
      ann.publishedAt = now;
      await ann.save();

      // Fan-out in-app notifications scoped strictly to ann.schoolId
      const roleFilter =
        ann.audience === 'TEACHERS'
          ? { role: { $in: ['CLASS_TEACHER', 'SUBJECT_TEACHER'] } }
          : ann.audience === 'PARENTS'
          ? { role: 'PARENT' }
          : ann.audience === 'STUDENTS'
          ? { role: 'STUDENT' }
          : {};

      const users = await UserModel.find({
        schoolId: ann.schoolId,
        status: 'ACTIVE',
        ...roleFilter,
      }).select('_id');

      if (users.length > 0) {
        await NotificationModel.insertMany(
          users.map((u) => ({
            schoolId: ann.schoolId,
            userId: u._id,
            title: ann.title,
            message: ann.body.slice(0, 240),
            type: 'ANNOUNCEMENT',
          }))
        );
      }
    }

    // 2. Process scheduled fee reminders (with duplicate protection)
    const dueReminders = await FeeReminderModel.find({
      status: 'SCHEDULED',
      scheduledFor: { $lte: now },
    }).limit(25);

    for (const rem of dueReminders) {
      if (rem.channel === 'IN_APP') {
        if (rem.guardianUserId) {
          await NotificationModel.create({
            schoolId: rem.schoolId,
            userId: rem.guardianUserId,
            title: rem.subject,
            message: rem.message,
            type: 'FEE_REMINDER',
          });
          rem.status = 'SENT';
          rem.sentAt = new Date();
        } else {
          rem.status = 'FAILED';
          rem.errorMessage = 'No verified guardian user linked to student.';
        }
      } else if (rem.channel === 'EMAIL') {
        const user = rem.guardianUserId ? await UserModel.findById(rem.guardianUserId) : null;
        if (!user?.email) {
          rem.status = 'FAILED';
          rem.errorMessage = 'No verified guardian email address.';
        } else {
          const result = await sendTransactionalEmail({
            to: user.email,
            subject: rem.subject,
            text: rem.message,
          });
          rem.status = result.status === 'SENT' ? 'SENT' : 'FAILED';
          rem.sentAt = result.status === 'SENT' ? new Date() : null;
          rem.errorMessage = result.error || '';
        }
      } else if (rem.channel === 'SMS') {
        const user = rem.guardianUserId ? await UserModel.findById(rem.guardianUserId) : null;
        if (!user?.phone) {
          rem.status = 'FAILED';
          rem.errorMessage = 'No verified guardian phone number.';
        } else {
          const result = await sendSmsMessage({
            toPhone: user.phone,
            message: rem.message,
          });
          rem.status = result.status === 'SENT' ? 'SENT' : 'FAILED';
          rem.sentAt = result.status === 'SENT' ? new Date() : null;
          rem.errorMessage = result.error || '';
        }
      }
      await rem.save();
    }

    // 3. Mark overdue fee invoices
    const todayStr = now.toISOString().slice(0, 10);
    await FeeInvoiceModel.updateMany(
      {
        status: { $in: ['UNPAID', 'PARTIAL'] },
        dueDate: { $lt: todayStr },
        balanceGhs: { $gt: 0 },
      },
      { $set: { status: 'OVERDUE' } }
    );

    // 4. Close subscriptions automatically once the school's term vacation date is reached
    await SubscriptionModel.updateMany(
      {
        status: { $in: ['TRIAL', 'ACTIVE', 'GRACE_PERIOD'] },
        termVacationDate: { $ne: '', $lte: todayStr },
      },
      {
        $set: {
          status: 'EXPIRED',
          portalClosedReason:
            'Term vacation date reached — subscription term ended and portal closed automatically.',
        },
      }
    );

    // 5. Transition expired trials (when not covered by a future vacation date) to GRACE_PERIOD
    await SubscriptionModel.updateMany(
      {
        status: 'TRIAL',
        trialEndsAt: { $lt: now },
        $or: [{ termVacationDate: '' }, { termVacationDate: { $lte: todayStr } }],
      },
      { $set: { status: 'GRACE_PERIOD' } }
    );
  } catch {
    // Keep scheduler resilient
  } finally {
    running = false;
  }
}

let lastCycleAt = 0;

export function triggerAutomationIfDue() {
  if (!isDbConnected() || running) return;
  const now = Date.now();
  if (now - lastCycleAt < 60_000) return;
  lastCycleAt = now;
  void runAutomationCycle();
}

export function startAutomationEngine() {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    void runAutomationCycle();
  }, 60_000);
  if (typeof intervalHandle.unref === 'function') {
    intervalHandle.unref();
  }
}
