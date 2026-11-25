import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { getJwtSecret } from '../config/env.js';
import { AuditLogModel } from '../models/index.js';
import type { UserRole } from '../models/index.js';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export interface SessionJwtPayload {
  userId: string;
  role: UserRole;
  schoolId: string | null;
  mfaVerified: boolean;
}

export function signSessionToken(payload: SessionJwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '12h' });
}

export function verifySessionToken(token: string): SessionJwtPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionJwtPayload;
  } catch {
    return null;
  }
}

// RFC 6238 Base32 + TOTP implementation using Node built-in crypto
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, counterOffset = 0): string {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30) + counterOffset;
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotpCode(secret: string, token: string): boolean {
  const clean = token.trim();
  if (!/^\d{6}$/.test(clean)) return false;
  for (const offset of [-1, 0, 1]) {
    const expected = generateTotpCode(secret, offset);
    if (crypto.timingSafeEqual(Buffer.from(clean), Buffer.from(expected))) {
      return true;
    }
  }
  return false;
}

export async function generateTotpQrDataUrl(email: string, secret: string): Promise<string> {
  const issuer = encodeURIComponent('NexaSua');
  const label = encodeURIComponent(`NexaSua:${email}`);
  const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
  return QRCode.toDataURL(otpauth);
}

export function signReportVerificationToken(reportRef: string, schoolId: string): string {
  const payload = `${reportRef}:${schoolId}`;
  const sig = crypto.createHmac('sha256', getJwtSecret()).update(payload).digest('hex').slice(0, 24);
  return `${reportRef}.${sig}`;
}

export async function writeAuditLog(params: {
  schoolId?: string | null;
  userId?: string | null;
  userEmail?: string;
  userRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await AuditLogModel.create({
      schoolId: params.schoolId || null,
      userId: params.userId || null,
      userEmail: params.userEmail || '',
      userRole: params.userRole || '',
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId || '',
      details: params.details || {},
      ipAddress: params.ipAddress || '',
    });
  } catch {
    // Audit write should not crash non-critical paths if DB is temporarily unavailable
  }
}
