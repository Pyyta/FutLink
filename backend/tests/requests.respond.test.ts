import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import {
  bearer,
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

const app = createApp();
const nextEmail = makeEmailFactory('reqrespond');

afterAll(async () => {
  await cleanupByPrefix('reqrespond');
  await closePool();
});

async function newCompleteUser(name = 'Jugador de Prueba'): Promise<TestSession> {
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

describe('Aceptar y rechazar solicitudes (RF-06)', () => {
  it('acepta una solicitud de partido y ocupa la vacante', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const created = await sendMatchRequest(app, player.accessToken, vacancy.id);
    expect(created.status).toBe(201);

    const accepted = await actOnRequest(
      app,
      organizer.accessToken,
      created.body.request.id,
      'accept',
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body.request).toMatchObject({
      state: 'accepted',
      direction: 'received',
      canRespond: false,
      canCancel: false,
    });
    expect(typeof accepted.body.request.respondedAt).toBe('string');

    const detail = await request(app)
      .get(`/api/matches/${match.matchId}`)
      .set(bearer(organizer.accessToken));
    expect(detail.body.match.state).toBe('confirmed');
    expect(detail.body.match.freeSpots).toBe(0);
    expect(detail.body.match.vacancies[0].occupied).toBe(true);

    const stored = await query<{ occupied: boolean }>(
      'SELECT occupied FROM matchvacants WHERE id = $1',
      [vacancy.id],
    );
    expect(stored.rows[0]?.occupied).toBe(true);
  });

  it('resuelve aceptaciones concurrentes de la misma vacante sin doble ocupación', async () => {
    const organizer = await newCompleteUser('Organizador');
    const first = await newCompleteUser('Primero');
    const second = await newCompleteUser('Segundo');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const firstRequest = await sendMatchRequest(app, first.accessToken, vacancy.id);
    const secondRequest = await sendMatchRequest(app, second.accessToken, vacancy.id);
    expect(firstRequest.status).toBe(201);
    expect(secondRequest.status).toBe(201);

    const [firstResponse, secondResponse] = await Promise.all([
      actOnRequest(app, organizer.accessToken, firstRequest.body.request.id, 'accept'),
      actOnRequest(app, organizer.accessToken, secondRequest.body.request.id, 'accept'),
    ]);

    const statuses = [firstResponse.status, secondResponse.status].sort();
    expect(statuses).toEqual([200, 409]);

    const rejectedResponse =
      firstResponse.status === 409 ? firstResponse : secondResponse;
    expect(rejectedResponse.body.error.code).toBe('VACANCY_OCCUPIED');

    const counts = await query<{ accepted: number; pending: number }>(
      `SELECT
         count(*) FILTER (WHERE state = 'accepted')::int AS accepted,
         count(*) FILTER (WHERE state = 'pending')::int AS pending
       FROM requests
       WHERE match_id = $1`,
      [match.matchId],
    );
    expect(counts.rows[0]).toEqual({ accepted: 1, pending: 1 });

    const vacancyState = await query<{ occupied: boolean }>(
      'SELECT occupied FROM matchvacants WHERE id = $1',
      [vacancy.id],
    );
    expect(vacancyState.rows[0]?.occupied).toBe(true);

    const matchState = await query<{ state: string }>(
      'SELECT state FROM matchs WHERE id = $1',
      [match.matchId],
    );
    expect(matchState.rows[0]?.state).toBe('confirmed');
  });

  it('acepta una solicitud entre jugadores', async () => {
    const sender = await newCompleteUser('Solicitante');
    const target = await newCompleteUser('Jugador buscado');

    const created = await sendPlayerRequest(app, sender.accessToken, target.userId);
    expect(created.status).toBe(201);

    const accepted = await actOnRequest(
      app,
      target.accessToken,
      created.body.request.id,
      'accept',
    );

    expect(accepted.status).toBe(200);
    expect(accepted.body.request).toMatchObject({
      type: 'player',
      state: 'accepted',
      match: null,
      direction: 'received',
    });
    expect(typeof accepted.body.request.respondedAt).toBe('string');
  });

  it('solo el destinatario puede aceptar o rechazar', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const stranger = await newCompleteUser('Ajeno');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);

    const created = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(match).id,
    );
    expect(created.status).toBe(201);
    const requestId = created.body.request.id as number;

    const asSender = await actOnRequest(app, player.accessToken, requestId, 'accept');
    expect(asSender.status).toBe(403);
    expect(asSender.body.error.code).toBe('FORBIDDEN');

    const asStranger = await actOnRequest(
      app,
      stranger.accessToken,
      requestId,
      'reject',
    );
    expect(asStranger.status).toBe(403);
    expect(asStranger.body.error.code).toBe('FORBIDDEN');

    const senderReject = await actOnRequest(
      app,
      player.accessToken,
      requestId,
      'reject',
    );
    expect(senderReject.status).toBe(403);
  });

  it('rechaza sin ocupar la vacante y no permite respuestas posteriores', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const created = await sendMatchRequest(app, player.accessToken, vacancy.id);
    const requestId = created.body.request.id as number;

    const rejected = await actOnRequest(
      app,
      organizer.accessToken,
      requestId,
      'reject',
    );

    expect(rejected.status).toBe(200);
    expect(rejected.body.request.state).toBe('rejected');
    expect(typeof rejected.body.request.respondedAt).toBe('string');

    const vacancyState = await query<{ occupied: boolean }>(
      'SELECT occupied FROM matchvacants WHERE id = $1',
      [vacancy.id],
    );
    expect(vacancyState.rows[0]?.occupied).toBe(false);

    const matchState = await query<{ state: string }>(
      'SELECT state FROM matchs WHERE id = $1',
      [match.matchId],
    );
    expect(matchState.rows[0]?.state).toBe('available');

    const acceptAgain = await actOnRequest(
      app,
      organizer.accessToken,
      requestId,
      'accept',
    );
    expect(acceptAgain.status).toBe(409);
    expect(acceptAgain.body.error.code).toBe('REQUEST_NOT_PENDING');

    const rejectAgain = await actOnRequest(
      app,
      organizer.accessToken,
      requestId,
      'reject',
    );
    expect(rejectAgain.status).toBe(409);
    expect(rejectAgain.body.error.code).toBe('REQUEST_NOT_PENDING');
  });

  it('no acepta solicitudes de un partido cancelado', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);

    const created = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(match).id,
    );
    expect(created.status).toBe(201);

    await request(app)
      .patch(`/api/matches/${match.matchId}/cancel`)
      .set(bearer(organizer.accessToken))
      .expect(200);

    const accepted = await actOnRequest(
      app,
      organizer.accessToken,
      created.body.request.id,
      'accept',
    );

    expect(accepted.status).toBe(409);
    expect(accepted.body.error.code).toBe('REQUEST_NOT_PENDING');
  });

  it('responde 404 y 400 para solicitudes inexistentes o ids inválidos', async () => {
    const organizer = await newCompleteUser('Organizador');

    const missing = await actOnRequest(app, organizer.accessToken, 999_999, 'accept');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('REQUEST_NOT_FOUND');

    const invalid = await actOnRequest(app, organizer.accessToken, 'abc', 'reject');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
