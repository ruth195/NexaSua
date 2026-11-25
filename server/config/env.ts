import crypto from 'crypto';

const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');
const EPHEMERAL_ENCRYPTION_KEY = crypto.randomBytes(32);

export function getJwtSecret(): string {
  return process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16
    ? process.env.JWT_SECRET.trim()
    : EPHEMERAL_JWT_SECRET;
}

export function getEncryptionKey(): Buffer {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return crypto.createHash('sha256').update(process.env.JWT_SECRET.trim()).digest();
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

  return {
    mongodb: {
      name: 'MongoDB Atlas',
      status: dbState.status,
      detail: dbState.error || (dbState.status === 'Connected' ? 'Cluster connected' : 'Set MONGODB_URI in Secrets'),
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
