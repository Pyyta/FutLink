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
  createMatchWithVacancies,
  sendMatchRequest,
  sendPlayerRequest,
} from './helpers/requests.js';
import type { TestMatch } from './helpers/requests.js';

const app = createApp();
const nextEmail = makeEmailFactory('reqcreate');

afterAll(async () => {
  await cleanupByPrefix('reqcreate');
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

describe('POST /api/requests (RF-06)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app)
      .post('/api/requests')
      .send({ type: 'player', targetUserId: 1 });
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const incomplete = await registerUser(app, nextEmail());
    const blocked = await sendPlayerRequest(app, incomplete.accessToken, 1);

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('crea una solicitud de partido pendiente para el organizador', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const playerProfile = await completeProfile(app, player.accessToken, {
      name: 'Solicitante',
    });
    const playerPhone = playerProfile.body.user.phone as string;
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const res = await sendMatchRequest(app, player.accessToken, vacancy.id);

    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      type: 'match',
      state: 'pending',
      sender: { id: player.userId },
      receiver: { id: organizer.userId },
      match: {
        id: match.matchId,
        position: vacancy.position,
        state: 'available',
      },
      direction: 'sent',
      canRespond: false,
      canCancel: true,
      respondedAt: null,
      cancelledAt: null,
    });
    expect(typeof res.body.request.createdAt).toBe('string');
    expect(JSON.stringify(res.body)).not.toContain(player.email);
    expect(JSON.stringify(res.body)).not.toContain(playerPhone);

    const stored = await query<{
      request_type: string;
      state: string;
      sender_id: number;
      receiver_id: number;
      match_id: number;
      matchvacant_id: number;
      target_user_id: number | null;
    }>(
      `SELECT request_type, state, sender_id, receiver_id, match_id,
              matchvacant_id, target_user_id
       FROM requests
       WHERE id = $1`,
      [res.body.request.id],
    );

    expect(stored.rows[0]).toEqual({
      request_type: 'match',
      state: 'pending',
      sender_id: player.userId,
      receiver_id: organizer.userId,
      match_id: match.matchId,
      matchvacant_id: vacancy.id,
      target_user_id: null,
    });
  });

  it('impide duplicados activos con una restricción de la base', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 2);
    const [first, second] = match.vacancies;
    if (!first || !second) {
      throw new Error('El partido no tiene dos vacantes');
    }

    const created = await sendMatchRequest(app, player.accessToken, first.id);
    expect(created.status).toBe(201);

    const duplicate = await sendMatchRequest(app, player.accessToken, second.id);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('REQUEST_ALREADY_EXISTS');

    await expect(
      query(
        `INSERT INTO requests
           (request_type, sender_id, receiver_id, match_id, matchvacant_id)
         VALUES ('match', $1, $2, $3, $4)`,
        [player.userId, organizer.userId, match.matchId, second.id],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'requests_active_match_ux',
    });

    const count = await query<{ total: number }>(
      `SELECT count(*)::int AS total
       FROM requests
       WHERE sender_id = $1 AND match_id = $2
         AND state IN ('pending', 'accepted')`,
      [player.userId, match.matchId],
    );
    expect(count.rows[0]?.total).toBe(1);
  });

  it('no permite solicitar una plaza en el propio partido', async () => {
    const organizer = await newCompleteUser('Organizador');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);

    const res = await sendMatchRequest(
      app,
      organizer.accessToken,
      firstVacancy(match).id,
    );

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CANNOT_REQUEST_OWN_MATCH');
  });

  it('rechaza vacantes ocupadas, partidos no disponibles y fechas pasadas', async () => {
    const organizer = await newCompleteUser('Organizador');
    const firstPlayer = await newCompleteUser('Primero');
    const secondPlayer = await newCompleteUser('Segundo');

    const match = await createMatchWithVacancies(app, organizer.accessToken, 2);
    const occupiedVacancy = match.vacancies[0];
    if (!occupiedVacancy) {
      throw new Error('El partido no tiene vacantes');
    }

    const firstRequest = await sendMatchRequest(
      app,
      firstPlayer.accessToken,
      occupiedVacancy.id,
    );
    expect(firstRequest.status).toBe(201);

    await request(app)
      .patch(`/api/requests/${firstRequest.body.request.id}/accept`)
      .set(bearer(organizer.accessToken))
      .expect(200);

    const occupied = await sendMatchRequest(
      app,
      secondPlayer.accessToken,
      occupiedVacancy.id,
    );
    expect(occupied.status).toBe(409);
    expect(occupied.body.error.code).toBe('VACANCY_OCCUPIED');

    const fullMatch = await createMatchWithVacancies(
      app,
      organizer.accessToken,
      1,
    );
    const fullRequest = await sendMatchRequest(
      app,
      firstPlayer.accessToken,
      firstVacancy(fullMatch).id,
    );
    expect(fullRequest.status).toBe(201);
    await request(app)
      .patch(`/api/requests/${fullRequest.body.request.id}/accept`)
      .set(bearer(organizer.accessToken))
      .expect(200);

    const full = await sendMatchRequest(
      app,
      secondPlayer.accessToken,
      firstVacancy(fullMatch).id,
    );
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('MATCH_NOT_AVAILABLE');

    const cancelledMatch = await createMatchWithVacancies(
      app,
      organizer.accessToken,
      1,
    );
    await request(app)
      .patch(`/api/matches/${cancelledMatch.matchId}/cancel`)
      .set(bearer(organizer.accessToken))
      .expect(200);

    const unavailable = await sendMatchRequest(
      app,
      secondPlayer.accessToken,
      firstVacancy(cancelledMatch).id,
    );
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.error.code).toBe('MATCH_NOT_AVAILABLE');

    const pastMatch = await query<{ id: number }>(
      `INSERT INTO matchs (creator_id, match_date, locality)
       VALUES ($1, now() - interval '1 hour', 'Suba')
       RETURNING id`,
      [organizer.userId],
    );
    const pastMatchId = pastMatch.rows[0]?.id;
    if (!pastMatchId) {
      throw new Error('No se pudo crear el partido pasado');
    }
    const pastVacancy = await query<{ id: number }>(
      `INSERT INTO matchvacants (match_id, position)
       VALUES ($1, 'portero')
       RETURNING id`,
      [pastMatchId],
    );
    const pastVacancyId = pastVacancy.rows[0]?.id;
    if (!pastVacancyId) {
      throw new Error('No se pudo crear la vacante pasada');
    }

    const past = await sendMatchRequest(
      app,
      secondPlayer.accessToken,
      pastVacancyId,
    );
    expect(past.status).toBe(409);
    expect(past.body.error.code).toBe('MATCH_ALREADY_STARTED');
  });

  it('responde 404 si la vacante no existe', async () => {
    const player = await newCompleteUser('Solicitante');

    const res = await sendMatchRequest(app, player.accessToken, 999_999);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('VACANCY_NOT_FOUND');
  });

  it('crea una solicitud entre jugadores y evita duplicados', async () => {
    const sender = await newCompleteUser('Solicitante');
    const target = await newCompleteUser('Jugador buscado');

    const res = await sendPlayerRequest(app, sender.accessToken, target.userId);

    expect(res.status).toBe(201);
    expect(res.body.request).toMatchObject({
      type: 'player',
      state: 'pending',
      sender: { id: sender.userId },
      receiver: { id: target.userId },
      match: null,
      direction: 'sent',
      canRespond: false,
      canCancel: true,
    });

    const duplicate = await sendPlayerRequest(
      app,
      sender.accessToken,
      target.userId,
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('REQUEST_ALREADY_EXISTS');

    const stored = await query<{ request_type: string; target_user_id: number }>(
      'SELECT request_type, target_user_id FROM requests WHERE id = $1',
      [res.body.request.id],
    );
    expect(stored.rows[0]).toEqual({
      request_type: 'player',
      target_user_id: target.userId,
    });
  });

  it('no permite solicitudes a uno mismo ni a cuentas no disponibles', async () => {
    const sender = await newCompleteUser('Solicitante');

    const self = await sendPlayerRequest(app, sender.accessToken, sender.userId);
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe('CANNOT_REQUEST_SELF');

    const incomplete = await registerUser(app, nextEmail());
    const incompleteRes = await sendPlayerRequest(
      app,
      sender.accessToken,
      incomplete.userId,
    );
    expect(incompleteRes.status).toBe(404);
    expect(incompleteRes.body.error.code).toBe('USER_NOT_FOUND');

    const suspended = await newCompleteUser('Suspendido');
    await query("UPDATE users SET state = 'suspended' WHERE id = $1", [
      suspended.userId,
    ]);

    const suspendedRes = await sendPlayerRequest(
      app,
      sender.accessToken,
      suspended.userId,
    );
    expect(suspendedRes.status).toBe(404);
    expect(suspendedRes.body.error.code).toBe('USER_NOT_FOUND');

    const missing = await sendPlayerRequest(app, sender.accessToken, 999_999);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('valida el cuerpo según el tipo de solicitud', async () => {
    const player = await newCompleteUser('Solicitante');

    const withoutVacancy = await request(app)
      .post('/api/requests')
      .set(bearer(player.accessToken))
      .send({ type: 'match' });
    expect(withoutVacancy.status).toBe(400);
    expect(withoutVacancy.body.error.code).toBe('VALIDATION_ERROR');

    const badTarget = await request(app)
      .post('/api/requests')
      .set(bearer(player.accessToken))
      .send({ type: 'player', targetUserId: 'abc' });
    expect(badTarget.status).toBe(400);

    const unknownType = await request(app)
      .post('/api/requests')
      .set(bearer(player.accessToken))
      .send({ type: 'other', targetUserId: 1 });
    expect(unknownType.status).toBe(400);
  });
});
