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
const nextEmail = makeEmailFactory('reqcancel');

afterAll(async () => {
  await cleanupByPrefix('reqcancel');
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

describe('Cancelar solicitudes (RF-07)', () => {
  it('el emisor cancela una solicitud pendiente y libera la vacante', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const created = await sendMatchRequest(app, player.accessToken, vacancy.id);
    expect(created.status).toBe(201);
    const requestId = created.body.request.id as number;

    const cancelled = await actOnRequest(
      app,
      player.accessToken,
      requestId,
      'cancel',
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.request).toMatchObject({
      state: 'cancelled',
      direction: 'sent',
      canCancel: false,
      canRespond: false,
    });
    expect(typeof cancelled.body.request.cancelledAt).toBe('string');

    const stored = await query<{
      state: string;
      cancelled_by: number;
      occupied: boolean;
      match_state: string;
    }>(
      `SELECT r.state, r.cancelled_by, mv.occupied, m.state AS match_state
       FROM requests r
       JOIN matchvacants mv ON mv.id = r.matchvacant_id
       JOIN matchs m ON m.id = r.match_id
       WHERE r.id = $1`,
      [requestId],
    );
    expect(stored.rows[0]).toEqual({
      state: 'cancelled',
      cancelled_by: player.userId,
      occupied: false,
      match_state: 'available',
    });

    const again = await sendMatchRequest(app, player.accessToken, vacancy.id);
    expect(again.status).toBe(201);
  });

  it('cancelar una solicitud aceptada libera la vacante y reabre el partido', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);
    const vacancy = firstVacancy(match);

    const created = await sendMatchRequest(app, player.accessToken, vacancy.id);
    const requestId = created.body.request.id as number;

    const accepted = await actOnRequest(
      app,
      organizer.accessToken,
      requestId,
      'accept',
    );
    expect(accepted.status).toBe(200);

    const confirmed = await query<{ state: string }>(
      'SELECT state FROM matchs WHERE id = $1',
      [match.matchId],
    );
    expect(confirmed.rows[0]?.state).toBe('confirmed');

    const cancelled = await actOnRequest(
      app,
      player.accessToken,
      requestId,
      'cancel',
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.request.state).toBe('cancelled');

    const state = await query<{
      occupied: boolean;
      match_state: string;
      cancelled_by: number;
    }>(
      `SELECT mv.occupied, m.state AS match_state, r.cancelled_by
       FROM requests r
       JOIN matchvacants mv ON mv.id = r.matchvacant_id
       JOIN matchs m ON m.id = r.match_id
       WHERE r.id = $1`,
      [requestId],
    );
    expect(state.rows[0]).toEqual({
      occupied: false,
      match_state: 'available',
      cancelled_by: player.userId,
    });
  });

  it('no cancela solicitudes rechazadas o ya canceladas', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');

    const firstMatch = await createMatchWithVacancies(
      app,
      organizer.accessToken,
      1,
    );
    const firstRequest = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(firstMatch).id,
    );
    const firstId = firstRequest.body.request.id as number;

    await actOnRequest(app, organizer.accessToken, firstId, 'reject').expect(200);

    const rejected = await actOnRequest(
      app,
      player.accessToken,
      firstId,
      'cancel',
    );
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe('REQUEST_NOT_CANCELLABLE');

    const secondMatch = await createMatchWithVacancies(
      app,
      organizer.accessToken,
      1,
    );
    const secondRequest = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(secondMatch).id,
    );
    const secondId = secondRequest.body.request.id as number;

    await actOnRequest(app, player.accessToken, secondId, 'cancel').expect(200);

    const twice = await actOnRequest(
      app,
      player.accessToken,
      secondId,
      'cancel',
    );
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('REQUEST_NOT_CANCELLABLE');
  });

  it('cancela una solicitud entre jugadores incluso después de aceptada', async () => {
    const sender = await newCompleteUser('Solicitante');
    const target = await newCompleteUser('Jugador buscado');

    const created = await sendPlayerRequest(app, sender.accessToken, target.userId);
    const requestId = created.body.request.id as number;

    await actOnRequest(app, target.accessToken, requestId, 'accept').expect(200);

    const cancelled = await actOnRequest(
      app,
      sender.accessToken,
      requestId,
      'cancel',
    );

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.request.state).toBe('cancelled');
    expect(cancelled.body.request.match).toBeNull();
  });

  it('solo el emisor puede cancelar', async () => {
    const sender = await newCompleteUser('Solicitante');
    const target = await newCompleteUser('Jugador buscado');
    const stranger = await newCompleteUser('Ajeno');

    const created = await sendPlayerRequest(app, sender.accessToken, target.userId);
    const requestId = created.body.request.id as number;

    const asReceiver = await actOnRequest(
      app,
      target.accessToken,
      requestId,
      'cancel',
    );
    expect(asReceiver.status).toBe(403);
    expect(asReceiver.body.error.code).toBe('FORBIDDEN');

    const asStranger = await actOnRequest(
      app,
      stranger.accessToken,
      requestId,
      'cancel',
    );
    expect(asStranger.status).toBe(403);
  });

  it('la cancelación del partido cancela sus solicitudes activas', async () => {
    const organizer = await newCompleteUser('Organizador');
    const player = await newCompleteUser('Solicitante');
    const match = await createMatchWithVacancies(app, organizer.accessToken, 1);

    const created = await sendMatchRequest(
      app,
      player.accessToken,
      firstVacancy(match).id,
    );
    const requestId = created.body.request.id as number;

    await request(app)
      .patch(`/api/matches/${match.matchId}/cancel`)
      .set(bearer(organizer.accessToken))
      .expect(200);

    const stored = await query<{
      state: string;
      cancelled_by: number;
      cancelled_at: Date | null;
    }>('SELECT state, cancelled_by, cancelled_at FROM requests WHERE id = $1', [
      requestId,
    ]);

    expect(stored.rows[0]?.state).toBe('cancelled');
    expect(stored.rows[0]?.cancelled_by).toBe(organizer.userId);
    expect(stored.rows[0]?.cancelled_at).not.toBeNull();

    const cancelAgain = await actOnRequest(
      app,
      player.accessToken,
      requestId,
      'cancel',
    );
    expect(cancelAgain.status).toBe(409);
    expect(cancelAgain.body.error.code).toBe('REQUEST_NOT_CANCELLABLE');
  });

  it('responde 404 para solicitudes inexistentes', async () => {
    const player = await newCompleteUser('Solicitante');

    const missing = await actOnRequest(app, player.accessToken, 999_999, 'cancel');

    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('REQUEST_NOT_FOUND');
  });
});
