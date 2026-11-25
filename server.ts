import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase } from './server/db.js';
import academicsRoutes from './server/routes/academicsRoutes.js';
import authRoutes from './server/routes/authRoutes.js';
import completeRoutes from './server/routes/completeRoutes.js';
import publicRoutes from './server/routes/publicRoutes.js';
import schoolCoreRoutes from './server/routes/schoolCoreRoutes.js';
import superAdminRoutes from './server/routes/superAdminRoutes.js';
import webhookRoutes from './server/routes/webhookRoutes.js';
import { startAutomationEngine } from './server/services/automationService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createServer() {
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

  // Connect MongoDB Atlas (gracefully reports Not Configured if MONGODB_URI is absent)
  await connectDatabase();
  startAutomationEngine();

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

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NexaSua platform server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start NexaSua server:', err);
  process.exit(1);
});
