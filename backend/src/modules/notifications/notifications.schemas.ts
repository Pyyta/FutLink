import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  status: z.enum(['unread', 'all']).default('unread'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const notificationIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive('El identificador de la notificación no es válido'),
});
