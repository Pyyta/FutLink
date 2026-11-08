import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { matchesRouter } from './modules/matches/matches.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { requestsRouter } from './modules/requests/requests.routes.js';
import { usersRouter, profilesRouter } from './modules/users/users.routes.js';

const webRoot = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // La PWA puede servirse por HTTP en la red local o por HTTPS con túnel.
          'upgrade-insecure-requests': null,
          // La pantalla "Servidor" permite apuntar la app a otra API.
          'connect-src': ["'self'", 'http:', 'https:'],
          'img-src': ["'self'", 'data:', 'http:', 'https:'],
        },
      },
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: env.BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: env.BODY_LIMIT }));
  app.use(pinoHttp({ logger, autoLogging: env.NODE_ENV !== 'test' }));

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/me', usersRouter);
  app.use('/api/users', profilesRouter);
  app.use('/api/matches', matchesRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/notifications', notificationsRouter);

  if (env.SERVE_WEB && env.NODE_ENV !== 'test') {
    mountWeb(app);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

function mountWeb(app: express.Express): void {
  const indexFile = path.join(webRoot, 'index.html');

  if (!fs.existsSync(indexFile)) {
    logger.warn(
      { webRoot },
      'SERVE_WEB está activo pero no existe frontend/dist; ejecuta npm run build:web',
    );
    return;
  }

  app.use(
    express.static(webRoot, {
      index: false,
      setHeaders(res, filePath) {
        const normalized = filePath.split(path.sep).join('/');

        if (
          normalized.endsWith('/index.html') ||
          normalized.endsWith('/sw.js') ||
          normalized.endsWith('/manifest.webmanifest')
        ) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (normalized.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // Fallback de la SPA: cualquier ruta que no sea la API devuelve index.html.
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    if (req.path === '/api' || req.path.startsWith('/api/')) {
      next();
      return;
    }

    if (!req.accepts('html')) {
      next();
      return;
    }

    res.sendFile(indexFile);
  });

  logger.info({ webRoot }, 'PWA compilada servida por el backend');
}
