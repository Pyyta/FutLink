import type { Express } from 'express';
import request from 'supertest';
import { bearer } from './auth.js';

export function listNotifications(
  app: Express,
  accessToken: string,
  query = '',
): request.Test {
  return request(app)
    .get(`/api/notifications${query}`)
    .set(bearer(accessToken));
}

export function markNotificationRead(
  app: Express,
  accessToken: string,
  notificationId: number | string,
): request.Test {
  return request(app)
    .patch(`/api/notifications/${notificationId}/read`)
    .set(bearer(accessToken));
}
