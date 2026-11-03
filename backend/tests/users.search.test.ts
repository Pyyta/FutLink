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

const app = createApp();
const nextEmail = makeEmailFactory('usersearch');

const base = `F6${Date.now()}${process.pid}`;
const name = (prefix: string): string => `${prefix} ${base}`;

let viewer: TestSession;
let alice: TestSession;
let bruno: TestSession;
let carla: TestSession;
let dario: TestSession;
let incomplete: TestSession;
let viewerPhone = '';
const phones: string[] = [];
const emails: string[] = [];

function search(accessToken: string, queryString = '') {
  return request(app).get(`/api/users${queryString}`).set(bearer(accessToken));
}

beforeAll(async () => {
  viewer = await registerUser(app, nextEmail());
  emails.push(viewer.email);
  const viewerProfile = await completeProfile(app, viewer.accessToken, {
    name: name('Z6Visitante'),
    locality: 'Chapinero',
  });
  viewerPhone = viewerProfile.body.user.phone as string;
  phones.push(viewerPhone);

  alice = await registerUser(app, nextEmail());
  emails.push(alice.email);
  const aliceProfile = await completeProfile(app, alice.accessToken, {
    name: name('F6Ana'),
    locality: 'Suba',
    positionIds: [1, 2],
  });
  phones.push(aliceProfile.body.user.phone as string);

  bruno = await registerUser(app, nextEmail());
  emails.push(bruno.email);
  const brunoProfile = await completeProfile(app, bruno.accessToken, {
    name: name('F6Bruno'),
    locality: 'Kennedy',
    positionIds: [3],
  });
  phones.push(brunoProfile.body.user.phone as string);

  carla = await registerUser(app, nextEmail());
  emails.push(carla.email);
  const carlaProfile = await completeProfile(app, carla.accessToken, {
    name: name('F6Carla'),
    locality: 'Suba',
    positionIds: [1],
  });
  phones.push(carlaProfile.body.user.phone as string);

  dario = await registerUser(app, nextEmail());
  emails.push(dario.email);
  const darioProfile = await completeProfile(app, dario.accessToken, {
    name: name('F6Dario'),
    locality: 'Usaquén',
    positionIds: [4],
  });
  phones.push(darioProfile.body.user.phone as string);
  await query(`UPDATE users SET state = 'suspended' WHERE id = $1`, [dario.userId]);

  incomplete = await registerUser(app, nextEmail());
  emails.push(incomplete.email);

  await query(
    `INSERT INTO usersratings (player_id, score, comment)
     VALUES ($1, 5, 'Muy buen partido'), ($1, 4, 'Cumplió')`,
    [alice.userId],
  );
});

afterAll(async () => {
  await cleanupByPrefix('usersearch');
  await closePool();
});

describe('Buscar jugadores (RF-05)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app).get('/api/users');
    expect(anonymous.status).toBe(401);

    const blocked = await search(incomplete.accessToken);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('lista solo cuentas activas con perfil completo y excluye al visitante', async () => {
    const res = await search(viewer.accessToken, `?name=${base}&pageSize=50`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    const ids = (res.body.players as { id: number }[]).map((player) => player.id);

    expect(ids).toContain(alice.userId);
    expect(ids).toContain(bruno.userId);
    expect(ids).toContain(carla.userId);
    expect(ids).not.toContain(dario.userId);
    expect(ids).not.toContain(viewer.userId);
    expect(ids).not.toContain(incomplete.userId);

    const own = await search(viewer.accessToken, `?name=Z6Visitante%20${base}`);
    expect(own.body.total).toBe(0);
  });

  it('filtra por nombre sin distinguir mayúsculas y admite coincidencias parciales', async () => {
    const res = await search(viewer.accessToken, `?name=f6ana%20${base.toLowerCase()}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.players[0]).toMatchObject({
      id: alice.userId,
      name: name('F6Ana'),
      locality: 'Suba',
    });
  });

  it('filtra por zona sin distinguir mayúsculas', async () => {
    const suba = await search(viewer.accessToken, `?name=${base}&locality=suba`);
    expect(suba.body.total).toBe(2);
    expect(
      (suba.body.players as { locality: string }[]).every(
        (player) => player.locality === 'Suba',
      ),
    ).toBe(true);

    const kennedy = await search(viewer.accessToken, `?name=${base}&locality=Kennedy`);
    expect(kennedy.body.total).toBe(1);
    expect(kennedy.body.players[0].id).toBe(bruno.userId);
  });

  it('filtra por posición', async () => {
    const midfielder = await search(
      viewer.accessToken,
      `?name=${base}&positionId=3`,
    );
    expect(midfielder.body.total).toBe(1);
    expect(midfielder.body.players[0].id).toBe(bruno.userId);

    const goalkeeper = await search(
      viewer.accessToken,
      `?name=${base}&positionId=1`,
    );
    expect(goalkeeper.body.total).toBe(2);
    expect(
      (goalkeeper.body.players as { id: number }[])
        .map((player) => player.id)
        .sort((a, b) => a - b),
    ).toEqual([alice.userId, carla.userId].sort((a, b) => a - b));

    const striker = await search(
      viewer.accessToken,
      `?name=${base}&positionId=4`,
    );
    expect(striker.body.total).toBe(0);
  });

  it('pagina y ordena por nombre ascendente', async () => {
    const first = await search(
      viewer.accessToken,
      `?name=${base}&page=1&pageSize=2`,
    );
    expect(first.body).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(first.body.players).toHaveLength(2);

    const second = await search(
      viewer.accessToken,
      `?name=${base}&page=2&pageSize=2`,
    );
    expect(second.body.players).toHaveLength(1);

    const names = [
      ...first.body.players.map((player: { name: string }) => player.name),
      ...second.body.players.map((player: { name: string }) => player.name),
    ];
    expect(names).toEqual([name('F6Ana'), name('F6Bruno'), name('F6Carla')]);
  });

  it('incluye posiciones y promedio de calificación', async () => {
    const res = await search(viewer.accessToken, `?name=F6Ana%20${base}`);

    expect(res.body.players[0]).toMatchObject({
      id: alice.userId,
      positions: [
        { id: 1, title: 'portero' },
        { id: 2, title: 'defensa' },
      ],
      rating: { count: 2 },
    });
    expect(res.body.players[0].rating.average).toBeCloseTo(4.5, 5);

    const noRatings = await search(viewer.accessToken, `?name=F6Bruno%20${base}`);
    expect(noRatings.body.players[0].rating).toEqual({ average: null, count: 0 });
  });

  it('no expone teléfono, correo ni contraseña', async () => {
    const res = await search(viewer.accessToken, `?name=${base}&pageSize=50`);
    const serialized = JSON.stringify(res.body);

    expect(serialized).not.toContain(viewerPhone);
    for (const phone of phones) {
      expect(serialized).not.toContain(phone);
    }
    for (const email of emails) {
      expect(serialized).not.toContain(email);
    }
    expect(serialized).not.toContain('password');

    const player = res.body.players[0] as Record<string, unknown>;
    expect(player).not.toHaveProperty('phone');
    expect(player).not.toHaveProperty('email');
  });

  it('devuelve una lista vacía cuando no hay coincidencias', async () => {
    const res = await search(viewer.accessToken, '?name=zzzzNoExisteF6');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ players: [], total: 0, totalPages: 0 });
  });

  it('valida los filtros y la paginación', async () => {
    const badLocality = await search(viewer.accessToken, '?locality=Inexistente');
    expect(badLocality.status).toBe(400);
    expect(badLocality.body.error.details).toMatchObject({ field: 'locality' });

    const badPosition = await search(viewer.accessToken, '?positionId=999999');
    expect(badPosition.status).toBe(400);
    expect(badPosition.body.error.details).toMatchObject({ field: 'positionId' });

    expect((await search(viewer.accessToken, '?page=0')).status).toBe(400);
    expect((await search(viewer.accessToken, '?pageSize=51')).status).toBe(400);
    expect((await search(viewer.accessToken, '?name=')).status).toBe(400);
    expect((await search(viewer.accessToken, `?name=${'x'.repeat(121)}`)).status).toBe(400);
  });
});
