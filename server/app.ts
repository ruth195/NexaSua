import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import { ensureDatabaseConnection } from './db.js';
import academicsRoutes from './routes/academicsRoutes.js';
import authRoutes from './routes/authRoutes.js';
import completeRoutes from './routes/completeRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import schoolCoreRoutes from './routes/schoolCoreRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { triggerAutomationIfDue } from './services/automationService.js';

dotenv.config();

export function createApiApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  // Baseline security headers compatible with iframe embedding
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  // Raw body required strictly on Paystack webhook for HMAC-SHA512 verification
  app.use(
    '/api/webhooks/paystack',
    express.raw({ type: 'application/json', limit: '1mb' })
  );

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  // Ensure MongoDB connection on every API invocation (handles Vercel cold starts & reconnects)
  app.use('/api', async (_req, _res, next) => {
    await ensureDatabaseConnection();
    if (process.env.VERCEL) {
      triggerAutomationIfDue();
    }
    next();
  });

  // API Routes
  app.use('/api/public', publicRoutes);
  app.get('/api/health', (req, res, next) => {
    req.url = '/health';
    publicRoutes(req, res, next);
  });
  app.use('/api/auth', authRoutes);
  app.use('/api/super-admin', superAdminRoutes);
  app.use('/api/school', schoolCoreRoutes);
  app.use('/api/academics', academicsRoutes);
  app.use('/api/complete', completeRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // JSON 404 for unknown API paths
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Centralized safe JSON error handler (never exposes stack traces or secrets)
  app.use(
    (
      err: unknown,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (!req.path.startsWith('/api')) {
        next(err);
        return;
      }
      const message = err instanceof Error ? err.message : 'Unexpected server error';
      res.status(500).json({ error: message });
    }
  );

  return app;
}
