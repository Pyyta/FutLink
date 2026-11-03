import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/db.js';
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
import type { TestMatch } from './helpers/requests.js';
import {
  listNotifications,
  markNotificationRead,
} from './helpers/notifications.js';

const app = createApp();
const nextEmail = makeEmailFactory('notiflist');

afterAll(async () => {
  await cleanupByPrefix('notiflist');
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

interface Seed {
  organizer: TestSession;
  match: TestMatch;
  players: TestSession[];
}

/**
 * Genera una notificación de cancelación por cada vacante: cada jugador envía
 * una solicitud al partido del organizador y luego la cancela.
 */
async function seedCancellations(count: number): Promise<Seed> {
  const organizer = await newCompleteUser('Organizador');
  const match = await createMatchWithVacancies(app, organizer.accessToken, count);
  const players: TestSession[] = [];

  for (const [index, vacancy] of match.vacancies.entries()) {
    const player = await newCompleteUser(`Jugador ${index + 1}`);
    const created = await sendMatchRequest(
      app,
      player.accessToken,
      vacancy.id,
    );
    expect(created.status).toBe(201);

    const cancelled = await actOnRequest(
      app,
      player.accessToken,
      created.body.request.id,
      'cancel',
    );
    expect(cancelled.status).toBe(200);

    players.push(player);
  }

  return { organizer, match, players };
}

interface NotificationItem {
  id: number;
  type: string;
  readAt: string | null;
  createdAt: string;
  actor: { id: number; name: string | null; profilePic: string | null } | null;
  request: { id: number; type: string } | null;
  match: { id: number; matchDate: string; locality: string } | null;
  content: { type: 'match' | 'comment'; id: number } | null;
}

describe('Listado de notificaciones (RF-08, RNF-02)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app).get('/api/notifications');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const incomplete = await registerUser(app, nextEmail());
    const gated = await listNotifications(app, incomplete.accessToken);
    expect(gated.status).toBe(403);
    expect(gated.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('lista por defecto solo las no leídas, de la más reciente a la más antigua', async () => {
    const { organizer, match, players } = await seedCancellations(3);

    const response = await listNotifications(app, organizer.accessToken);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      unreadCount: 3,
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });

    const notifications = response.body.notifications as NotificationItem[];
    expect(notifications).toHaveLength(3);
    expect(notifications.map((item) => item.type)).toEqual([
      'request_cancelled',
      'request_cancelled',
      'request_cancelled',
    ]);
    expect(notifications.every((item) => item.readAt === null)).toBe(true);
    expect(notifications.map((item) => item.id)).toEqual(
      [...notifications.map((item) => item.id)].sort((a, b) => b - a),
    );

    const actors = new Set(notifications.map((item) => item.actor?.id));
    expect(actors).toEqual(new Set(players.map((player) => player.userId)));

    for (const notification of notifications) {
      expect(notification.request).toMatchObject({
        type: 'match',
      });
      expect(notification.match).toMatchObject({
        id: match.matchId,
        locality: 'Suba',
      });
    }

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain('@example.com');
    expect(serialized).not.toContain('phone');
  });

  it('solo muestra las notificaciones del usuario autenticado', async () => {
    const { organizer } = await seedCancellations(1);
    const stranger = await newCompleteUser('Ajeno');

    const organizerInbox = await listNotifications(app, organizer.accessToken);
    expect(organizerInbox.body.total).toBe(1);

    const strangerInbox = await listNotifications(app, stranger.accessToken);
    expect(strangerInbox.status).toBe(200);
    expect(strangerInbox.body).toMatchObject({
      notifications: [],
      unreadCount: 0,
      total: 0,
      totalPages: 0,
    });
  });

  it('status=all incluye leídas y unreadCount cuenta solo las pendientes', async () => {
    const { organizer } = await seedCancellations(3);

    const initial = await listNotifications(app, organizer.accessToken);
    const newest = (initial.body.notifications as NotificationItem[])[0];
    if (!newest) {
      throw new Error('No se generaron notificaciones');
    }

    const read = await markNotificationRead(
      app,
      organizer.accessToken,
      newest.id,
    );
    expect(read.status).toBe(200);
    expect(read.body.unreadCount).toBe(2);

    const unreadOnly = await listNotifications(app, organizer.accessToken);
    expect(unreadOnly.body).toMatchObject({
      unreadCount: 2,
      total: 2,
    });
    expect(
      (unreadOnly.body.notifications as NotificationItem[]).some(
        (item) => item.id === newest.id,
      ),
    ).toBe(false);

    const all = await listNotifications(
      app,
      organizer.accessToken,
      '?status=all',
    );
    expect(all.body).toMatchObject({
      unreadCount: 2,
      total: 3,
      totalPages: 1,
    });

    const readItem = (all.body.notifications as NotificationItem[]).find(
      (item) => item.id === newest.id,
    );
    expect(readItem?.readAt).toEqual(expect.any(String));
  });

  it('pagina sin repetir notificaciones y mantiene el contador global', async () => {
    const { organizer } = await seedCancellations(3);

    const firstPage = await listNotifications(
      app,
      organizer.accessToken,
      '?page=1&pageSize=2',
    );
    expect(firstPage.body).toMatchObject({
      unreadCount: 3,
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    const firstIds = (firstPage.body.notifications as NotificationItem[]).map(
      (item) => item.id,
    );
    expect(firstIds).toHaveLength(2);

    const secondPage = await listNotifications(
      app,
      organizer.accessToken,
      '?page=2&pageSize=2',
    );
    expect(secondPage.body).toMatchObject({
      unreadCount: 3,
      page: 2,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    const secondIds = (secondPage.body.notifications as NotificationItem[]).map(
      (item) => item.id,
    );
    expect(secondIds).toHaveLength(1);
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
  });

  it('no expone datos sensibles ni campos ajenos al contrato', async () => {
    const { organizer } = await seedCancellations(1);

    const response = await listNotifications(
      app,
      organizer.accessToken,
      '?status=all',
    );
    const [notification] = response.body.notifications as NotificationItem[];
    expect(notification).toBeDefined();

    expect(Object.keys(notification ?? {}).sort()).toEqual([
      'actor',
      'content',
      'createdAt',
      'id',
      'match',
      'readAt',
      'request',
      'type',
    ]);
    expect(notification?.content).toBeNull();
    expect(Object.keys(notification?.actor ?? {}).sort()).toEqual([
      'id',
      'name',
      'profilePic',
    ]);
    expect(Object.keys(notification?.request ?? {}).sort()).toEqual([
      'id',
      'type',
    ]);
    expect(Object.keys(notification?.match ?? {}).sort()).toEqual([
      'id',
      'locality',
      'matchDate',
    ]);

    const serialized = JSON.stringify(response.body);
    for (const forbidden of ['phone', 'email', 'password', '@example.com']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('valida los filtros de la consulta', async () => {
    const { organizer } = await seedCancellations(1);

    for (const query of [
      '?status=leidas',
      '?page=0',
      '?page=abc',
      '?pageSize=0',
      '?pageSize=51',
    ]) {
      const response = await listNotifications(
        app,
        organizer.accessToken,
        query,
      );
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});
