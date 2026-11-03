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
import type { PublishMatchOverrides } from './helpers/matches.js';

const app = createApp();
const nextEmail = makeEmailFactory('matchsearch');

let organizer: TestSession;
let viewer: TestSession;
let organizerPhone = '';
const fixtures = new Map<string, { id: number; matchDate: string }>();

function fixtureId(key: string): number {
  const fixture = fixtures.get(key);
  if (!fixture) {
    throw new Error(`Falta el fixture ${key}`);
  }
  return fixture.id;
}

async function createFixture(
  key: string,
  overrides: PublishMatchOverrides,
): Promise<void> {
  const res = await publishMatch(app, organizer.accessToken, overrides);
  if (res.status !== 201) {
    throw new Error(`No se pudo crear ${key}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  fixtures.set(key, { id: res.body.match.id, matchDate: res.body.match.matchDate });
}

beforeAll(async () => {
  organizer = await registerUser(app, nextEmail());
  const organizerProfile = await completeProfile(app, organizer.accessToken);
  organizerPhone = organizerProfile.body.user.phone as string;

  viewer = await registerUser(app, nextEmail());
  await completeProfile(app, viewer.accessToken);

  await createFixture('m1', {
    matchDate: '2031-04-01T19:00:00-05:00',
    locality: 'Suba',
    positions: [
      { positionId: 1, slots: 2 },
      { positionId: 2, slots: 1 },
    ],
  });
  await createFixture('m2', {
    matchDate: '2031-04-02T19:00:00-05:00',
    locality: 'Kennedy',
    positions: [{ positionId: 3, slots: 1 }],
  });
  await createFixture('m3', {
    matchDate: '2031-04-03T19:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m4', {
    matchDate: '2031-04-04T19:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m5', {
    matchDate: '2031-04-05T19:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m6', {
    matchDate: '2031-04-06T19:00:00-05:00',
    latitude: 4.711,
    longitude: -74.0721,
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m7', {
    matchDate: '2031-04-06T19:00:00-05:00',
    latitude: 4.8,
    longitude: -74.2,
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m8', {
    matchDate: '2031-04-06T19:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m9a', {
    matchDate: '2031-04-07T18:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m9b', {
    matchDate: '2031-04-07T19:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m9c', {
    matchDate: '2031-04-07T20:00:00-05:00',
    positions: [{ positionId: 1, slots: 1 }],
  });
  await createFixture('m10', {
    matchDate: '2031-04-08T19:00:00-05:00',
    positions: [
      { positionId: 1, slots: 1 },
      { positionId: 3, slots: 1 },
    ],
  });
  await createFixture('m11', {
    matchDate: '2031-04-09T19:00:00-05:00',
    positions: [{ positionId: 1, slots: 3 }],
  });

  const cancelled = await request(app)
    .patch(`/api/matches/${fixtureId('m3')}/cancel`)
    .set(bearer(organizer.accessToken));
  if (cancelled.status !== 200) {
    throw new Error('No se pudo cancelar el fixture m3');
  }

  await query('UPDATE matchvacants SET occupied = true WHERE match_id = $1', [
    fixtureId('m4'),
  ]);
  await query('UPDATE matchs SET match_date = $2 WHERE id = $1', [
    fixtureId('m5'),
    '2020-01-01T19:00:00-05:00',
  ]);
  await query(
    `UPDATE matchvacants
     SET occupied = true
     WHERE match_id = $1 AND position = 'portero'`,
    [fixtureId('m10')],
  );
  await query(
    `UPDATE matchvacants
     SET occupied = true
     WHERE id = (
       SELECT id FROM matchvacants WHERE match_id = $1 ORDER BY id LIMIT 1
     )`,
    [fixtureId('m11')],
  );
});

afterAll(async () => {
  await cleanupByPrefix('matchsearch');
  await closePool();
});

function search(accessToken: string, queryString = '') {
  return request(app).get(`/api/matches${queryString}`).set(bearer(accessToken));
}

describe('Buscar partidos (RF-04)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app).get('/api/matches');
    expect(anonymous.status).toBe(401);

    const incomplete = await registerUser(app, nextEmail());
    const blocked = await search(incomplete.accessToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('excluye partidos cancelados, llenos y pasados', async () => {
    expect((await search(viewer.accessToken, '?date=2031-04-03')).body.total).toBe(0);
    expect((await search(viewer.accessToken, '?date=2031-04-04')).body.total).toBe(0);

    const all = await search(viewer.accessToken, '?pageSize=50');
    const ids = (all.body.matches as { id: number }[]).map((match) => match.id);

    expect(ids).not.toContain(fixtureId('m3'));
    expect(ids).not.toContain(fixtureId('m4'));
    expect(ids).not.toContain(fixtureId('m5'));
    expect(ids).toContain(fixtureId('m1'));
    expect(ids).toContain(fixtureId('m2'));
  });

  it('filtra por zona sin distinguir mayúsculas', async () => {
    const suba = await search(viewer.accessToken, '?date=2031-04-01&locality=suba');
    expect(suba.status).toBe(200);
    expect(suba.body.total).toBe(1);
    expect(suba.body.matches[0].id).toBe(fixtureId('m1'));
    expect(suba.body.matches[0].locality).toBe('Suba');
    expect(suba.body.matches[0].isOwner).toBe(false);

    const kennedy = await search(
      viewer.accessToken,
      '?date=2031-04-01&locality=Kennedy',
    );
    expect(kennedy.body.total).toBe(0);

    const own = await search(organizer.accessToken, '?date=2031-04-01');
    expect(own.body.matches[0].isOwner).toBe(true);
  });

  it('filtra por fecha usando el día calendario de Bogotá', async () => {
    const res = await search(viewer.accessToken, '?date=2031-04-02');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.matches[0].id).toBe(fixtureId('m2'));
    expect(res.body.matches[0].locality).toBe('Kennedy');
  });

  it('filtra por posición solo si queda una plaza libre', async () => {
    const occupied = await search(
      viewer.accessToken,
      '?date=2031-04-08&positionId=1',
    );
    expect(occupied.body.total).toBe(0);

    const free = await search(viewer.accessToken, '?date=2031-04-08&positionId=3');
    expect(free.body.total).toBe(1);
    expect(free.body.matches[0].id).toBe(fixtureId('m10'));
  });

  it('pagina los resultados y calcula el total', async () => {
    const first = await search(
      viewer.accessToken,
      '?date=2031-04-07&page=1&pageSize=2',
    );
    expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(first.body.matches).toHaveLength(2);

    const second = await search(
      viewer.accessToken,
      '?date=2031-04-07&page=2&pageSize=2',
    );
    expect(second.body.matches).toHaveLength(1);

    const ids = [
      ...first.body.matches.map((match: { id: number }) => match.id),
      ...second.body.matches.map((match: { id: number }) => match.id),
    ];
    expect(new Set(ids).size).toBe(3);
  });

  it('ordena por fecha ascendente cuando no hay coordenadas', async () => {
    const res = await search(viewer.accessToken, '?pageSize=50');
    const ownDates = (
      res.body.matches as { id: number; matchDate: string }[]
    )
      .filter((match) => [...fixtures.values()].some((fixture) => fixture.id === match.id))
      .map((match) => match.matchDate);

    const sorted = [...ownDates].sort();
    expect(ownDates).toEqual(sorted);
  });

  it('ordena por cercanía usando PostGIS y deja al final los partidos sin ubicación', async () => {
    const res = await search(
      viewer.accessToken,
      '?date=2031-04-06&latitude=4.711&longitude=-74.0721',
    );

    expect(res.status).toBe(200);
    expect(res.body.matches.map((match: { id: number }) => match.id)).toEqual([
      fixtureId('m6'),
      fixtureId('m7'),
      fixtureId('m8'),
    ]);

    const [near, far, withoutLocation] = res.body.matches as {
      distanceMeters: number | null;
    }[];
    expect(near?.distanceMeters).toBe(0);
    expect(far?.distanceMeters).toBeGreaterThan(1000);
    expect(withoutLocation?.distanceMeters).toBeNull();
  });

  it('calcula plazas libres y posiciones agrupadas', async () => {
    const res = await search(viewer.accessToken, '?date=2031-04-09');

    expect(res.body.matches[0]).toMatchObject({
      totalSpots: 3,
      freeSpots: 2,
      positions: [
        { positionId: 1, position: 'portero', slots: 3, freeSlots: 2 },
      ],
    });
  });

  it('no expone teléfono ni correo del organizador', async () => {
    const res = await search(viewer.accessToken, '?date=2031-04-01');
    const serialized = JSON.stringify(res.body);

    expect(serialized).not.toContain(organizer.email);
    expect(serialized).not.toContain(organizerPhone);
    expect(res.body.matches[0].creator).not.toHaveProperty('phone');
    expect(res.body.matches[0].creator).not.toHaveProperty('email');
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    const res = await search(viewer.accessToken, '?date=2035-12-31');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ matches: [], total: 0, totalPages: 0 });
  });

  it('valida los filtros opcionales', async () => {
    const badLocality = await search(viewer.accessToken, '?locality=Inexistente');
    expect(badLocality.status).toBe(400);
    expect(badLocality.body.error.details).toMatchObject({ field: 'locality' });

    const badPosition = await search(viewer.accessToken, '?positionId=999999');
    expect(badPosition.status).toBe(400);

    const badDate = await search(viewer.accessToken, '?date=2031-13-40');
    expect(badDate.status).toBe(400);

    expect((await search(viewer.accessToken, '?page=0')).status).toBe(400);
    expect((await search(viewer.accessToken, '?pageSize=51')).status).toBe(400);
    expect((await search(viewer.accessToken, '?latitude=4.711')).status).toBe(400);
  });
});
