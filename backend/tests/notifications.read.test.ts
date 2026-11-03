import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import {
  cleanupByPrefix,
  completeProfile,
  makeEmailFactory,
  registerUser,
} from './helpers/auth.js';
import type { TestSession } from './helpers/auth.js';
import {
  actOnRequest,
  createMatchWithVacancies,
  sendMatchRequest,
} from './helpers/requests.js';
import {
  listNotifications,
  markNotificationRead,
} from './helpers/notifications.js';

const app = createApp();
const nextEmail = makeEmailFactory('notifread');

afterAll(async () => {
  await cleanupByPrefix('notifread');
  await closePool();
});

async function newCompleteUser(name: string): Promise<TestSession> {
  const session = await registerUser(app, nextEmail());
  const profile = await completeProfile(app, session.accessToken, { name });

  if (profile.status !== 200) {
    throw new Error(`No se pudo completar el perfil: ${JSON.stringify(profile.body)}`);
  }

  return session;
}

interface SeededNotification {
  organizer: TestSession;
  player: TestSession;
  notificationId: number;
}

/**
 * Crea una notificación de cancelación para el organizador: el jugador envía
 * una solicitud a su partido y luego la cancela.
 */
async function seedNotification(): Promise<SeededNotification> {
  const organizer = await newCompleteUser('Organizador');
  const player = await newCompleteUser('Solicitante');
  const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
  const vacancy = match.vacancies[0];
  if (!vacancy) {
    throw new Error('El partido no tiene vacantes');
  }

  const created = await sendMatchRequest(app, player.accessToken, vacancy.id);
  expect(created.status).toBe(201);

  const cancelled = await actOnRequest(
    app,
    player.accessToken,
    created.body.request.id,
    'cancel',
  );
  expect(cancelled.status).toBe(200);

  const inbox = await listNotifications(app, organizer.accessToken);
  const notification = (
    inbox.body.notifications as { id: number }[]
  )[0];
  if (!notification) {
    throw new Error('No se generó la notificación');
  }

  return {
    organizer,
    player,
    notificationId: notification.id,
  };
}

describe('Marcar notificaciones como leídas (RF-08)', () => {
  it('marca como leída, baja el contador y la excluye de pendientes', async () => {
    const { organizer, notificationId } = await seedNotification();

    const marked = await markNotificationRead(
      app,
      organizer.accessToken,
      notificationId,
    );
    expect(marked.status).toBe(200);
    expect(marked.body.unreadCount).toBe(0);
    expect(marked.body.notification).toMatchObject({
      id: notificationId,
      type: 'request_cancelled',
      readAt: expect.any(String),
    });

    const unread = await listNotifications(app, organizer.accessToken);
    expect(unread.body).toMatchObject({
      notifications: [],
      unreadCount: 0,
      total: 0,
      totalPages: 0,
    });

    const all = await listNotifications(
      app,
      organizer.accessToken,
      '?status=all',
    );
    expect(all.body.total).toBe(1);
    expect(all.body.unreadCount).toBe(0);
    expect(all.body.notifications[0]).toMatchObject({
      id: notificationId,
      readAt: expect.any(String),
    });
  });

  it('es idempotente y conserva la fecha de lectura original', async () => {
    const { organizer, notificationId } = await seedNotification();

    const first = await markNotificationRead(
      app,
      organizer.accessToken,
      notificationId,
    );
    expect(first.status).toBe(200);
    const firstReadAt = first.body.notification.readAt as string;

    const second = await markNotificationRead(
      app,
      organizer.accessToken,
      notificationId,
    );
    expect(second.status).toBe(200);
    expect(second.body.unreadCount).toBe(0);
    expect(second.body.notification.readAt).toBe(firstReadAt);
  });

  it('no permite marcar una notificación de otra cuenta', async () => {
    const { organizer, notificationId } = await seedNotification();
    const stranger = await newCompleteUser('Ajeno');

    const forbidden = await markNotificationRead(
      app,
      stranger.accessToken,
      notificationId,
    );
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.error.code).toBe('NOTIFICATION_NOT_FOUND');

    const stored = await query<{ read_at: Date | null }>(
      'SELECT read_at FROM notifications WHERE id = $1',
      [notificationId],
    );
    expect(stored.rows[0]?.read_at).toBeNull();

    const inbox = await listNotifications(app, organizer.accessToken);
    expect(inbox.body.unreadCount).toBe(1);
  });

  it('responde 401, 403, 404 y 400 según corresponda', async () => {
    const { organizer } = await seedNotification();

    const anonymous = await request(app).patch(
      '/api/notifications/1/read',
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const incomplete = await registerUser(app, nextEmail());
    const gated = await request(app)
      .patch('/api/notifications/1/read')
      .set({ Authorization: `Bearer ${incomplete.accessToken}` });
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe('PROFILE_INCOMPLETE');

    const missing = await markNotificationRead(
      app,
      organizer.accessToken,
      999_999,
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOTIFICATION_NOT_FOUND');

    const invalid = await markNotificationRead(
      app,
      organizer.accessToken,
      'abc',
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
