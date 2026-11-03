import { Router } from 'express';
import {
  authenticate,
  requireCompleteProfile,
} from '../../middleware/authenticate.js';
import {
  cancelMatchHandler,
  createMatchHandler,
  getMatchHandler,
  searchMatchesHandler,
} from './matches.controller.js';

export const matchesRouter = Router();

matchesRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * GET /api/matches
 * Auth: Bearer + perfil completo (RF-02)
 * Query opcional: locality, date (YYYY-MM-DD, hora Bogotá), positionId,
 * page, pageSize, latitude, longitude.
 * 200: { matches, page, pageSize, total, totalPages }
 */
matchesRouter.get(
  '/',
  authenticate,
  requireCompleteProfile,
  searchMatchesHandler,
);

/**
 * POST /api/matches
 * Auth: Bearer + perfil completo (RF-02)
 * Body: { matchDate (ISO con zona), locality, modality?, description?,
 *         positions: [{ positionId, slots }], latitude?, longitude? }
 * 201: { match } | 400 VALIDATION_ERROR | MATCH_DATE_IN_PAST
 */
matchesRouter.post(
  '/',
  authenticate,
  requireCompleteProfile,
  createMatchHandler,
);

/**
 * GET /api/matches/:id
 * Auth: Bearer + perfil completo (RF-02)
 * 200: { match } | 400 | 404 MATCH_NOT_FOUND
 */
matchesRouter.get(
  '/:id',
  authenticate,
  requireCompleteProfile,
  getMatchHandler,
);

/**
 * PATCH /api/matches/:id/cancel
 * Auth: Bearer + perfil completo; solo el organizador (RF-04, RF-07).
 * 200: { match } | 403 FORBIDDEN | 404 MATCH_NOT_FOUND
 *      | 409 MATCH_ALREADY_CANCELLED
 */
matchesRouter.patch(
  '/:id/cancel',
  authenticate,
  requireCompleteProfile,
  cancelMatchHandler,
);
