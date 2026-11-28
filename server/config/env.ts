import crypto from 'crypto';

const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_ENCRYPTION_KEY = crypto.randomBytes(32);

function resolveConfiguredSessionSecret(): string {
  const sessionSecret = process.env.SESSION_SECRET?.trim() || '';
  if (sessionSecret.length >= 16) {
    return sessionSecret;
  }
  const jwtSecret = process.env.JWT_SECRET?.trim() || '';
  if (jwtSecret.length >= 16) {
    return jwtSecret;
  }
  return '';
}

export function isSessionSecretConfigured(): boolean {
  return resolveConfiguredSessionSecret().length >= 16;
}

export function getSessionSecret(): string {
  return resolveConfiguredSessionSecret() || EPHEMERAL_SESSION_SECRET;
}

export const getJwtSecret = getSessionSecret;

export function getEncryptionKey(): Buffer {
  const configured = resolveConfiguredSessionSecret();
  if (configured) {
    return crypto.createHash('sha256').update(configured).digest();
  }
  return EPHEMERAL_ENCRYPTION_KEY;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function getSuperAdminEnvCredentials(): {
  email: string;
  password: string;
  configured: boolean;
} {
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() || '';
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  return {
    email,
    password,
    configured: Boolean(email && email.includes('@') && password.length > 0),
  };
}

export function getSuperAdminGoogleEmails(): string[] {
  const rawList = [
    process.env.SUPER_ADMIN_GOOGLE_EMAIL || '',
    process.env.SUPER_ADMIN_EMAIL || '',
  ]
    .join(',')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.includes('@'));

  return Array.from(new Set(rawList));
}

export function matchSuperAdminGoogleAccount(params: {
  verifiedEmail: string;
  googleSub?: string;
  envGoogleEmails?: string[];
  superAdminUsers?: Array<{
    _id: unknown;
    email?: string;
    linkedGoogleEmail?: string;
    googleId?: string;
    status?: string;
  }>;
}): {
  authorized: boolean;
  matchedUserId: string | null;
  reason: 'DB_EMAIL' | 'DB_LINKED_GOOGLE_EMAIL' | 'DB_GOOGLE_ID' | 'ENV_GOOGLE_EMAIL' | 'NONE';
} {
  const email = params.verifiedEmail.trim().toLowerCase();
  const sub = (params.googleSub || '').trim();
  const users = params.superAdminUsers || [];

  for (const u of users) {
    if (u.status && u.status !== 'ACTIVE') continue;
    if ((u.linkedGoogleEmail || '').trim().toLowerCase() === email) {
      return { authorized: true, matchedUserId: String(u._id), reason: 'DB_LINKED_GOOGLE_EMAIL' };
    }
    if ((u.email || '').trim().toLowerCase() === email) {
      return { authorized: true, matchedUserId: String(u._id), reason: 'DB_EMAIL' };
    }
    if (sub && u.googleId && u.googleId === sub) {
      return { authorized: true, matchedUserId: String(u._id), reason: 'DB_GOOGLE_ID' };
    }
  }

  const allowedEnvEmails = params.envGoogleEmails ?? getSuperAdminGoogleEmails();
  if (email && allowedEnvEmails.includes(email)) {
    const activeFallback = users.find((u) => !u.status || u.status === 'ACTIVE');
    return {
      authorized: true,
      matchedUserId: activeFallback ? String(activeFallback._id) : null,
      reason: 'ENV_GOOGLE_EMAIL',
    };
  }

  return { authorized: false, matchedUserId: null, reason: 'NONE' };
}

export function getSchoolAdminEnvCredentials(): {
  email: string;
  password: string;
  configured: boolean;
} {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
  const password = process.env.ADMIN_PASSWORD || '';
  return {
    email,
    password,
    configured: Boolean(email && email.includes('@') && password.length > 0),
  };
}

export function verifyEnvSecretMatch(input: string, secret: string): boolean {
  if (!secret || !input) return false;
  const a = crypto.createHash('sha256').update(input, 'utf8').digest();
  const b = crypto.createHash('sha256').update(secret, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

export type IntegrationStatus = 'Not Configured' | 'Testing' | 'Connected' | 'Error';

export function getPlatformIntegrationsStatus(dbState: {
  status: IntegrationStatus;
  error?: string;
}) {
  const paystackSecret = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
  const paystackPublic = process.env.PAYSTACK_PUBLIC_KEY?.trim() || '';
  const paystackStatus: IntegrationStatus =
    paystackSecret && paystackPublic
      ? paystackSecret.startsWith('sk_test_')
        ? 'Testing'
        : 'Connected'
      : 'Not Configured';

  const smtpConfigured = Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );

  const smsConfigured = Boolean(
    process.env.SMS_PROVIDER_URL?.trim() && process.env.SMS_API_KEY?.trim()
  );

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const googleOAuthConfigured = isGoogleOAuthConfigured();
  const superAdminSecretsConfigured = getSuperAdminEnvCredentials().configured;
  const adminSecretsConfigured = getSchoolAdminEnvCredentials().configured;
  const sessionSecretConfigured = isSessionSecretConfigured();

  return {
    mongodb: {
      name: 'MongoDB Atlas',
      status: dbState.status,
      detail: dbState.error || (dbState.status === 'Connected' ? 'Cluster connected' : 'Set MONGODB_URI in Secrets'),
    },
    sessionSecret: {
      name: 'Session Signing Secret',
      status: sessionSecretConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: sessionSecretConfigured
        ? 'Configured via SESSION_SECRET'
        : 'Recommended: Set SESSION_SECRET (32+ chars) in Secrets',
    },
    superAdminSecrets: {
      name: 'Super Admin Credentials Secret',
      status: superAdminSecretsConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: superAdminSecretsConfigured
        ? `Managed via SUPER_ADMIN_EMAIL (${getSuperAdminEnvCredentials().email})`
        : 'Optional: Set SUPER_ADMIN_EMAIL & SUPER_ADMIN_PASSWORD in Secrets',
    },
    adminSecrets: {
      name: 'School Admin Credentials Secret',
      status: adminSecretsConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: adminSecretsConfigured
        ? `Managed via ADMIN_EMAIL (${getSchoolAdminEnvCredentials().email})`
        : 'Optional: Set ADMIN_EMAIL & ADMIN_PASSWORD in Secrets',
    },
    googleOAuth: {
      name: 'Google Sign-In (Schools)',
      status: googleOAuthConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: googleOAuthConfigured
        ? 'Google OAuth 2.0 active for school logins'
        : 'Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET in Secrets',
    },
    paystack: {
      name: 'Paystack (Platform Billing)',
      status: paystackStatus,
      detail:
        paystackStatus === 'Testing'
          ? 'Test mode keys active'
          : paystackStatus === 'Connected'
          ? 'Live mode keys active'
          : 'Set PAYSTACK_SECRET_KEY & PAYSTACK_PUBLIC_KEY',
    },
    email: {
      name: 'Transactional Email (SMTP)',
      status: smtpConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: smtpConfigured ? `Host: ${process.env.SMTP_HOST}` : 'Set SMTP_HOST, SMTP_USER, SMTP_PASS',
    },
    sms: {
      name: 'SMS Gateway (Ghana)',
      status: smsConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: smsConfigured ? `Sender: ${process.env.SMS_SENDER_ID || 'NexaSua'}` : 'Set SMS_PROVIDER_URL & SMS_API_KEY',
    },
    gemini: {
      name: 'Gemini AI (Optional Drafts)',
      status: geminiConfigured ? ('Connected' as IntegrationStatus) : ('Not Configured' as IntegrationStatus),
      detail: geminiConfigured ? 'Optional draft & summary tools ready' : 'Optional: Set GEMINI_API_KEY',
    },
  };
}
