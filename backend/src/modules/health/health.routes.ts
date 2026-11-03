import { Router } from 'express';
import { getHealth } from './health.controller.js';

export const healthRouter = Router();

/**
 * GET /api/health
 * Auth: pública
 * 200: { status, db, postgis, now, uptimeSeconds }
 * 503: { error: { code: 'DB_UNAVAILABLE' | 'POSTGIS_UNAVAILABLE', message } }
 */
healthRouter.get('/', getHealth);
