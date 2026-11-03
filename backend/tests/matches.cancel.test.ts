import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { publishMatch } from './helpers/matches.js';

const app = createApp();
const nextEmail = makeEmailFactory('matchcancel');

let organizer: TestSession;
let other: TestSession;
let acceptedPlayer: TestSession;
let matchId = 0;
let vacancyIds: number[] = [];

beforeAll(async () => {
  organizer = await registerUser(app, nextEmail());
  await completeProfile(app, organizer.accessToken);

  other = await registerUser(app, nextEmail());
  await completeProfile(app, other.accessToken);

  acceptedPlayer = await registerUser(app, nextEmail());
  await completeProfile(app, acceptedPlayer.accessToken);

  const published = await publishMatch(app, organizer.accessToken, {
    matchDate: '2033-06-15T19:00:00-05:00',
    positions: [
      { positionId: 1, slots: 2 },
      { positionId: 2, slots: 1 },
    ],
  });
  if (published.status !== 201) {
    throw new Error(`No se pudo publicar el partido: ${JSON.stringify(published.body)}`);
  }

  matchId = published.body.match.id;
  vacancyIds = (published.body.match.vacancies as { id: number }[]).map(
    (vacancy) => vacancy.id,
  );

  const [pendingVacancy, acceptedVacancy, rejectedVacancy] = vacancyIds;
  if (
    pendingVacancy === undefined ||
    acceptedVacancy === undefined ||
    rejectedVacancy === undefined
  ) {
    throw new Error('El partido no tiene las tres vacantes esperadas');
  }

  await query(
    `INSERT INTO requests
       (request_type, sender_id, receiver_id, match_id, matchvacant_id, state)
     VALUES
       ('match', $1, $2, $3, $4, 'pending'),
       ('match', $5, $2, $3, $6, 'accepted'),
       ('match', $1, $2, $3, $7, 'rejected')`,
    [
      other.userId,
      organizer.userId,
      matchId,
      pendingVacancy,
      acceptedPlayer.userId,
      acceptedVacancy,
      rejectedVacancy,
    ],
  );
  await query('UPDATE matchvacants SET occupied = true WHERE id = $1', [
    acceptedVacancy,
  ]);
});

afterAll(async () => {
  await cleanupByPrefix('matchcancel');
  await closePool();
});

function cancel(accessToken: string, id: number | string) {
  return request(app).patch(`/api/matches/${id}/cancel`).set(bearer(accessToken));
}

describe('Cancelar partido (RF-04 + Publicar partido)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app).patch(`/api/matches/${matchId}/cancel`);
    expect(anonymous.status).toBe(401);

    const incomplete = await registerUser(app, nextEmail());
    const blocked = await cancel(incomplete.accessToken, matchId);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('solo el organizador puede cancelar', async () => {
    const res = await cancel(other.accessToken, matchId);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    const detail = await request(app)
      .get(`/api/matches/${matchId}`)
      .set(bearer(organizer.accessToken));
    expect(detail.body.match.state).toBe('available');
  });

  it('cancela el partido, libera vacantes y cancela las solicitudes activas', async () => {
    const res = await cancel(organizer.accessToken, matchId);

    expect(res.status).toBe(200);
    expect(res.body.match).toMatchObject({
      state: 'cancelled',
      canCancel: false,
      totalSpots: 3,
      freeSpots: 3,
    });
    expect(typeof res.body.match.cancelledAt).toBe('string');
    expect(
      (res.body.match.vacancies as { occupied: boolean }[]).every(
        (vacancy) => vacancy.occupied === false,
      ),
    ).toBe(true);
    expect(
      (res.body.match.positions as { slots: number; freeSlots: number }[]).every(
        (position) => position.slots === position.freeSlots,
      ),
    ).toBe(true);

    const states = await query<{ state: string; total: number }>(
      `SELECT state, count(*)::int AS total
       FROM requests
       WHERE matchvacant_id = ANY($1::int[])
       GROUP BY state`,
      [vacancyIds],
    );
    const byState = new Map(states.rows.map((row) => [row.state, row.total]));
    expect(byState.get('cancelled')).toBe(2);
    expect(byState.get('rejected')).toBe(1);
    expect(byState.has('pending')).toBe(false);
    expect(byState.has('accepted')).toBe(false);

    const stored = await query<{ state: string }>(
      'SELECT state FROM matchs WHERE id = $1',
      [matchId],
    );
    expect(stored.rows[0]?.state).toBe('cancelled');
  });

  it('no permite cancelar dos veces', async () => {
    const res = await cancel(organizer.accessToken, matchId);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MATCH_ALREADY_CANCELLED');
  });

  it('mantiene el detalle histórico del partido cancelado', async () => {
    const res = await request(app)
      .get(`/api/matches/${matchId}`)
      .set(bearer(other.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.match.state).toBe('cancelled');
    expect(res.body.match.vacancies).toHaveLength(3);
    expect(res.body.match.cancelledAt).not.toBeNull();
  });

  it('excluye el partido cancelado de la búsqueda', async () => {
    const res = await request(app)
      .get('/api/matches?date=2033-06-15')
      .set(bearer(other.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('responde 404 si el partido no existe y 400 si el id no es válido', async () => {
    const missing = await cancel(organizer.accessToken, 999_999);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('MATCH_NOT_FOUND');

    const invalid = await cancel(organizer.accessToken, 'abc');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });
});
