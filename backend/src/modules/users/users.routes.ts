import { Router } from 'express';
import {
  authenticate,
  requireCompleteProfile,
} from '../../middleware/authenticate.js';
import {
  getMeHandler,
  getPublicProfileHandler,
  rateUserHandler,
  searchPlayersHandler,
  updateMyProfileHandler,
} from './users.controller.js';

export const usersRouter = Router();

usersRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * GET /api/me
 * Auth: Bearer
 * 200: { user } | 401: AUTH_REQUIRED | ACCOUNT_INACTIVE
 */
usersRouter.get('/', authenticate, getMeHandler);

/**
 * PUT /api/me/profile
 * Auth: Bearer
 * Body: { name, phone, locality, positionIds }
 * 200: { user } | 400: VALIDATION_ERROR | 409: PHONE_IN_USE
 */
usersRouter.put('/profile', authenticate, updateMyProfileHandler);

export const profilesRouter = Router();

profilesRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * GET /api/users
 * Auth: Bearer + perfil completo (RF-02)
 * Query: name?, locality?, positionId?, page=1, pageSize=10 (máx. 50)
 * 200: { players, page, pageSize, total, totalPages }
 * 400: VALIDATION_ERROR | 401: AUTH_REQUIRED | 403: PROFILE_INCOMPLETE
 * RF-05: resultados sin teléfono ni correo, con posiciones y promedio.
 */
profilesRouter.get(
  '/',
  authenticate,
  requireCompleteProfile,
  searchPlayersHandler,
);

/**
 * GET /api/users/:id
 * Auth: Bearer + perfil completo (RF-02)
 * 200: { profile } | 401 | 403 PROFILE_INCOMPLETE | 404 USER_NOT_FOUND
 * El teléfono solo se incluye si es el propio perfil o existe una solicitud
 * aceptada entre ambos usuarios (RF-09).
 */
profilesRouter.get(
  '/:id',
  authenticate,
  requireCompleteProfile,
  getPublicProfileHandler,
);

/**
 * PUT /api/users/:id/rating
 * Auth: Bearer + perfil completo (RF-02)
 * Body: { score: 1..5, comment?: string (máx. 240) }
 * 200: { rating, summary } — crea o actualiza la calificación del visitante.
 * 400: VALIDATION_ERROR | 401 | 403 PROFILE_INCOMPLETE |
 *      403 SELF_RATING_NOT_ALLOWED |
 *      403 RATING_REQUIRES_ACCEPTED_REQUEST (si la configuración lo exige) |
 *      404 USER_NOT_FOUND
 * RF-10: una calificación por par, sin autocalificación; el promedio se
 * devuelve recalculado en la misma operación.
 */
profilesRouter.put(
  '/:id/rating',
  authenticate,
  requireCompleteProfile,
  rateUserHandler,
);
