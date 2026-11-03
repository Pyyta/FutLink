import { Router } from 'express';
import {
  authenticate,
  requireCompleteProfile,
} from '../../middleware/authenticate.js';
import {
  listNotificationsHandler,
  markNotificationReadHandler,
} from './notifications.controller.js';

export const notificationsRouter = Router();

notificationsRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * GET /api/notifications
 * Auth: Bearer + perfil completo (RF-08, RNF-02)
 * Query: status=unread|all (default unread), page, pageSize (1–50).
 * 200: { notifications, unreadCount, page, pageSize, total, totalPages }
 * El frontend consulta este endpoint al enfocar la app o navegar; no hay
 * WebSockets. Las notificaciones no leídas quedan pendientes entre sesiones.
 */
notificationsRouter.get(
  '/',
  authenticate,
  requireCompleteProfile,
  listNotificationsHandler,
);

/**
 * PATCH /api/notifications/:id/read
 * Auth: Bearer; solo el destinatario.
 * 200: { notification, unreadCount } (idempotente)
 * 404: NOTIFICATION_NOT_FOUND (también si pertenece a otra cuenta)
 */
notificationsRouter.patch(
  '/:id/read',
  authenticate,
  requireCompleteProfile,
  markNotificationReadHandler,
);
