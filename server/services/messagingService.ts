import nodemailer from 'nodemailer';

export interface DeliveryResult {
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED';
  error?: string;
}

export async function sendTransactionalEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<DeliveryResult> {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT || '587');
  const from = process.env.SMTP_FROM?.trim() || user || 'no-reply@nexasua.com';

  if (!host || !user || !pass) {
    return { status: 'NOT_CONFIGURED', error: 'SMTP credentials are not configured.' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporter.sendMail({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    return { status: 'SENT' };
  } catch (err) {
    return {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'SMTP delivery failed',
    };
  }
}

export async function sendSmsMessage(params: {
  toPhone: string;
  message: string;
}): Promise<DeliveryResult> {
  const url = process.env.SMS_PROVIDER_URL?.trim();
  const apiKey = process.env.SMS_API_KEY?.trim();
  const sender = process.env.SMS_SENDER_ID?.trim() || 'NexaSua';

  if (!url || !apiKey) {
    return { status: 'NOT_CONFIGURED', error: 'SMS gateway is not configured.' };
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'api-key': apiKey,
      },
      body: JSON.stringify({
        sender,
        recipients: [params.toPhone],
        message: params.message,
      }),
    });

    if (!res.ok) {
      return { status: 'FAILED', error: `SMS provider responded with ${res.status}` };
    }
    return { status: 'SENT' };
  } catch (err) {
    return {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'SMS dispatch error',
    };
  }
}
