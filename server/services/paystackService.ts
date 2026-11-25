import crypto from 'crypto';

export interface PaystackInitParams {
  secretKey: string;
  email: string;
  amountGhs: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  channels?: string[];
}

export interface PaystackInitResponse {
  ok: boolean;
  authorizationUrl?: string;
  accessCode?: string;
  reference?: string;
  error?: string;
}

export async function initializePaystackTransaction(
  params: PaystackInitParams
): Promise<PaystackInitResponse> {
  if (!params.secretKey || !params.secretKey.startsWith('sk_')) {
    return { ok: false, error: 'Online payment is not yet configured.' };
  }

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amountGhs * 100), // pesewas
        currency: 'GHS',
        reference: params.reference,
        callback_url: params.callbackUrl,
        channels: params.channels || ['card', 'mobile_money', 'bank_transfer'],
        metadata: params.metadata || {},
      }),
    });

    const data = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!response.ok || !data.status || !data.data) {
      return { ok: false, error: data.message || 'Paystack initialization failed.' };
    }

    return {
      ok: true,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unable to reach Paystack API.',
    };
  }
}

export interface PaystackVerifyResponse {
  ok: boolean;
  verified: boolean;
  amountGhs?: number;
  channel?: string;
  gatewayResponse?: string;
  paidAt?: string;
  raw?: unknown;
  error?: string;
}

export async function verifyPaystackTransaction(
  secretKey: string,
  reference: string
): Promise<PaystackVerifyResponse> {
  if (!secretKey || !secretKey.startsWith('sk_')) {
    return { ok: false, verified: false, error: 'Online payment is not yet configured.' };
  }

  try {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      }
    );

    const data = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status: string;
        amount: number;
        currency: string;
        channel: string;
        gateway_response: string;
        paid_at: string;
      };
    };

    if (!response.ok || !data.status || !data.data) {
      return { ok: false, verified: false, error: data.message || 'Verification failed.' };
    }

    const verified = data.data.status === 'success' && data.data.currency === 'GHS';
    return {
      ok: true,
      verified,
      amountGhs: data.data.amount / 100,
      channel: data.data.channel,
      gatewayResponse: data.data.gateway_response,
      paidAt: data.data.paid_at,
      raw: data.data,
    };
  } catch (err) {
    return {
      ok: false,
      verified: false,
      error: err instanceof Error ? err.message : 'Unable to reach Paystack API.',
    };
  }
}

export function verifyPaystackWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey) return false;
  const computed = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  if (computed.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
}
