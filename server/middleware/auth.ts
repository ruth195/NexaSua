import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { isDbConnected } from '../db.js';
import { SchoolModel, SubscriptionModel, UserModel } from '../models/index.js';
import type { UserRole } from '../models/index.js';
import { verifySessionToken } from '../services/securityService.js';

export function getAccraTodayDateString(now = new Date()): string {
  // Africa/Accra is UTC+0 year-round
  return now.toISOString().slice(0, 10);
}

export function checkPortalClosure(
  subscription: {
    status?: string;
    termVacationDate?: string;
    portalClosedReason?: string;
    currentPeriodEnd?: Date | string;
  } | null | undefined,
  school: { termVacationDate?: string } | null | undefined,
  now = new Date()
): { closed: boolean; reason: string; code: string; vacationDate: string } {
  const vacationDate = String(
    subscription?.termVacationDate || school?.termVacationDate || ''
  ).trim();
  const todayAccra = getAccraTodayDateString(now);

  if (subscription?.status === 'SUSPENDED') {
    return {
      closed: true,
      reason: 'Your school subscription is suspended. Please contact NexaFlow support.',
      code: 'SUBSCRIPTION_SUSPENDED',
      vacationDate,
    };
  }

  if (vacationDate && todayAccra >= vacationDate) {
    return {
      closed: true,
      reason: `Your school portal is closed automatically because the scheduled term vacation date (${vacationDate}) has been reached and the term subscription has ended.`,
      code: 'PORTAL_CLOSED_SUBSCRIPTION_ENDED',
      vacationDate,
    };
  }

  if (subscription?.status === 'EXPIRED') {
    return {
      closed: true,
      reason:
        subscription.portalClosedReason ||
        'Your school subscription term has ended and the portal is closed automatically.',
      code: 'PORTAL_CLOSED_SUBSCRIPTION_ENDED',
      vacationDate,
    };
  }

  if (
    subscription?.status === 'ACTIVE' &&
    subscription.currentPeriodEnd &&
    now > new Date(subscription.currentPeriodEnd)
  ) {
    return {
      closed: true,
      reason: 'Your school subscription period has ended and the portal is closed automatically.',
      code: 'PORTAL_CLOSED_SUBSCRIPTION_ENDED',
      vacationDate,
    };
  }

  return { closed: false, reason: '', code: '', vacationDate };
}

export interface AuthenticatedRequest extends Request {
  authUser?: {
    _id: string;
    email: string;
    fullName: string;
    role: UserRole;
    schoolId: string | null;
    mfaEnabled: boolean;
    mfaVerified: boolean;
    emailVerified: boolean;
  };
  schoolDoc?: InstanceType<typeof SchoolModel>;
  subscriptionDoc?: InstanceType<typeof SubscriptionModel>;
}

export function requireDb(req: Request, res: Response, next: NextFunction) {
  if (!isDbConnected()) {
    res.status(503).json({
      error: 'MongoDB Atlas is not configured or connected yet. Configure MONGODB_URI in environment secrets.',
      code: 'DB_NOT_CONFIGURED',
    });
    return;
  }
  next();
}

export function setSessionCookie(res: Response, token: string, maxAgeMs = 12 * 60 * 60 * 1000) {
  res.cookie('nexasua_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: maxAgeMs,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie('nexasua_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  });
}

function passesCsrfCheck(req: Request): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  if (req.headers['x-requested-with'] === 'NexaSua') return true;
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
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

export async function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!isDbConnected()) {
    res.status(503).json({
      error: 'Database is not connected.',
      code: 'DB_NOT_CONFIGURED',
    });
    return;
  }

  let token = '';
  let usedCookie = false;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.nexasua_session) {
    token = String(req.cookies.nexasua_session);
    usedCookie = true;
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  if (usedCookie && !passesCsrfCheck(req)) {
    res.status(403).json({ error: 'Invalid request origin or missing CSRF header.' });
    return;
  }

  const payload = verifySessionToken(token);
  if (!payload || !mongoose.isValidObjectId(payload.userId)) {
    res.status(401).json({ error: 'Invalid or expired session.' });
    return;
  }

  const user = await UserModel.findById(payload.userId).lean();
  if (!user || user.status !== 'ACTIVE') {
    res.status(401).json({ error: 'Account is inactive or not found.' });
    return;
  }

  if (user.mfaEnabled && !payload.mfaVerified) {
    res.status(401).json({ error: 'Multi-factor authentication verification required.', code: 'MFA_REQUIRED' });
    return;
  }

  req.authUser = {
    _id: String(user._id),
    email: user.email,
    fullName: user.fullName,
    role: user.role as UserRole,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    mfaEnabled: Boolean(user.mfaEnabled),
    mfaVerified: Boolean(payload.mfaVerified),
    emailVerified: Boolean(user.emailVerified),
  };

  next();
}

export function requireRole(...allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (req.authUser.role === 'SUPER_ADMIN') {
      next();
      return;
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      res.status(403).json({ error: 'You do not have permission to access this resource.' });
      return;
    }
    next();
  };
}

export async function requireSchoolContext(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  // Super Admin can enter any school workspace via X-NexaSua-School-Id header or ?schoolId query
  if (req.authUser.role === 'SUPER_ADMIN') {
    const requestedId = String(
      req.headers['x-nexasua-school-id'] || req.query.schoolId || ''
    ).trim();
    if (!requestedId || !mongoose.isValidObjectId(requestedId)) {
      res.status(400).json({
        error: 'Select a school workspace from the Super Admin Dashboard first.',
        code: 'SUPER_ADMIN_SCHOOL_CONTEXT_REQUIRED',
      });
      return;
    }

    const [school, subscription] = await Promise.all([
      SchoolModel.findById(requestedId),
      SubscriptionModel.findOne({ schoolId: requestedId }),
    ]);

    if (!school) {
      res.status(404).json({ error: 'Selected school record was not found.' });
      return;
    }

    req.authUser.schoolId = String(school._id);
    req.schoolDoc = school;
    if (subscription) {
      req.subscriptionDoc = subscription;
    }
    next();
    return;
  }

  // Never trust client-supplied schoolId for school users; strictly derive from verified user record
  if (!req.authUser.schoolId || !mongoose.isValidObjectId(req.authUser.schoolId)) {
    res.status(403).json({ error: 'No school tenant associated with this account.' });
    return;
  }

  const [school, subscription] = await Promise.all([
    SchoolModel.findById(req.authUser.schoolId),
    SubscriptionModel.findOne({ schoolId: req.authUser.schoolId }),
  ]);

  if (!school) {
    res.status(404).json({ error: 'School record not found.' });
    return;
  }

  if (school.status === 'PENDING') {
    res.status(403).json({ error: 'Your school application is awaiting Super Admin approval.' });
    return;
  }

  if (school.status === 'SUSPENDED' || school.status === 'REJECTED') {
    res.status(403).json({
      error: `School account is currently ${school.status.toLowerCase()}. Contact NexaFlow support.`,
    });
    return;
  }

  const closure = checkPortalClosure(subscription, school);
  if (closure.closed) {
    if (subscription && subscription.status !== 'EXPIRED' && subscription.status !== 'SUSPENDED') {
      subscription.status = 'EXPIRED';
      subscription.portalClosedReason = closure.reason;
      await subscription.save();
    }
    const isSchoolAdminBillingRoute =
      req.authUser.role === 'SCHOOL_ADMIN' &&
      req.baseUrl === '/api/school' &&
      req.path.startsWith('/subscription');
    if (!isSchoolAdminBillingRoute) {
      res.status(403).json({
        error: closure.reason,
        code: closure.code,
        vacationDate: closure.vacationDate,
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

export function requireCompletePlan(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.authUser?.role === 'SUPER_ADMIN' || req.authUser?.role === 'SCHOOL_ADMIN') {
    next();
    return;
  }
  const sub = req.subscriptionDoc;
  if (!sub || sub.plan !== 'COMPLETE') {
    res.status(403).json({
      error: 'This module requires the NexaSua Complete subscription plan.',
      code: 'PLAN_UPGRADE_REQUIRED',
    });
    return;
  }
  next();
}

export function requireActiveSubscriptionWrite(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.authUser?.role === 'SUPER_ADMIN') {
    next();
    return;
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  const sub = req.subscriptionDoc;
  if (!sub || ['EXPIRED', 'SUSPENDED'].includes(sub.status)) {
    res.status(403).json({
      error: 'School subscription is expired or suspended. Renew subscription to make changes (existing records remain preserved).',
      code: 'SUBSCRIPTION_INACTIVE',
    });
    return;
  }
  next();
}
