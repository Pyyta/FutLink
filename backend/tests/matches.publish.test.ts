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
import { publishMatch } from './helpers/matches.js';

const app = createApp();
const nextEmail = makeEmailFactory('matchpub');

afterAll(async () => {
  await cleanupByPrefix('matchpub');
  await closePool();
});

async function completeSession() {
  const session = await registerUser(app, nextEmail());
  const profile = await completeProfile(app, session.accessToken);
  expect(profile.status).toBe(200);
  return { session, profile };
}

describe('Publicar partido (RF-04)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app).post('/api/matches').send({});
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const incomplete = await registerUser(app, nextEmail());
    const blocked = await publishMatch(app, incomplete.accessToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('crea el partido con una vacante por plaza y devuelve el detalle', async () => {
    const { session, profile } = await completeSession();

    const res = await publishMatch(app, session.accessToken, {
      locality: 'suba',
      modality: 'F7',
      description: '  Partido de los martes  ',
      positions: [
        { positionId: 1, slots: 2 },
        { positionId: 3, slots: 1 },
      ],
    });

    expect(res.status).toBe(201);
    const match = res.body.match;
    expect(match).toMatchObject({
      locality: 'Suba',
      modality: 'F7',
      description: 'Partido de los martes',
      state: 'available',
      totalSpots: 3,
      freeSpots: 3,
      isOwner: true,
      canCancel: true,
      cancelledAt: null,
    });
    expect(match.positions).toEqual([
      { positionId: 1, position: 'portero', slots: 2, freeSlots: 2 },
      { positionId: 3, position: 'mediocampista', slots: 1, freeSlots: 1 },
    ]);
    expect(match.vacancies).toHaveLength(3);
    expect(match.vacancies.every((vacancy: { occupied: boolean }) => !vacancy.occupied)).toBe(
      true,
    );
    expect(match.creator).toEqual({
      id: session.userId,
      name: 'Jugadora de Prueba',
      profilePic: null,
    });

    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain(session.email);
    expect(serialized).not.toContain(profile.body.user.phone);
    expect(serialized).not.toContain('password');

    const rows = await query<{ total: number; state: string }>(
      `SELECT count(*)::int AS total, max(state) AS state
       FROM matchs
       WHERE id = $1`,
      [match.id],
    );
    expect(rows.rows[0]?.total).toBe(1);
    expect(rows.rows[0]?.state).toBe('available');

    const vacancies = await query<{ total: number }>(
      'SELECT count(*)::int AS total FROM matchvacants WHERE match_id = $1',
      [match.id],
    );
    expect(vacancies.rows[0]?.total).toBe(3);
  });

  it('guarda la ubicación opcional para ordenar por cercanía', async () => {
    const { session } = await completeSession();

    const res = await publishMatch(app, session.accessToken, {
      latitude: 4.711,
      longitude: -74.0721,
    });
    expect(res.status).toBe(201);

    const location = await query<{ latitude: number; longitude: number }>(
      `SELECT
         ST_Y(location::geometry)::float8 AS latitude,
         ST_X(location::geometry)::float8 AS longitude
       FROM matchs
       WHERE id = $1`,
      [res.body.match.id],
    );

    expect(location.rows[0]?.latitude).toBeCloseTo(4.711, 5);
    expect(location.rows[0]?.longitude).toBeCloseTo(-74.0721, 5);
  });

  it('valida fecha, zona, posiciones, plazas y coordenadas', async () => {
    const { session } = await completeSession();
    const token = session.accessToken;

    const past = await publishMatch(app, token, {
      matchDate: '2020-01-15T19:00:00-05:00',
    });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('MATCH_DATE_IN_PAST');

    const withoutOffset = await publishMatch(app, token, {
      matchDate: '2032-01-15T19:00:00',
    });
    expect(withoutOffset.status).toBe(400);
    expect(withoutOffset.body.error.code).toBe('VALIDATION_ERROR');

    const badLocality = await publishMatch(app, token, {
      locality: 'Localidad Inexistente',
    });
    expect(badLocality.status).toBe(400);
    expect(badLocality.body.error.details).toMatchObject({ field: 'locality' });

    const badPosition = await publishMatch(app, token, {
      positions: [{ positionId: 999_999, slots: 1 }],
    });
    expect(badPosition.status).toBe(400);
    expect(badPosition.body.error.details).toMatchObject({ field: 'positions' });

    const noPositions = await publishMatch(app, token, { positions: [] });
    expect(noPositions.status).toBe(400);
    expect(noPositions.body.error.code).toBe('VALIDATION_ERROR');

    const duplicated = await publishMatch(app, token, {
      positions: [
        { positionId: 1, slots: 1 },
        { positionId: 1, slots: 2 },
      ],
    });
    expect(duplicated.status).toBe(400);

    const tooManySlots = await publishMatch(app, token, {
      positions: [
        { positionId: 1, slots: 16 },
        { positionId: 2, slots: 15 },
      ],
    });
    expect(tooManySlots.status).toBe(400);

    const zeroSlots = await publishMatch(app, token, {
      positions: [{ positionId: 1, slots: 0 }],
    });
    expect(zeroSlots.status).toBe(400);

    const halfCoordinates = await request(app)
      .post('/api/matches')
      .set(bearer(token))
      .send({
        matchDate: '2032-01-15T19:00:00-05:00',
        locality: 'Suba',
        positions: [{ positionId: 1, slots: 1 }],
        latitude: 4.711,
      });
    expect(halfCoordinates.status).toBe(400);
  });

  it('no crea nada si alguna posición es inválida', async () => {
    const { session } = await completeSession();

    const before = await query<{ total: number }>(
      'SELECT count(*)::int AS total FROM matchs WHERE creator_id = $1',
      [session.userId],
    );

    const res = await publishMatch(app, session.accessToken, {
      positions: [
        { positionId: 1, slots: 1 },
        { positionId: 999_999, slots: 1 },
      ],
    });
    expect(res.status).toBe(400);

    const after = await query<{ total: number }>(
      'SELECT count(*)::int AS total FROM matchs WHERE creator_id = $1',
      [session.userId],
    );
    expect(after.rows[0]?.total).toBe(before.rows[0]?.total);
  });

  it('acepta modalidad y descripción opcionales', async () => {
    const { session } = await completeSession();

    const res = await publishMatch(app, session.accessToken, {
      modality: null,
      description: null,
      positions: [{ positionId: 2, slots: 1 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.match.modality).toBeNull();
    expect(res.body.match.description).toBeNull();
    expect(res.body.match.distanceMeters).toBeNull();
  });

  it('ignora campos del sistema enviados por el cliente', async () => {
    const { session } = await completeSession();

    const res = await request(app)
      .post('/api/matches')
      .set(bearer(session.accessToken))
      .send({
        matchDate: '2032-02-20T19:00:00-05:00',
        locality: 'Suba',
        positions: [{ positionId: 1, slots: 1 }],
        creatorId: 999_999,
        state: 'cancelled',
        freeSpots: 0,
      });

    expect(res.status).toBe(201);
    expect(res.body.match.creator.id).toBe(session.userId);
    expect(res.body.match.state).toBe('available');
    expect(res.body.match.freeSpots).toBe(1);
  });
});
