import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApiApp } from './server/app.js';
import { connectDatabase } from './server/db.js';
import { startAutomationEngine } from './server/services/automationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function startServer() {
  const app = createApiApp();
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    let viteMiddleware: express.RequestHandler | null = null;
    const viteReadyPromise = import('vite')
      .then(({ createServer: createViteServer }) =>
        createViteServer({
          server: { middlewareMode: true },
          appType: 'spa',
        })
      )
      .then((vite) => {
        viteMiddleware = vite.middlewares;
      })
      .catch((err) => {
        console.error('Failed to initialize Vite dev middleware:', err);
      });

    app.use(async (req, res, next) => {
      await viteReadyPromise;
      if (viteMiddleware) {
        viteMiddleware(req, res, next);
        return;
      }
      next();
    });
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

  // Connect MongoDB Atlas & start background automation without blocking port binding
  void connectDatabase();
  startAutomationEngine();
}

startServer();
