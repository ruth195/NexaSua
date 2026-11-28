import crypto from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import {
  decryptSecret,
  encryptSecret,
  getJwtSecret,
  getSchoolAdminEnvCredentials,
  getSuperAdminEnvCredentials,
  getSuperAdminGoogleEmails,
  isGoogleOAuthConfigured,
  matchSuperAdminGoogleAccount,
  verifyEnvSecretMatch,
} from '../config/env.js';
import { isDbConnected } from '../db.js';
import {
  authenticate,
  checkPortalClosure,
  clearSessionCookie,
  requireDb,
  requireRole,
  setSessionCookie,
  type AuthenticatedRequest,
} from '../middleware/auth.js';
import { parseBody } from '../middleware/validate.js';
import {
  AssessmentConfigModel,
  SchoolModel,
  SubscriptionModel,
  UserModel,
} from '../models/index.js';
import { DEFAULT_30_70_TEMPLATE } from '../services/gradingEngine.js';
import { sendTransactionalEmail } from '../services/messagingService.js';
import { ensureSystemConfig } from '../services/pricingEngine.js';
import {
  generateTotpQrDataUrl,
  generateTotpSecret,
  hashPassword,
  hashToken,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
  verifyTotpCode,
  writeAuditLog,
} from '../services/securityService.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again in 15 minutes.' },
});

function getBaseUrl(req: express.Request): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost:3000';
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

async function resolveSchoolAndSub(schoolId: unknown, userRole?: string) {
  if (!schoolId) return { error: null as string | null, schoolInfo: null, subscriptionInfo: null };
  const school = await SchoolModel.findById(schoolId).lean();
  if (!school) {
    return { error: 'Associated school record was not found.', schoolInfo: null, subscriptionInfo: null };
  }
  if (school.status === 'PENDING') {
    return {
      error: 'Your school application is still pending Super Admin approval.',
      code: 'SCHOOL_PENDING',
      schoolInfo: null,
      subscriptionInfo: null,
    };
  }
  if (school.status === 'REJECTED' || school.status === 'SUSPENDED') {
    return {
      error: `School access is ${school.status.toLowerCase()}. Please contact NexaFlow support.`,
      schoolInfo: null,
      subscriptionInfo: null,
    };
  }

  const sub = await SubscriptionModel.findOne({ schoolId: school._id });
  const closure = checkPortalClosure(sub, school);
  if (closure.closed) {
    if (sub && sub.status !== 'EXPIRED' && sub.status !== 'SUSPENDED') {
      sub.status = 'EXPIRED';
      sub.portalClosedReason = closure.reason;
      await sub.save();
    }
    if (userRole !== 'SCHOOL_ADMIN' && userRole !== 'SUPER_ADMIN') {
      return {
        error: closure.reason,
        code: closure.code,
        schoolInfo: null,
        subscriptionInfo: null,
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
    termVacationDate: school.termVacationDate || sub?.termVacationDate || '',
    onboardingSteps: school.onboardingSteps,
    reportCardSettings: school.reportCardSettings,
    dashboardSettings: school.dashboardSettings,
  };
  const subscriptionInfo = sub
    ? {
        plan: sub.plan,
        status: sub.status,
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
        studentBand: sub.studentBand,
        termVacationDate: sub.termVacationDate || school.termVacationDate || '',
        portalClosedReason: sub.portalClosedReason || closure.reason || '',
      }
    : null;
  return { error: null, schoolInfo, subscriptionInfo };
}

router.get('/super-admin-status', async (_req, res) => {
  const envCreds = getSuperAdminEnvCredentials();
  const adminEnvCreds = getSchoolAdminEnvCredentials();
  if (!isDbConnected()) {
    res.json({
      dbConnected: false,
      superAdminInitialized: envCreds.configured,
      superAdminManagedBySecrets: envCreds.configured,
      adminManagedBySecrets: adminEnvCreds.configured,
      googleOAuthEnabled: isGoogleOAuthConfigured(),
      setupKeyRequired: Boolean(process.env.SUPER_ADMIN_SETUP_KEY?.trim()),
    });
    return;
  }
  const cfg = await ensureSystemConfig();
  const count = await UserModel.countDocuments({ role: 'SUPER_ADMIN' });
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
    googleOAuthEnabled: isGoogleOAuthConfigured(),
    setupKeyRequired: Boolean(process.env.SUPER_ADMIN_SETUP_KEY?.trim()),
  });
});

const bootstrapSchema = z.object({
  fullName: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(10).max(128),
  setupKey: z.string().optional(),
});

router.post('/super-admin-bootstrap', authLimiter, requireDb, async (req, res) => {
  const body = parseBody(bootstrapSchema, req, res);
  if (!body) return;

  const envCreds = getSuperAdminEnvCredentials();
  if (envCreds.configured) {
    res.status(403).json({
      error: 'Super Admin credentials are already configured via Environment Secrets (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD).',
    });
    return;
  }

  const envKey = process.env.SUPER_ADMIN_SETUP_KEY?.trim();
  if (envKey && body.setupKey !== envKey) {
    res.status(403).json({ error: 'Invalid Super Admin setup key.' });
    return;
  }

  // Atomic check & claim so bootstrap can only ever run once
  const existingCount = await UserModel.countDocuments({ role: 'SUPER_ADMIN' });
  const cfg = await ensureSystemConfig();
  if (cfg.superAdminInitialized || existingCount > 0) {
    res.status(403).json({
      error: 'Platform Super Admin has already been initialized.',
    });
    return;
  }

  const emailTaken = await UserModel.findOne({ email: body.email.toLowerCase().trim() });
  if (emailTaken) {
    res.status(409).json({ error: 'Email already registered.' });
    return;
  }

  const user = await UserModel.create({
    email: body.email.toLowerCase().trim(),
    passwordHash: hashPassword(body.password),
    fullName: body.fullName.trim(),
    role: 'SUPER_ADMIN',
    schoolId: null,
    emailVerified: true,
    status: 'ACTIVE',
    lastLoginAt: new Date(),
  });

  cfg.superAdminInitialized = true;
  await cfg.save();

  const token = signSessionToken({
    userId: String(user._id),
    role: 'SUPER_ADMIN',
    schoolId: null,
    mfaVerified: true,
  });
  setSessionCookie(res, token);

  await writeAuditLog({
    userId: String(user._id),
    userEmail: user.email,
    userRole: 'SUPER_ADMIN',
    action: 'SUPER_ADMIN_BOOTSTRAPPED',
    resourceType: 'User',
    resourceId: String(user._id),
    ipAddress: req.ip,
  });

  res.status(201).json({
    token,
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      mfaEnabled: user.mfaEnabled,
    },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', authLimiter, requireDb, async (req, res) => {
  const body = parseBody(loginSchema, req, res);
  if (!body) return;

  const cleanEmail = body.email.toLowerCase().trim();
  const envCreds = getSuperAdminEnvCredentials();
  const adminEnvCreds = getSchoolAdminEnvCredentials();

  let user = await UserModel.findOne({ email: cleanEmail });

  // 1. Environment-secret Super Admin credential management (always overrides DB fallback and syncs immediately)
  if (envCreds.configured && cleanEmail === envCreds.email) {
    if (!verifyEnvSecretMatch(body.password, envCreds.password)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user && user.role !== 'SUPER_ADMIN') {
      res.status(409).json({
        error:
          'The configured SUPER_ADMIN_EMAIL is already assigned to a non-Super Admin account.',
      });
      return;
    }
    if (!user) {
      const existingSuper = await UserModel.findOne({ role: 'SUPER_ADMIN' });
      if (existingSuper) {
        existingSuper.email = envCreds.email;
        existingSuper.passwordHash = hashPassword(envCreds.password);
        existingSuper.emailVerified = true;
        existingSuper.status = 'ACTIVE';
        await existingSuper.save();
        user = existingSuper;
      } else {
        user = await UserModel.create({
          email: envCreds.email,
          passwordHash: hashPassword(envCreds.password),
          fullName: 'NexaFlow Super Admin',
          role: 'SUPER_ADMIN',
          schoolId: null,
          emailVerified: true,
          status: 'ACTIVE',
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
  } else if (envCreds.configured && user && user.role === 'SUPER_ADMIN') {
    // Reject old DB Super Admin email once SUPER_ADMIN_EMAIL secret is active
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  } else if (adminEnvCreds.configured && cleanEmail === adminEnvCreds.email) {
    // 2. Environment-secret School Admin credential retrieval & instant provisioning
    if (!verifyEnvSecretMatch(body.password, adminEnvCreds.password)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (user && user.role === 'SUPER_ADMIN') {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    if (!user) {
      let targetSchool =
        (await SchoolModel.findOne({ status: 'APPROVED', requestedPlan: 'COMPLETE' }).sort({
          createdAt: 1,
        })) || (await SchoolModel.findOne({ status: 'APPROVED' }).sort({ createdAt: 1 }));
      if (!targetSchool) {
        const suffix = crypto.randomInt(1000, 9999);
        const now = new Date();
        const futureVacation = new Date(now.getTime() + 110 * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        targetSchool = await SchoolModel.create({
          name: 'NexaFlow Flagship Academy',
          schoolCode: `NXS-ADM-${suffix}`,
          schoolType: 'Private',
          educationalLevels: ['Kindergarten', 'Primary', 'Junior High School', 'Senior High School'],
          country: 'Ghana',
          region: 'Greater Accra',
          town: 'Accra',
          address: 'Airport Residential Area, Accra',
          email: adminEnvCreds.email,
          phone: '+233 30 000 0000',
          status: 'APPROVED',
          studentPopulationEstimate: 300,
          requestedPlan: 'COMPLETE',
          termVacationDate: futureVacation,
          approvedAt: now,
          dataProtectionConsentAt: now,
        });
        await SubscriptionModel.create({
          schoolId: targetSchool._id,
          plan: 'COMPLETE',
          status: 'ACTIVE',
          billingCycle: 'TERM',
          trialEndsAt: new Date(now.getTime() + 7 * 86400_000),
          currentPeriodStart: now,
          currentPeriodEnd: new Date(`${futureVacation}T23:59:59.000Z`),
          termVacationDate: futureVacation,
          studentBand: '151–400 Students',
          unitPriceGhs: 0,
          discountPercent: 0,
          amountDueGhs: 0,
          gracePeriodDays: 7,
          overrideNote: 'Provisioned via ADMIN_EMAIL / ADMIN_PASSWORD Secret',
        });
        await AssessmentConfigModel.create({
          schoolId: targetSchool._id,
          ...DEFAULT_30_70_TEMPLATE,
          level: 'All',
          isDefault: true,
        });
      }

      user = await UserModel.create({
        email: adminEnvCreds.email,
        passwordHash: hashPassword(adminEnvCreds.password),
        fullName: 'School Administrator',
        role: 'SCHOOL_ADMIN',
        schoolId: targetSchool._id,
        emailVerified: true,
        status: 'ACTIVE',
        dataConsentAcceptedAt: new Date(),
      });
    } else {
      if (!verifyPassword(adminEnvCreds.password, user.passwordHash)) {
        user.passwordHash = hashPassword(adminEnvCreds.password);
      }
      user.emailVerified = true;
      user.status = 'ACTIVE';
      await user.save();
    }
  } else {
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }
  }

  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Your user account is currently suspended.' });
    return;
  }

  const schoolResolved = await resolveSchoolAndSub(user.schoolId, user.role);
  if (schoolResolved.error) {
    res.status(403).json({
      error: schoolResolved.error,
      code: schoolResolved.code,
    });
    return;
  }

  if (user.mfaEnabled) {
    const mfaChallengeToken = jwt.sign(
      { userId: String(user._id), stage: 'MFA_CHALLENGE' },
      getJwtSecret(),
      { expiresIn: '10m' }
    );
    res.json({
      mfaRequired: true,
      mfaChallengeToken,
    });
    return;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signSessionToken({
    userId: String(user._id),
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    mfaVerified: true,
  });
  setSessionCookie(res, token);

  await writeAuditLog({
    schoolId: user.schoolId ? String(user.schoolId) : null,
    userId: String(user._id),
    userEmail: user.email,
    userRole: user.role,
    action: 'USER_LOGIN',
    resourceType: 'User',
    resourceId: String(user._id),
    ipAddress: req.ip,
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
      emailVerified: user.emailVerified,
      linkedGoogleEmail: (user as { linkedGoogleEmail?: string }).linkedGoogleEmail || '',
    },
    school: schoolResolved.schoolInfo,
    subscription: schoolResolved.subscriptionInfo,
  });
});

// Update Super Admin Email & Password anytime (when not overridden by environment secrets)
const updateSuperAdminCredsSchema = z.object({
  currentPassword: z.string().min(1),
  fullName: z.string().min(2).max(120).optional(),
  newEmail: z.string().email().optional(),
  newPassword: z.string().min(10).max(128).optional().or(z.literal('')),
});

router.put(
  '/super-admin-credentials',
  authenticate,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(updateSuperAdminCredsSchema, req, res);
    if (!body) return;

    const envCreds = getSuperAdminEnvCredentials();
    if (envCreds.configured) {
      res.status(400).json({
        error:
          'Super Admin email and password are currently managed by Environment Secrets (SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD). Update those secrets in AI Studio Settings -> Secrets anytime to change them.',
      });
      return;
    }

    const user = await UserModel.findById(req.authUser!._id);
    if (!user || !verifyPassword(body.currentPassword, user.passwordHash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }

    if (body.newEmail) {
      const normalized = body.newEmail.toLowerCase().trim();
      if (normalized !== user.email) {
        const conflict = await UserModel.exists({ email: normalized, _id: { $ne: user._id } });
        if (conflict) {
          res.status(409).json({ error: 'Another user is already registered with that email.' });
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
      action: 'SUPER_ADMIN_CREDENTIALS_UPDATED',
      resourceType: 'User',
      resourceId: String(user._id),
      ipAddress: req.ip,
    });

    res.json({
      message: 'Super Admin credentials updated successfully.',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
        linkedGoogleEmail: user.linkedGoogleEmail || '',
      },
    });
  }
);

const linkSuperAdminGoogleSchema = z.object({
  linkedGoogleEmail: z.string().trim().max(160).default(''),
});

router.put(
  '/super-admin/google-link',
  requireDb,
  authenticate,
  requireRole('SUPER_ADMIN'),
  async (req: AuthenticatedRequest, res) => {
    const body = parseBody(linkSuperAdminGoogleSchema, req, res);
    if (!body) return;

    const cleanGoogleEmail = body.linkedGoogleEmail.toLowerCase().trim();
    if (cleanGoogleEmail) {
      const emailCheck = z.string().email().safeParse(cleanGoogleEmail);
      if (!emailCheck.success) {
        res.status(400).json({ error: 'Please enter a valid Google email address.' });
        return;
      }
    }

    const user = await UserModel.findById(req.authUser!._id);
    if (!user || user.role !== 'SUPER_ADMIN') {
      res.status(404).json({ error: 'Super Admin account not found.' });
      return;
    }

    const previousEmail = user.linkedGoogleEmail || '';
    user.linkedGoogleEmail = cleanGoogleEmail;
    if (!cleanGoogleEmail || previousEmail !== cleanGoogleEmail) {
      user.googleId = '';
    }
    if (cleanGoogleEmail && user.authProvider === 'LOCAL') {
      user.authProvider = 'HYBRID';
    }
    await user.save();

    await writeAuditLog({
      userId: String(user._id),
      userEmail: user.email,
      userRole: user.role,
      action: cleanGoogleEmail ? 'SUPER_ADMIN_GOOGLE_LINKED' : 'SUPER_ADMIN_GOOGLE_UNLINKED',
      resourceType: 'User',
      resourceId: String(user._id),
      details: { linkedGoogleEmail: cleanGoogleEmail || null },
      ipAddress: req.ip,
    });

    res.json({
      message: cleanGoogleEmail
        ? `Linked Google account (${cleanGoogleEmail}) to Super Admin. Signing in with this Google account will automatically open all dashboards.`
        : 'Google account link removed from Super Admin.',
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        schoolId: user.schoolId,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified,
        linkedGoogleEmail: user.linkedGoogleEmail || '',
      },
    });
  }
);

// =====================
// GOOGLE SIGN-IN (SCHOOL USERS & AUTHORIZED/LINKED SUPER ADMIN)
// =====================
router.get('/google/url', async (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    res.status(503).json({
      error:
        'Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment secrets.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    });
    return;
  }

  const rawIntent = String(req.query.intent || 'login');
  const intent =
    rawIntent === 'register' ||
    rawIntent === 'super_admin' ||
    rawIntent === 'link_super_admin'
      ? rawIntent
      : 'login';

  let linkUserId: string | undefined;
  if (intent === 'link_super_admin') {
    if (!isDbConnected()) {
      res.status(503).json({ error: 'Database is not connected.' });
      return;
    }
    const authHeader = req.headers.authorization;
    const rawToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : req.cookies?.nexasua_session
          ? String(req.cookies.nexasua_session)
          : '';
    const payload = rawToken ? verifySessionToken(rawToken) : null;
    const requester = payload ? await UserModel.findById(payload.userId).lean() : null;
    if (
      !requester ||
      requester.status !== 'ACTIVE' ||
      requester.role !== 'SUPER_ADMIN' ||
      (requester.mfaEnabled && !payload?.mfaVerified)
    ) {
      res.status(403).json({
        error: 'Only an authenticated Super Admin can link a Google account.',
      });
      return;
    }
    linkUserId = String(requester._id);
  }

  const redirectUri = `${getBaseUrl(req)}/api/auth/google/callback`;
  const stateToken = jwt.sign(
    {
      nonce: crypto.randomBytes(12).toString('hex'),
      intent,
      linkUserId,
      redirectUri,
      stage: 'GOOGLE_OAUTH_STATE',
    },
    getJwtSecret(),
    { expiresIn: '10m' }
  );

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: stateToken,
    prompt: 'select_account',
  });

  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    redirectUri,
  });
});

function sendGooglePopupHtml(res: express.Response, payload: Record<string, unknown>) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
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

async function handleGoogleCallback(req: express.Request, res: express.Response) {
  const oauthError = req.query.error ? String(req.query.error) : '';
  if (oauthError) {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: 'Google sign-in was cancelled or denied.',
    });
    return;
  }

  const code = String(req.query.code || '');
  const stateRaw = String(req.query.state || '');
  if (!code || !stateRaw) {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: 'Missing authorization code or state from Google.',
    });
    return;
  }

  let state: { stage?: string; intent?: string; linkUserId?: string; redirectUri?: string };
  try {
    state = jwt.verify(stateRaw, getJwtSecret()) as {
      stage?: string;
      intent?: string;
      linkUserId?: string;
      redirectUri?: string;
    };
  } catch {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: 'Google sign-in session expired. Please try again.',
    });
    return;
  }

  if (state.stage !== 'GOOGLE_OAUTH_STATE' || !state.redirectUri) {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: 'Invalid OAuth state.',
    });
    return;
  }

  if (!isDbConnected()) {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: 'Database is not connected yet. Configure MONGODB_URI first.',
    });
    return;
  }

  if (!isGoogleOAuthConfigured()) {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: 'Google OAuth credentials are not configured on the server.',
    });
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: state.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenJson = (await tokenRes.json()) as { access_token?: string; error_description?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_ERROR',
        error: tokenJson.error_description || 'Failed to exchange Google authorization code.',
      });
      return;
    }

    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const profile = (await userinfoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
    };

    if (!userinfoRes.ok || !profile.email || !profile.email_verified || !profile.sub) {
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_ERROR',
        error: 'A verified Google email address is required.',
      });
      return;
    }

    const email = profile.email.toLowerCase().trim();

    // 1. Authenticated Super Admin explicitly linking their Google account
    if (state.intent === 'link_super_admin' && state.linkUserId) {
      const targetSuperAdmin = await UserModel.findById(state.linkUserId);
      if (
        !targetSuperAdmin ||
        targetSuperAdmin.role !== 'SUPER_ADMIN' ||
        targetSuperAdmin.status !== 'ACTIVE'
      ) {
        sendGooglePopupHtml(res, {
          type: 'NEXASUA_GOOGLE_ERROR',
          error: 'Super Admin account not found or inactive.',
        });
        return;
      }

      targetSuperAdmin.linkedGoogleEmail = email;
      targetSuperAdmin.googleId = profile.sub;
      targetSuperAdmin.emailVerified = true;
      if (targetSuperAdmin.authProvider === 'LOCAL') {
        targetSuperAdmin.authProvider = 'HYBRID';
      }
      await targetSuperAdmin.save();

      await writeAuditLog({
        userId: String(targetSuperAdmin._id),
        userEmail: targetSuperAdmin.email,
        userRole: targetSuperAdmin.role,
        action: 'SUPER_ADMIN_GOOGLE_LINKED',
        resourceType: 'User',
        resourceId: String(targetSuperAdmin._id),
        details: { linkedGoogleEmail: email },
        ipAddress: req.ip,
      });

      sendGooglePopupHtml(res, {
        type: 'NEXASUA_SUPER_ADMIN_GOOGLE_LINKED',
        linkedGoogleEmail: email,
        user: {
          id: targetSuperAdmin._id,
          email: targetSuperAdmin.email,
          fullName: targetSuperAdmin.fullName,
          role: targetSuperAdmin.role,
          schoolId: targetSuperAdmin.schoolId,
          mfaEnabled: targetSuperAdmin.mfaEnabled,
          emailVerified: targetSuperAdmin.emailVerified,
          linkedGoogleEmail: targetSuperAdmin.linkedGoogleEmail,
        },
      });
      return;
    }

    // 2. Authorized or linked Super Admin Google Sign-In
    const superAdminUsers = await UserModel.find({ role: 'SUPER_ADMIN' })
      .select('_id email linkedGoogleEmail googleId status')
      .lean();
    const superAdminMatch = matchSuperAdminGoogleAccount({
      verifiedEmail: email,
      googleSub: profile.sub,
      envGoogleEmails: getSuperAdminGoogleEmails(),
      superAdminUsers,
    });

    if (superAdminMatch.authorized) {
      const envCreds = getSuperAdminEnvCredentials();
      let saUser = superAdminMatch.matchedUserId
        ? await UserModel.findById(superAdminMatch.matchedUserId)
        : null;

      if (!saUser) {
        const canonicalEmail = envCreds.configured ? envCreds.email : email;
        const conflict = await UserModel.findOne({ email: canonicalEmail });
        if (conflict && conflict.role !== 'SUPER_ADMIN') {
          sendGooglePopupHtml(res, {
            type: 'NEXASUA_GOOGLE_ERROR',
            error:
              'The configured Super Admin email is already assigned to a non-Super Admin account.',
          });
          return;
        }
        saUser =
          conflict ||
          (await UserModel.create({
            email: canonicalEmail,
            passwordHash: envCreds.configured ? hashPassword(envCreds.password) : '',
            fullName: profile.name || 'NexaFlow Super Admin',
            role: 'SUPER_ADMIN',
            schoolId: null,
            googleId: profile.sub,
            linkedGoogleEmail: email,
            authProvider: envCreds.configured ? 'HYBRID' : 'GOOGLE',
            emailVerified: true,
            status: 'ACTIVE',
          }));

        const cfg = await ensureSystemConfig();
        if (!cfg.superAdminInitialized) {
          cfg.superAdminInitialized = true;
          await cfg.save();
        }
      } else {
        if (saUser.status !== 'ACTIVE') {
          sendGooglePopupHtml(res, {
            type: 'NEXASUA_GOOGLE_ERROR',
            error: 'Super Admin account is currently suspended.',
          });
          return;
        }
        saUser.googleId = profile.sub;
        saUser.emailVerified = true;
        if (!saUser.linkedGoogleEmail) {
          saUser.linkedGoogleEmail = email;
        }
        if (saUser.authProvider === 'LOCAL') {
          saUser.authProvider = 'HYBRID';
        }
      }

      if (saUser.mfaEnabled) {
        await saUser.save();
        const mfaChallengeToken = jwt.sign(
          { userId: String(saUser._id), stage: 'MFA_CHALLENGE' },
          getJwtSecret(),
          { expiresIn: '10m' }
        );
        sendGooglePopupHtml(res, {
          type: 'NEXASUA_GOOGLE_MFA_REQUIRED',
          mfaChallengeToken,
          autoOpenAllDashboards: true,
        });
        return;
      }

      saUser.lastLoginAt = new Date();
      await saUser.save();

      const token = signSessionToken({
        userId: String(saUser._id),
        role: saUser.role,
        schoolId: null,
        mfaVerified: true,
      });
      setSessionCookie(res, token);

      await writeAuditLog({
        userId: String(saUser._id),
        userEmail: saUser.email,
        userRole: saUser.role,
        action: 'SUPER_ADMIN_GOOGLE_LOGIN',
        resourceType: 'User',
        resourceId: String(saUser._id),
        details: { matchedBy: superAdminMatch.reason, googleEmail: email },
        ipAddress: req.ip,
      });

      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_AUTH_SUCCESS',
        token,
        autoOpenAllDashboards: true,
        user: {
          id: saUser._id,
          email: saUser.email,
          fullName: saUser.fullName,
          role: saUser.role,
          schoolId: saUser.schoolId,
          mfaEnabled: saUser.mfaEnabled,
          emailVerified: saUser.emailVerified,
          linkedGoogleEmail: saUser.linkedGoogleEmail || email,
        },
        school: null,
        subscription: null,
      });
      return;
    }

    if (state.intent === 'super_admin') {
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_ERROR',
        error: `Google account (${email}) is not linked to the Super Admin portal. Sign in with your Super Admin credentials first to link this Google account.`,
      });
      return;
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      const googleOnboardingToken = jwt.sign(
        {
          stage: 'GOOGLE_ONBOARDING',
          email,
          fullName: profile.name || email.split('@')[0],
          googleId: profile.sub,
        },
        getJwtSecret(),
        { expiresIn: '20m' }
      );
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_NEW_USER',
        intent: state.intent || 'login',
        email,
        fullName: profile.name || '',
        googleOnboardingToken,
      });
      return;
    }

    if (user.status !== 'ACTIVE') {
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_ERROR',
        error: 'Your user account is currently suspended.',
      });
      return;
    }

    const schoolResolved = await resolveSchoolAndSub(user.schoolId, user.role);
    if (schoolResolved.error) {
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_ERROR',
        error: schoolResolved.error,
      });
      return;
    }

    user.googleId = profile.sub;
    user.emailVerified = true;
    if (user.authProvider === 'LOCAL') {
      user.authProvider = 'HYBRID';
    }

    if (user.mfaEnabled) {
      await user.save();
      const mfaChallengeToken = jwt.sign(
        { userId: String(user._id), stage: 'MFA_CHALLENGE' },
        getJwtSecret(),
        { expiresIn: '10m' }
      );
      sendGooglePopupHtml(res, {
        type: 'NEXASUA_GOOGLE_MFA_REQUIRED',
        mfaChallengeToken,
      });
      return;
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = signSessionToken({
      userId: String(user._id),
      role: user.role,
      schoolId: user.schoolId ? String(user.schoolId) : null,
      mfaVerified: true,
    });
    setSessionCookie(res, token);

    await writeAuditLog({
      schoolId: user.schoolId ? String(user.schoolId) : null,
      userId: String(user._id),
      userEmail: user.email,
      userRole: user.role,
      action: 'USER_GOOGLE_LOGIN',
      resourceType: 'User',
      resourceId: String(user._id),
      ipAddress: req.ip,
    });

    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_AUTH_SUCCESS',
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        schoolId: user.schoolId,
        mfaEnabled: user.mfaEnabled,
        emailVerified: user.emailVerified,
      },
      school: schoolResolved.schoolInfo,
      subscription: schoolResolved.subscriptionInfo,
    });
  } catch (err) {
    sendGooglePopupHtml(res, {
      type: 'NEXASUA_GOOGLE_ERROR',
      error: err instanceof Error ? err.message : 'Google authentication failed.',
    });
  }
}

router.get(['/google/callback', '/google/callback/'], handleGoogleCallback);

const verifyMfaLoginSchema = z.object({
  mfaChallengeToken: z.string().min(10),
  code: z.string().min(6).max(16),
});

router.post('/mfa/verify-login', authLimiter, requireDb, async (req, res) => {
  const body = parseBody(verifyMfaLoginSchema, req, res);
  if (!body) return;

  let decoded: { userId?: string; stage?: string };
  try {
    decoded = jwt.verify(body.mfaChallengeToken, getJwtSecret()) as {
      userId?: string;
      stage?: string;
    };
  } catch {
    res.status(401).json({ error: 'MFA challenge expired. Please sign in again.' });
    return;
  }

  if (decoded.stage !== 'MFA_CHALLENGE' || !decoded.userId) {
    res.status(401).json({ error: 'Invalid MFA challenge token.' });
    return;
  }

  const user = await UserModel.findById(decoded.userId);
  if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) {
    res.status(401).json({ error: 'MFA is not active on this account.' });
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
    res.status(401).json({ error: 'Invalid verification code.' });
    return;
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signSessionToken({
    userId: String(user._id),
    role: user.role,
    schoolId: user.schoolId ? String(user.schoolId) : null,
    mfaVerified: true,
  });
  setSessionCookie(res, token);

  let school = null;
  let subscription = null;
  if (user.schoolId) {
    school = await SchoolModel.findById(user.schoolId).select('-paymentConfig.paystackSecretEncrypted').lean();
    subscription = await SubscriptionModel.findOne({ schoolId: user.schoolId }).lean();
  }

  res.json({
    token,
    autoOpenAllDashboards: user.role === 'SUPER_ADMIN',
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      schoolId: user.schoolId,
      mfaEnabled: user.mfaEnabled,
      emailVerified: user.emailVerified,
      linkedGoogleEmail: (user as { linkedGoogleEmail?: string }).linkedGoogleEmail || '',
    },
    school,
    subscription,
  });
});

router.post('/mfa/setup', authenticate, async (req: AuthenticatedRequest, res) => {
  const user = await UserModel.findById(req.authUser!._id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const secret = generateTotpSecret();
  user.mfaSecretEncrypted = encryptSecret(secret);
  await user.save();

  const qrDataUrl = await generateTotpQrDataUrl(user.email, secret);
  res.json({ secret, qrDataUrl });
});

router.post('/mfa/enable', authenticate, async (req: AuthenticatedRequest, res) => {
  const code = String(req.body?.code || '').trim();
  const user = await UserModel.findById(req.authUser!._id);
  if (!user || !user.mfaSecretEncrypted) {
    res.status(400).json({ error: 'Initiate MFA setup first.' });
    return;
  }
  const secret = decryptSecret(user.mfaSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    res.status(400).json({ error: 'Invalid 6-digit authenticator code.' });
    return;
  }

  const backupCodes = Array.from({ length: 6 }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
  user.mfaEnabled = true;
  user.mfaBackupCodesHash = backupCodes.map(hashToken);
  await user.save();

  await writeAuditLog({
    schoolId: user.schoolId ? String(user.schoolId) : null,
    userId: String(user._id),
    userEmail: user.email,
    userRole: user.role,
    action: 'MFA_ENABLED',
    resourceType: 'User',
    resourceId: String(user._id),
    ipAddress: req.ip,
  });

  res.json({ enabled: true, backupCodes });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', authenticate, async (req: AuthenticatedRequest, res) => {
  let school = null;
  let subscription = null;
  if (req.authUser!.schoolId) {
    const [s, sub] = await Promise.all([
      SchoolModel.findById(req.authUser!.schoolId).select('-paymentConfig.paystackSecretEncrypted').lean(),
      SubscriptionModel.findOne({ schoolId: req.authUser!.schoolId }).lean(),
    ]);
    school = s;
    subscription = sub;
  }

  res.json({
    user: req.authUser,
    school,
    subscription,
    superAdminManagedBySecrets:
      req.authUser!.role === 'SUPER_ADMIN' ? getSuperAdminEnvCredentials().configured : false,
    adminManagedBySecrets: getSchoolAdminEnvCredentials().configured,
  });
});

router.post('/verify-email', requireDb, async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }
  const user = await UserModel.findOne({ verificationTokenHash: hashToken(token) });
  if (!user) {
    res.status(400).json({ error: 'Invalid or already used verification token.' });
    return;
  }
  user.emailVerified = true;
  user.verificationTokenHash = '';
  await user.save();
  res.json({ verified: true, email: user.email });
});

router.post('/request-password-reset', authLimiter, requireDb, async (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const user = await UserModel.findOne({ email });
  if (user && user.role !== 'SUPER_ADMIN') {
    const rawToken = crypto.randomBytes(24).toString('hex');
    user.resetTokenHash = hashToken(rawToken);
    user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    const baseUrl = getBaseUrl(req);
    await sendTransactionalEmail({
      to: user.email,
      subject: 'NexaSua Password Reset Request',
      text: `Reset your password within 1 hour using: ${baseUrl}/login?resetToken=${rawToken}`,
    });
  }
  // Always return generic confirmation to avoid account enumeration
  res.json({
    message:
      'If an account exists for that email and transactional email is configured, reset instructions have been sent.',
  });
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8).max(128),
});

router.post('/reset-password', authLimiter, requireDb, async (req, res) => {
  const body = parseBody(resetPasswordSchema, req, res);
  if (!body) return;

  const user = await UserModel.findOne({
    resetTokenHash: hashToken(body.token),
    resetTokenExpires: { $gt: new Date() },
    role: { $ne: 'SUPER_ADMIN' },
  });

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  user.passwordHash = hashPassword(body.newPassword);
  user.resetTokenHash = '';
  user.resetTokenExpires = null;
  await user.save();

  res.json({ message: 'Password updated successfully. You may now log in.' });
});

export default router;
