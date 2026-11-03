import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors.js';
import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from './notifications.schemas.js';
import {
  listNotifications,
  markNotificationRead,
} from './notifications.service.js';

function currentUserId(req: Request): number {
  const user = req.sessionUser;
  if (!user) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
  }
  return user.id;
}

export const listNotificationsHandler: RequestHandler = async (req, res) => {
  const query = listNotificationsQuerySchema.parse(req.query);

  const result = await listNotifications(currentUserId(req), {
    status: query.status,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.status(200).json({
    notifications: result.items,
    unreadCount: result.unreadCount,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
};

export const markNotificationReadHandler: RequestHandler = async (req, res) => {
  const { id } = notificationIdParamSchema.parse(req.params);
  const result = await markNotificationRead(currentUserId(req), id);
  res.status(200).json(result);
};
