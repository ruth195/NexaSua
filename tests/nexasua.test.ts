import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  calculateClassRankings,
  calculateStudentSubjectScore,
  DEFAULT_30_70_TEMPLATE,
} from '../server/services/gradingEngine.ts';
import { verifyPaystackWebhookSignature } from '../server/services/paystackService.ts';
import {
  generateReceiptPdfBuffer,
  generateReportCardPdfBuffer,
} from '../server/services/pdfService.ts';
import {
  calculateSubscriptionPrice,
  DEFAULT_PLAN_CATALOG,
} from '../server/services/pricingEngine.ts';
import {
  getSchoolAdminEnvCredentials,
  verifyEnvSecretMatch,
} from '../server/config/env.ts';
import { checkPortalClosure } from '../server/middleware/auth.ts';
import {
  generateTotpCode,
  generateTotpSecret,
  hashPassword,
  verifyPassword,
  verifyTotpCode,
} from '../server/services/securityService.ts';

test('Grading Engine: 30/70 calculation and zero vs missing distinction', () => {
  const full = calculateStudentSubjectScore({
    categories: DEFAULT_30_70_TEMPLATE.categories,
    gradingScale: DEFAULT_30_70_TEMPLATE.gradingScale,
    passMark: 50,
    roundingMode: 'ONE_DECIMAL',
    missingMarkPolicy: 'TREAT_AS_INCOMPLETE',
    inputScores: {
      class_work: 12, // 12/15 * 15 = 12
      class_test: 15, // 15/15 * 15 = 15
      end_term_exam: 80, // 80/100 * 70 = 56
    },
  });
  assert.equal(full.valid, true);
  assert.equal(full.hasMissingMarks, false);
  assert.equal(full.caScore, 27);
  assert.equal(full.examScore, 56);
  assert.equal(full.finalScore, 83);
  assert.equal(full.grade, 'A1');

  // Zero score is valid, NOT missing
  const zeroExam = calculateStudentSubjectScore({
    categories: DEFAULT_30_70_TEMPLATE.categories,
    gradingScale: DEFAULT_30_70_TEMPLATE.gradingScale,
    passMark: 50,
    roundingMode: 'ONE_DECIMAL',
    missingMarkPolicy: 'TREAT_AS_INCOMPLETE',
    inputScores: {
      class_work: 10,
      class_test: 10,
      end_term_exam: 0,
    },
  });
  assert.equal(zeroExam.valid, true);
  assert.equal(zeroExam.hasMissingMarks, false);
  assert.equal(zeroExam.finalScore, 20);
  assert.equal(zeroExam.grade, 'F9');

  // Null score is missing -> INC
  const missingExam = calculateStudentSubjectScore({
    categories: DEFAULT_30_70_TEMPLATE.categories,
    gradingScale: DEFAULT_30_70_TEMPLATE.gradingScale,
    passMark: 50,
    roundingMode: 'ONE_DECIMAL',
    missingMarkPolicy: 'TREAT_AS_INCOMPLETE',
    inputScores: {
      class_work: 10,
      class_test: 10,
      end_term_exam: null,
    },
  });
  assert.equal(missingExam.valid, true);
  assert.equal(missingExam.hasMissingMarks, true);
  assert.equal(missingExam.finalScore, null);
  assert.equal(missingExam.grade, 'INC');

  // Reject exceeding maxMarks
  const overMax = calculateStudentSubjectScore({
    categories: DEFAULT_30_70_TEMPLATE.categories,
    gradingScale: DEFAULT_30_70_TEMPLATE.gradingScale,
    passMark: 50,
    roundingMode: 'ONE_DECIMAL',
    missingMarkPolicy: 'TREAT_AS_INCOMPLETE',
    inputScores: {
      class_work: 18,
      class_test: 10,
      end_term_exam: 70,
    },
  });
  assert.equal(overMax.valid, false);
});

test('Grading Engine: tied class rankings (1, 2, 2, 4)', () => {
  const ranked = calculateClassRankings([
    { studentId: 's1', averageScore: 91.5 },
    { studentId: 's2', averageScore: 84.0 },
    { studentId: 's3', averageScore: 84.0 },
    { studentId: 's4', averageScore: 71.2 },
  ]);
  assert.deepEqual(
    ranked.map((r) => [r.studentId, r.position]),
    [
      ['s1', 1],
      ['s2', 2],
      ['s3', 2],
      ['s4', 4],
    ]
  );
});

test('Pricing Engine: Ghana bands & 10% three-term discount', () => {
  const coreSmall = calculateSubscriptionPrice({
    studentCount: 120,
    plan: 'CORE',
    billingCycle: 'TERM',
  });
  assert.equal(coreSmall.netPayableGhs, 350);

  const completeThreeTerms = calculateSubscriptionPrice({
    studentCount: 300,
    plan: 'COMPLETE',
    billingCycle: 'THREE_TERMS',
  });
  // 1200 * 3 = 3600; 10% off = 3240
  assert.equal(completeThreeTerms.grossAmountGhs, 3600);
  assert.equal(completeThreeTerms.threeTermDiscountGhs, 360);
  assert.equal(completeThreeTerms.netPayableGhs, 3240);

  const largeSchool = calculateSubscriptionPrice({
    studentCount: 1650,
    plan: 'COMPLETE',
    billingCycle: 'TERM',
  });
  assert.equal(largeSchool.isCustomQuote, true);
  assert.equal(largeSchool.netPayableGhs, null);
});

test('Security: password hashing, env secret verification, TOTP MFA, and Paystack HMAC signature', () => {
  const hash = hashPassword('GhanaSchool2026!');
  assert.equal(verifyPassword('GhanaSchool2026!', hash), true);
  assert.equal(verifyPassword('WrongPass', hash), false);
  assert.equal(verifyPassword('anything', ''), false);

  assert.equal(verifyEnvSecretMatch('SuperPass123!', 'SuperPass123!'), true);
  assert.equal(verifyEnvSecretMatch('Wrong', 'SuperPass123!'), false);
  assert.equal(verifyEnvSecretMatch('', ''), false);

  const secret = generateTotpSecret();
  const code = generateTotpCode(secret);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, '000000'), false);

  const payload = JSON.stringify({ event: 'charge.success', data: { reference: 'ref-1' } });
  const key = 'sk_test_example_secret';
  const sig = crypto.createHmac('sha512', key).update(payload).digest('hex');
  assert.equal(verifyPaystackWebhookSignature(payload, sig, key), true);
  assert.equal(verifyPaystackWebhookSignature(payload, 'bad_sig', key), false);
});

test('PDF Generation: A4 Terminal Report Card and Fee Receipt buffers', async () => {
  const reportPdf = await generateReportCardPdfBuffer([
    {
      schoolName: 'Accra Test Academy',
      schoolAddress: 'Cantonments, Accra',
      schoolPhone: '+233 30 000 0000',
      schoolEmail: 'office@test.edu.gh',
      studentName: 'Ama Mensah',
      admissionNumber: 'ADM-2026-1001',
      className: 'JHS 2A',
      educationalLevel: 'Junior High School',
      academicYear: '2026/2027',
      termName: 'Term 1',
      referenceNumber: 'RC-NXS-100001',
      verificationUrl: 'https://nexasua.example/verify-report?token=RC-NXS-100001.abc',
      issueDate: '22 Nov 2026',
      reopeningDate: '11 Jan 2027',
      overallAverage: 81.5,
      classPosition: 1,
      totalStudentsInClass: 25,
      showClassPosition: true,
      showAttendanceSummary: true,
      showQrVerification: true,
      attendanceSummary: { present: 58, absent: 1, late: 1, excused: 0, totalDays: 60 },
      subjects: [
        {
          subjectName: 'Mathematics',
          caScore: 26,
          examScore: 58,
          finalScore: 84,
          grade: 'A1',
          remark: 'Excellent',
        },
      ],
      classTeacherRemarks: 'Focused and diligent.',
      headteacherRemarks: 'Keep up the excellence.',
      headteacherName: 'Mr. K. Boateng',
      promotionStatus: 'Promoted',
    },
  ]);
  assert.equal(reportPdf.subarray(0, 5).toString('ascii'), '%PDF-');

  const receiptPdf = await generateReceiptPdfBuffer({
    schoolName: 'Accra Test Academy',
    schoolAddress: 'Cantonments, Accra',
    schoolPhone: '+233 30 000 0000',
    receiptNumber: 'RCP-1001',
    paymentReference: 'OFF-1001',
    studentName: 'Ama Mensah',
    admissionNumber: 'ADM-2026-1001',
    className: 'JHS 2A',
    invoiceNumber: 'INV-1001',
    amountPaidGhs: 850,
    balanceRemainingGhs: 0,
    channel: 'OFFLINE_MOMO',
    paidAt: '22 Nov 2026',
  });
  assert.equal(receiptPdf.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('Term Vacation Date Closure & Plan Catalog Defaults', () => {
  const fixedNow = new Date('2026-11-23T12:00:00.000Z');

  // Future vacation date -> portal remains open
  const openRes = checkPortalClosure(
    { status: 'ACTIVE', termVacationDate: '2026-12-18' },
    { termVacationDate: '2026-12-18' },
    fixedNow
  );
  assert.equal(openRes.closed, false);

  // Vacation date equal to today -> portal closes automatically
  const sameDayRes = checkPortalClosure(
    { status: 'ACTIVE', termVacationDate: '2026-11-23' },
    { termVacationDate: '2026-11-23' },
    fixedNow
  );
  assert.equal(sameDayRes.closed, true);
  assert.equal(sameDayRes.code, 'PORTAL_CLOSED_SUBSCRIPTION_ENDED');

  // Past vacation date on trial -> portal closes automatically
  const pastRes = checkPortalClosure(
    { status: 'TRIAL' },
    { termVacationDate: '2026-11-20' },
    fixedNow
  );
  assert.equal(pastRes.closed, true);

  // Explicit EXPIRED status -> portal closed
  const expiredRes = checkPortalClosure(
    { status: 'EXPIRED', termVacationDate: '2026-12-30' },
    { termVacationDate: '2026-12-30' },
    fixedNow
  );
  assert.equal(expiredRes.closed, true);

  // Default plan catalog contains CORE, COMPLETE, CUSTOM
  const codes = DEFAULT_PLAN_CATALOG.map((p) => p.code);
  assert.ok(codes.includes('CORE'));
  assert.ok(codes.includes('COMPLETE'));
  assert.ok(codes.includes('CUSTOM'));

  // Admin secrets helper shape check
  const adminEnv = getSchoolAdminEnvCredentials();
  assert.equal(typeof adminEnv.configured, 'boolean');
});

test('Subscription Countdown & Approaching Term End Warning', async () => {
  const { getSubscriptionCountdownState } = await import(
    '../src/components/SubscriptionStatusCard.tsx'
  );
  const fixedNow = new Date('2026-11-23T10:00:00.000Z');

  // > 14 days away -> active, not approaching
  const comfortable = getSubscriptionCountdownState(
    {
      plan: 'COMPLETE',
      status: 'ACTIVE',
      billingCycle: 'TERM',
      trialEndsAt: '2026-11-30T00:00:00.000Z',
      currentPeriodEnd: '2026-12-20T23:59:59.000Z',
      termVacationDate: '2026-12-20',
      studentBand: '101-300',
      unitPriceGhs: 800,
      amountDueGhs: 0,
    },
    null,
    fixedNow
  );
  assert.equal(comfortable.tone, 'active');
  assert.equal(comfortable.isApproaching, false);
  assert.equal(comfortable.daysRemaining, 27);

  // <= 14 days away -> approaching warning
  const approaching = getSubscriptionCountdownState(
    {
      plan: 'CORE',
      status: 'ACTIVE',
      billingCycle: 'TERM',
      trialEndsAt: '2026-11-30T00:00:00.000Z',
      currentPeriodEnd: '2026-11-30T23:59:59.000Z',
      termVacationDate: '2026-11-30',
      studentBand: '1-100',
      unitPriceGhs: 350,
      amountDueGhs: 0,
    },
    null,
    fixedNow
  );
  assert.equal(approaching.tone, 'approaching');
  assert.equal(approaching.isApproaching, true);
  assert.equal(approaching.daysRemaining, 7);
  assert.match(approaching.countdownText, /7 days remaining/i);

  // Reached today -> expired/closed tone
  const reached = getSubscriptionCountdownState(
    {
      plan: 'CORE',
      status: 'ACTIVE',
      billingCycle: 'TERM',
      trialEndsAt: '2026-11-23T00:00:00.000Z',
      currentPeriodEnd: '2026-11-23T23:59:59.000Z',
      termVacationDate: '2026-11-23',
      studentBand: '1-100',
      unitPriceGhs: 350,
      amountDueGhs: 0,
    },
    null,
    fixedNow
  );
  assert.equal(reached.tone, 'expired');
  assert.equal(reached.isClosedOrExpired, true);
  assert.equal(reached.daysRemaining, 0);
});

test('Complete Plan Access: SCHOOL_ADMIN and SUPER_ADMIN bypass plan lock; BURSAR on CORE blocked', async () => {
  const { requireCompletePlan } = await import('../server/middleware/auth.ts');

  const runMiddleware = (role: string, plan: string) => {
    let nextCalled = false;
    let statusCode = 200;
    const req = {
      authUser: { role },
      subscriptionDoc: { plan },
    } as any;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    } as any;
    requireCompletePlan(req, res, () => {
      nextCalled = true;
    });
    return { nextCalled, statusCode };
  };

  assert.equal(runMiddleware('SUPER_ADMIN', 'CORE').nextCalled, true);
  assert.equal(runMiddleware('SCHOOL_ADMIN', 'CORE').nextCalled, true);
  assert.equal(runMiddleware('BURSAR', 'COMPLETE').nextCalled, true);

  const blocked = runMiddleware('BURSAR', 'CORE');
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.statusCode, 403);
});

test('Public Portal hides Super Admin links and School Dashboard customization resolves themes & defaults', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const publicLayoutSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/PublicLayout.tsx'),
    'utf8'
  );
  assert.equal(publicLayoutSrc.includes('/nexaflow-admin'), false);
  assert.equal(/super admin/i.test(publicLayoutSrc), false);

  const registerLoginSrc = fs.readFileSync(
    path.resolve(process.cwd(), 'src/pages/RegisterAndLoginPages.tsx'),
    'utf8'
  );
  // Public LoginPage must not render a link to /nexaflow-admin or expose ADMIN_EMAIL/ADMIN_PASSWORD notices
  const loginPart = registerLoginSrc.slice(0, registerLoginSrc.indexOf('SuperAdminPortalLoginPage'));
  assert.equal(loginPart.includes("onNavigate('/nexaflow-admin')"), false);
  assert.equal(loginPart.includes('ADMIN_EMAIL'), false);
  assert.equal(loginPart.includes('ADMIN_PASSWORD'), false);
  assert.equal(loginPart.includes('School Admin credential secrets'), false);

  const {
    DEFAULT_DASHBOARD_SETTINGS,
    resolveDashboardSettings,
    resolveDashboardTheme,
  } = await import('../src/lib/dashboardTheme.ts');

  const defaults = resolveDashboardSettings(null);
  assert.deepEqual(defaults, DEFAULT_DASHBOARD_SETTINGS);

  const custom = resolveDashboardSettings({
    customTitle: '  Welcome to Kumasi Academy  ',
    primaryColor: '#0F3D2E',
    accentColor: '#B45309',
    defaultLandingTab: 'academics',
    showOnboardingChecklist: false,
  });
  assert.equal(custom.customTitle, 'Welcome to Kumasi Academy');
  assert.equal(custom.defaultLandingTab, 'academics');
  assert.equal(custom.showOnboardingChecklist, false);
  assert.equal(custom.showMetricsCards, true);

  const theme = resolveDashboardTheme(custom.primaryColor, custom.accentColor);
  assert.equal(theme.id, 'forest-gold');
  assert.equal(theme.sidebarBgClass, 'bg-[#0F3D2E]');

  const { SystemConfigModel } = await import('../server/models/index.ts');
  assert.equal(SystemConfigModel.schema.path('trialDays').options.default, 7);
});

test('Vercel Serverless Handler: rewrites __nexasua_path and serves /api/health JSON cleanly', async () => {
  const { normalizeVercelApiUrl, default: vercelHandler } = await import('../api/index.ts');

  assert.equal(normalizeVercelApiUrl('/api/health'), '/api/health');
  assert.equal(
    normalizeVercelApiUrl('/api/index?__nexasua_path=auth/login'),
    '/api/auth/login'
  );
  assert.equal(
    normalizeVercelApiUrl('/api/index?__nexasua_path=auth/google/callback&code=abc&state=xyz'),
    '/api/auth/google/callback?code=abc&state=xyz'
  );

  // Exercise the actual Express serverless handler with a real socket-less HTTP request/response
  const { EventEmitter } = await import('node:events');
  await new Promise<void>((resolve, reject) => {
    const req: any = new EventEmitter();
    req.url = '/api/index?__nexasua_path=health';
    req.method = 'GET';
    req.headers = { host: 'example.vercel.app' };
    req.connection = {};
    req.socket = {};

    const headers: Record<string, string | string[]> = {};
    let bodyText = '';
    const res: any = new EventEmitter();
    res.statusCode = 200;
    res.setHeader = (k: string, v: string | string[]) => {
      headers[k.toLowerCase()] = v;
    };
    res.getHeader = (k: string) => headers[k.toLowerCase()];
    res.removeHeader = (k: string) => {
      delete headers[k.toLowerCase()];
    };
    res.writeHead = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.write = (chunk: Buffer | string) => {
      bodyText += chunk.toString();
      return true;
    };
    res.end = (chunk?: Buffer | string) => {
      if (chunk) bodyText += chunk.toString();
      try {
        assert.equal(res.statusCode, 200);
        const parsed = JSON.parse(bodyText);
        assert.equal(parsed.ok, true);
        assert.ok(parsed.pricing);
        resolve();
      } catch (err) {
        reject(err);
      }
      return res;
    };

    vercelHandler(req, res);
  });
});

test('Session Secret: SESSION_SECRET takes precedence, falls back to JWT_SECRET, and derives encryption key', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const {
    decryptSecret,
    encryptSecret,
    getEncryptionKey,
    getJwtSecret,
    getSessionSecret,
    isSessionSecretConfigured,
  } = await import('../server/config/env.ts');

  const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
  assert.match(envExample, /^SESSION_SECRET=/m);

  const prevSessionSecret = process.env.SESSION_SECRET;
  const prevJwtSecret = process.env.JWT_SECRET;

  try {
    process.env.SESSION_SECRET = 'nexasua_session_secret_0123456789abcdef';
    process.env.JWT_SECRET = 'legacy_jwt_secret_0123456789abcdef';

    assert.equal(isSessionSecretConfigured(), true);
    assert.equal(getSessionSecret(), 'nexasua_session_secret_0123456789abcdef');
    assert.equal(getJwtSecret(), 'nexasua_session_secret_0123456789abcdef');
    assert.equal(getEncryptionKey().length, 32);

    const encrypted = encryptSecret('top-secret-totp-value');
    assert.equal(decryptSecret(encrypted), 'top-secret-totp-value');

    // Backwards-compatible fallback to JWT_SECRET when SESSION_SECRET is unset
    delete process.env.SESSION_SECRET;
    assert.equal(isSessionSecretConfigured(), true);
    assert.equal(getSessionSecret(), 'legacy_jwt_secret_0123456789abcdef');

    // Short (<16 char) secrets fall back to ephemeral runtime key
    process.env.SESSION_SECRET = 'too-short';
    process.env.JWT_SECRET = 'short';
    assert.equal(isSessionSecretConfigured(), false);
    assert.notEqual(getSessionSecret(), 'too-short');
  } finally {
    if (prevSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = prevSessionSecret;
    }
    if (prevJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = prevJwtSecret;
    }
  }
});

test('Coupons & Pricing: percent, fixed GH₵, 100% free, school assignment, plan & expiry enforcement', async () => {
  const { validateCouponForSchool } = await import('../server/services/pricingEngine.ts');
  const { FeeCouponModel } = await import('../server/models/index.ts');
  const now = new Date('2026-11-26T12:00:00.000Z');

  assert.ok(FeeCouponModel);

  const coupons = [
    {
      code: 'GIFT100',
      description: '100% free term grant',
      discountType: 'PERCENT',
      discountPercent: 100,
      applicablePlan: 'COMPLETE',
      assignedSchoolId: 'school-a',
      maxUses: 1,
      usedCount: 0,
      active: true,
      expiresAt: '2026-12-31T23:59:59.000Z',
    },
    {
      code: 'GH200OFF',
      description: 'GH₵ 200 voucher',
      discountType: 'FIXED_GHS',
      discountAmountGhs: 200,
      applicablePlan: 'ALL',
      assignedSchoolId: null,
      maxUses: null,
      usedCount: 2,
      active: true,
      expiresAt: null,
    },
    {
      code: 'EXPIRED50',
      discountType: 'PERCENT',
      discountPercent: 50,
      applicablePlan: 'ALL',
      active: true,
      expiresAt: '2026-11-01T00:00:00.000Z',
    },
    {
      code: 'MAXEDOUT',
      discountType: 'PERCENT',
      discountPercent: 25,
      applicablePlan: 'ALL',
      maxUses: 3,
      usedCount: 3,
      active: true,
    },
  ];

  // Valid assigned 100% coupon
  const ok100 = validateCouponForSchool({
    coupons,
    code: 'gift100',
    plan: 'COMPLETE',
    schoolId: 'school-a',
    now,
  });
  assert.equal(ok100.valid, true);
  if (ok100.valid) {
    const freeQuote = calculateSubscriptionPrice({
      studentCount: 200,
      plan: 'COMPLETE',
      billingCycle: 'TERM',
      promoDiscountPercent: ok100.promoDiscountPercent,
      promoFixedDiscountGhs: ok100.promoFixedDiscountGhs,
    });
    assert.equal(freeQuote.netPayableGhs, 0);
  }

  // Wrong school rejected
  const wrongSchool = validateCouponForSchool({
    coupons,
    code: 'GIFT100',
    plan: 'COMPLETE',
    schoolId: 'school-b',
    now,
  });
  assert.equal(wrongSchool.valid, false);

  // Plan mismatch rejected
  const wrongPlan = validateCouponForSchool({
    coupons,
    code: 'GIFT100',
    plan: 'CORE',
    schoolId: 'school-a',
    now,
  });
  assert.equal(wrongPlan.valid, false);

  // Fixed GH₵ voucher
  const fixedRes = validateCouponForSchool({
    coupons,
    code: 'GH200OFF',
    plan: 'CORE',
    schoolId: 'school-b',
    now,
  });
  assert.equal(fixedRes.valid, true);
  if (fixedRes.valid) {
    const quote = calculateSubscriptionPrice({
      studentCount: 120,
      plan: 'CORE',
      billingCycle: 'TERM',
      promoDiscountPercent: fixedRes.promoDiscountPercent,
      promoFixedDiscountGhs: fixedRes.promoFixedDiscountGhs,
    });
    // Core 1-150 = 350 - 200 = 150
    assert.equal(quote.netPayableGhs, 150);
  }

  // Expired and maxed-out coupons rejected
  assert.equal(
    validateCouponForSchool({ coupons, code: 'EXPIRED50', plan: 'CORE', schoolId: 'school-a', now })
      .valid,
    false
  );
  assert.equal(
    validateCouponForSchool({ coupons, code: 'MAXEDOUT', plan: 'CORE', schoolId: 'school-a', now })
      .valid,
    false
  );
});

test('PWA Setup & Top Header Install Button across Public, School, and Super Admin views', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  const requiredAssets = [
    'public/pwa-192x192.png',
    'public/pwa-512x512.png',
    'public/pwa-maskable-512x512.png',
    'public/apple-touch-icon.png',
    'public/icon.svg',
  ];
  for (const rel of requiredAssets) {
    const full = path.resolve(process.cwd(), rel);
    assert.equal(fs.existsSync(full), true, `Missing PWA asset: ${rel}`);
    assert.ok(fs.statSync(full).size > 200, `PWA asset empty: ${rel}`);
  }

  const topLayouts = [
    'src/components/PublicLayout.tsx',
    'src/pages/SchoolWorkspace.tsx',
    'src/pages/SuperAdminDashboard.tsx',
  ];
  for (const rel of topLayouts) {
    const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    assert.match(src, /<PWAInstallButton\b/, `${rel} must mount PWAInstallButton in top header`);
  }

  const indexHtml = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf8');
  assert.match(indexHtml, /apple-touch-icon/);
  assert.match(indexHtml, /viewport-fit=cover/);
});


