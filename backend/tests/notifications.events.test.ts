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
  sendPlayerRequest,
} from './helpers/requests.js';
import type { TestMatch } from './helpers/requests.js';
import { listNotifications } from './helpers/notifications.js';

const app = createApp();
const nextEmail = makeEmailFactory('notifevents');

afterAll(async () => {
  await cleanupByPrefix('notifevents');
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

function firstVacancy(match: TestMatch): { id: number; position: string } {
  const vacancy = match.vacancies[0];
  if (!vacancy) {
    throw new Error('El partido no tiene vacantes');
  }
  return vacancy;
}

interface NotificationItem {
  id: number;
  type: string;
  readAt: string | null;
  createdAt: string;
  actor: { id: number; name: string | null; profilePic: string | null } | null;
  request: { id: number; type: string } | null;
  match: { id: number; matchDate: string; locality: string } | null;
}

async function notificationsOf(
  session: TestSession,
  queryString = '?status=all',
): Promise<NotificationItem[]> {
  const response = await listNotifications(app, session.accessToken, queryString);
  expect(response.status).toBe(200);
  return response.body.notifications as NotificationItem[];
}

describe('Generación de notificaciones (RF-08, RNF-02)', () => {
  it('notifica al emisor cuando aceptan su solicitud de partido', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);

    const created = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(match).id,
    );
    expect(created.status).toBe(201);

    const accepted = await actOnRequest(
      app,
      organizer.accessToken,
      created.body.request.id,
      'accept',
    );
    expect(accepted.status).toBe(200);

    const response = await listNotifications(app, player.accessToken);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      unreadCount: 1,
      total: 1,
      totalPages: 1,
    });

    const [notification] = response.body.notifications as NotificationItem[];
    expect(notification).toMatchObject({
      type: 'request_accepted',
      readAt: null,
      actor: { id: organizer.userId, name: 'Organizador' },
      request: {
        id: created.body.request.id,
        type: 'match',
      },
      match: {
        id: match.matchId,
        locality: 'Suba',
      },
    });
    expect(typeof notification?.createdAt).toBe('string');

    const organizerInbox = await notificationsOf(organizer);
    expect(organizerInbox).toHaveLength(0);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(player.email);
    expect(serialized).not.toContain('phone');
  });

  it('notifica al organizador cuando el emisor cancela una solicitud pendiente', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);

    const created = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(match).id,
    );
    expect(created.status).toBe(201);

    const cancelled = await actOnRequest(
      app,
      player.accessToken,
      created.body.request.id,
      'cancel',
    );
    expect(cancelled.status).toBe(200);

    const organizerInbox = await notificationsOf(organizer);
    expect(organizerInbox).toHaveLength(1);
    expect(organizerInbox[0]).toMatchObject({
      type: 'request_cancelled',
      readAt: null,
      actor: { id: player.userId, name: 'Solicitante' },
      request: {
        id: created.body.request.id,
        type: 'match',
      },
      match: { id: match.matchId, locality: 'Suba' },
    });

    const playerInbox = await notificationsOf(player);
    expect(playerInbox).toHaveLength(0);
  });

  it('notifica al destinatario de una solicitud entre jugadores cancelada', async () => {
    const sender = await newCompleteUser('Emisor');
    const target = await newCompleteUser('Destinatario');

    const created = await sendPlayerRequest(app, sender.accessToken, target.userId);
    expect(created.status).toBe(201);

    const accepted = await actOnRequest(
      app,
      target.accessToken,
      created.body.request.id,
      'accept',
    );
    expect(accepted.status).toBe(200);

    const senderAfterAccept = await notificationsOf(sender);
    expect(senderAfterAccept).toHaveLength(1);
    expect(senderAfterAccept[0]).toMatchObject({
      type: 'request_accepted',
      request: { type: 'player' },
      match: null,
    });

    const cancelled = await actOnRequest(
      app,
      sender.accessToken,
      created.body.request.id,
      'cancel',
    );
    expect(cancelled.status).toBe(200);

    const targetInbox = await notificationsOf(target);
    expect(targetInbox).toHaveLength(1);
    expect(targetInbox[0]).toMatchObject({
      type: 'request_cancelled',
      actor: { id: sender.userId, name: 'Emisor' },
      request: {
        id: created.body.request.id,
        type: 'player',
      },
      match: null,
    });
  });

  it('notifica a los emisores afectados al cancelar el partido', async () => {
    const organizer = await newCompleteUser('Organizador');
    const alice = await newCompleteUser('Alicia');
    const bob = await newCompleteUser('Bob');
    const carol = await newCompleteUser('Carolina');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 2);

    const [first, second] = match.vacancies;
    if (!first || !second) {
      throw new Error('El partido no tiene dos vacantes');
    }

    const aliceRequest = await sendMatchRequest(
      app,
      alice.accessToken,
      first.id,
    );
    const bobRequest = await sendMatchRequest(app, bob.accessToken, second.id);
    expect(aliceRequest.status).toBe(201);
    expect(bobRequest.status).toBe(201);

    const bobAccepted = await actOnRequest(
      app,
      organizer.accessToken,
      bobRequest.body.request.id,
      'accept',
    );
    expect(bobAccepted.status).toBe(200);

    const carolRequest = await sendMatchRequest(
      app,
      carol.accessToken,
      first.id,
    );
    expect(carolRequest.status).toBe(201);
    const carolRejected = await actOnRequest(
      app,
      organizer.accessToken,
      carolRequest.body.request.id,
      'reject',
    );
    expect(carolRejected.status).toBe(200);

    const cancelled = await request(app)
      .patch(`/api/matches/${match.matchId}/cancel`)
      .set({ Authorization: `Bearer ${organizer.accessToken}` });
    expect(cancelled.status).toBe(200);

    const aliceInbox = await notificationsOf(alice);
    expect(aliceInbox).toHaveLength(1);
    expect(aliceInbox[0]).toMatchObject({
      type: 'match_cancelled',
      actor: { id: organizer.userId, name: 'Organizador' },
      request: {
        id: aliceRequest.body.request.id,
        type: 'match',
      },
      match: {
        id: match.matchId,
        locality: 'Suba',
      },
    });

    const bobInbox = await notificationsOf(bob);
    expect(bobInbox).toHaveLength(2);
    expect(bobInbox.map((item) => item.type)).toEqual([
      'match_cancelled',
      'request_accepted',
    ]);
    expect(bobInbox[0]?.match?.id).toBe(match.matchId);
    expect(bobInbox[1]?.request?.id).toBe(bobRequest.body.request.id);

    const carolInbox = await notificationsOf(carol);
    expect(carolInbox).toHaveLength(0);

    const organizerInbox = await notificationsOf(organizer);
    expect(organizerInbox).toHaveLength(0);

    const stored = await query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM notifications
       WHERE match_id = $1 AND type = 'match_cancelled'`,
      [match.matchId],
    );
    expect(stored.rows[0]?.total).toBe(2);
  });

  it('no notifica rechazos ni repite la notificación si la acción falla', async () => {
    const organizer = await newCompleteUser('Organizador');
    const rejectedPlayer = await newCompleteUser('Rechazado');
    const acceptedPlayer = await newCompleteUser('Aceptado');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 2);
    const [first, second] = match.vacancies;
    if (!first || !second) {
      throw new Error('El partido no tiene dos vacantes');
    }

    const rejectedRequest = await sendMatchRequest(
      app,
      rejectedPlayer.accessToken,
      first.id,
    );
    const rejected = await actOnRequest(
      app,
      organizer.accessToken,
      rejectedRequest.body.request.id,
      'reject',
    );
    expect(rejected.status).toBe(200);

    expect(await notificationsOf(rejectedPlayer)).toHaveLength(0);

    const acceptedRequest = await sendMatchRequest(
      app,
      acceptedPlayer.accessToken,
      second.id,
    );
    const accepted = await actOnRequest(
      app,
      organizer.accessToken,
      acceptedRequest.body.request.id,
      'accept',
    );
    expect(accepted.status).toBe(200);

    const acceptAgain = await actOnRequest(
      app,
      organizer.accessToken,
      acceptedRequest.body.request.id,
      'accept',
    );
    expect(acceptAgain.status).toBe(409);
    expect(acceptAgain.body.error.code).toBe('REQUEST_NOT_PENDING');

    const inbox = await notificationsOf(acceptedPlayer);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.type).toBe('request_accepted');
  });

  it('solo el emisor aceptado recibe notificación en aceptaciones concurrentes', async () => {
    const organizer = await newCompleteUser('Organizador');
    const first = await newCompleteUser('Primero');
    const second = await newCompleteUser('Segundo');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const firstRequest = await sendMatchRequest(
      app,
      first.accessToken,
      vacancy.id,
    );
    const secondRequest = await sendMatchRequest(
      app,
      second.accessToken,
      vacancy.id,
    );
    expect(firstRequest.status).toBe(201);
    expect(secondRequest.status).toBe(201);

    const [firstResponse, secondResponse] = await Promise.all([
      actOnRequest(app, organizer.accessToken, firstRequest.body.request.id, 'accept'),
      actOnRequest(app, organizer.accessToken, secondRequest.body.request.id, 'accept'),
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([
      200, 409,
    ]);

    const winner =
      firstResponse.status === 200
        ? { session: first, request: firstRequest }
        : { session: second, request: secondRequest };
    const loser =
      firstResponse.status === 200
        ? { session: second, request: secondRequest }
        : { session: first, request: firstRequest };

    const winnerInbox = await notificationsOf(winner.session);
    expect(winnerInbox).toHaveLength(1);
    expect(winnerInbox[0]).toMatchObject({
      type: 'request_accepted',
      request: {
        id: winner.request.body.request.id,
        type: 'match',
      },
    });

    const loserInbox = await notificationsOf(loser.session);
    expect(loserInbox).toHaveLength(0);
  });
});
