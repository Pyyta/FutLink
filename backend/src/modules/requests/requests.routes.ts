import { Router } from 'express';
import {
  authenticate,
  requireCompleteProfile,
} from '../../middleware/authenticate.js';
import {
  acceptRequestHandler,
  cancelRequestHandler,
  createRequestHandler,
  listRequestsHandler,
  rejectRequestHandler,
} from './requests.controller.js';

export const requestsRouter = Router();

requestsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * POST /api/requests
 * Auth: Bearer + perfil completo (RF-02, RF-06)
 * Body: { type: 'match', vacancyId } | { type: 'player', targetUserId }
 * 201: { request }
 * 400: VALIDATION_ERROR
 * 403: FORBIDDEN (solicitud ajena) | 404: VACANCY_NOT_FOUND | USER_NOT_FOUND
 * 409: CANNOT_REQUEST_OWN_MATCH | CANNOT_REQUEST_SELF
 *      | REQUEST_ALREADY_EXISTS | VACANCY_OCCUPIED
 *      | MATCH_NOT_AVAILABLE | MATCH_ALREADY_STARTED
 *
 * El paso de confirmación es de la UI (Figma); la API solo crea la solicitud
 * cuando recibe el POST.
 */
requestsRouter.post(
  '/',
  authenticate,
  requireCompleteProfile,
  createRequestHandler,
);

/**
 * GET /api/requests
 * Auth: Bearer + perfil completo
 * Query: box=sent|received (default received), type=match|player,
 *        state=pending|accepted|rejected|cancelled, page, pageSize.
 * 200: { requests, page, pageSize, total, totalPages }
 * "Administrar solicitudes" usa type=match y type=player para sus dos listas.
 */
requestsRouter.get(
  '/',
  authenticate,
  requireCompleteProfile,
  listRequestsHandler,
);

/**
 * PATCH /api/requests/:id/accept
 * Auth: Bearer; solo el destinatario (RF-06).
 * Para solicitudes de partido ocupa la vacante en una transacción.
 * 200: { request } | 403 FORBIDDEN | 404 REQUEST_NOT_FOUND
 *      | 409 REQUEST_NOT_PENDING | VACANCY_OCCUPIED | MATCH_NOT_AVAILABLE
 */
requestsRouter.patch(
  '/:id/accept',
  authenticate,
  requireCompleteProfile,
  acceptRequestHandler,
);

/**
 * PATCH /api/requests/:id/reject
 * Auth: Bearer; solo el destinatario (RF-06).
 * 200: { request } | 403 FORBIDDEN | 404 REQUEST_NOT_FOUND
 *      | 409 REQUEST_NOT_PENDING
 */
requestsRouter.patch(
  '/:id/reject',
  authenticate,
  requireCompleteProfile,
  rejectRequestHandler,
);

/**
 * PATCH /api/requests/:id/cancel
 * Auth: Bearer; solo el emisor, en cualquier momento (RF-07).
 * Si estaba aceptada, libera la vacante y notifica al destinatario (Fase 8).
 * 200: { request } | 403 FORBIDDEN | 404 REQUEST_NOT_FOUND
 *      | 409 REQUEST_NOT_CANCELLABLE
 */
requestsRouter.patch(
  '/:id/cancel',
  authenticate,
  requireCompleteProfile,
  cancelRequestHandler,
);
