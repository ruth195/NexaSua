import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../server/app.js';

const app = createApiApp();

export function normalizeVercelApiUrl(rawUrl?: string): string {
  const input = rawUrl || '/api/health';
  const parsed = new URL(input, 'http://localhost');
  const rewrittenPath = parsed.searchParams.get('__nexasua_path');

  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__nexasua_path');
    const cleanSegment = rewrittenPath.replace(/^\/+/, '');
    const qs = parsed.searchParams.toString();
    return `/api/${cleanSegment}${qs ? `?${qs}` : ''}`;
  }

  return `${parsed.pathname}${parsed.search}`;
}

export default function handler(
  req: IncomingMessage & { url?: string; body?: unknown; _body?: boolean; readableEnded?: boolean },
  res: ServerResponse
) {
  req.url = normalizeVercelApiUrl(req.url);

  // Prevent Express body-parser from hanging if Vercel runtime already consumed and populated req.body
  if (req.body !== undefined && req.readableEnded && !req._body) {
    req._body = true;
  }

  return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
