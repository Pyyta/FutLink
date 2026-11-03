import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  listRequests,
  sendMatchRequest,
  sendPlayerRequest,
} from './helpers/requests.js';

const app = createApp();
const nextEmail = makeEmailFactory('reqlist');

let organizer: TestSession;
let first: TestSession;
let second: TestSession;
let third: TestSession;
let stranger: TestSession;
let matchId = 0;
let firstMatchRequestId = 0;
let secondMatchRequestId = 0;
let thirdMatchRequestId = 0;
let firstPlayerRequestId = 0;
let thirdPlayerRequestId = 0;

async function newCompleteUser(name: string): Promise<TestSession> {
  const session = await registerUser(app, nextEmail());
  const profile = await completeProfile(app, session.accessToken, { name });

  if (profile.status !== 200) {
    throw new Error(`No se pudo completar el perfil: ${JSON.stringify(profile.body)}`);
  }

  return session;
}

beforeAll(async () => {
  organizer = await newCompleteUser('Organizador');
  first = await newCompleteUser('Uno');
  second = await newCompleteUser('Dos');
  third = await newCompleteUser('Tres');
  stranger = await newCompleteUser('Ajeno');

  const match = await createMatchWithVacancies(app, organizer.accessToken, 2);
  matchId = match.matchId;
  const [firstVacancy, secondVacancy] = match.vacancies;
  if (!firstVacancy || !secondVacancy) {
    throw new Error('El partido no tiene dos vacantes');
  }

  const firstRequest = await sendMatchRequest(
    app,
    first.accessToken,
    firstVacancy.id,
  );
  firstMatchRequestId = firstRequest.body.request.id as number;

  const secondRequest = await sendMatchRequest(
    app,
    second.accessToken,
    secondVacancy.id,
  );
  secondMatchRequestId = secondRequest.body.request.id as number;

  await actOnRequest(
    app,
    organizer.accessToken,
    secondMatchRequestId,
    'reject',
  ).expect(200);

  const thirdRequest = await sendMatchRequest(
    app,
    third.accessToken,
    secondVacancy.id,
  );
  thirdMatchRequestId = thirdRequest.body.request.id as number;

  await actOnRequest(
    app,
    organizer.accessToken,
    firstMatchRequestId,
    'accept',
  ).expect(200);

  const firstPlayerRequest = await sendPlayerRequest(
    app,
    first.accessToken,
    second.userId,
  );
  firstPlayerRequestId = firstPlayerRequest.body.request.id as number;

  const thirdPlayerRequest = await sendPlayerRequest(
    app,
    third.accessToken,
    organizer.userId,
  );
  thirdPlayerRequestId = thirdPlayerRequest.body.request.id as number;
});

afterAll(async () => {
  await cleanupByPrefix('reqlist');
  await closePool();
});

describe('GET /api/requests (Administrar solicitudes)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app).get('/api/requests');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const incomplete = await registerUser(app, nextEmail());
    const blocked = await listRequests(app, incomplete.accessToken);

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('separa las solicitudes recibidas de partidos', async () => {
    const res = await listRequests(
      app,
      organizer.accessToken,
      '?box=received&type=match',
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.totalPages).toBe(1);

    const requests = res.body.requests as {
      id: number;
      state: string;
      direction: string;
      canRespond: boolean;
      canCancel: boolean;
      sender: { id: number };
      receiver: { id: number };
      match: { id: number; position: string } | null;
    }[];

    expect(requests.map((item) => item.id)).toEqual([
      thirdMatchRequestId,
      firstMatchRequestId,
      secondMatchRequestId,
    ]);
    expect(requests.map((item) => item.state)).toEqual([
      'pending',
      'accepted',
      'rejected',
    ]);
    expect(requests.every((item) => item.direction === 'received')).toBe(true);
    expect(requests.every((item) => item.receiver.id === organizer.userId)).toBe(
      true,
    );
    expect(requests[0]?.canRespond).toBe(true);
    expect(requests.every((item) => item.canCancel === false)).toBe(true);
    expect(requests.every((item) => item.match?.id === matchId)).toBe(true);
  });

  it('separa las solicitudes recibidas de jugadores', async () => {
    const res = await listRequests(
      app,
      organizer.accessToken,
      '?box=received&type=player',
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.requests[0]).toMatchObject({
      id: thirdPlayerRequestId,
      type: 'player',
      state: 'pending',
      direction: 'received',
      canRespond: true,
      canCancel: false,
      sender: { id: third.userId },
      receiver: { id: organizer.userId },
      match: null,
    });
  });

  it('lista las solicitudes enviadas con sus permisos', async () => {
    const matchRes = await listRequests(
      app,
      first.accessToken,
      '?box=sent&type=match',
    );

    expect(matchRes.status).toBe(200);
    expect(matchRes.body.total).toBe(1);
    expect(matchRes.body.requests[0]).toMatchObject({
      id: firstMatchRequestId,
      type: 'match',
      state: 'accepted',
      direction: 'sent',
      canRespond: false,
      canCancel: true,
      receiver: { id: organizer.userId },
    });

    const playerRes = await listRequests(
      app,
      first.accessToken,
      '?box=sent&type=player',
    );

    expect(playerRes.status).toBe(200);
    expect(playerRes.body.requests[0]).toMatchObject({
      id: firstPlayerRequestId,
      type: 'player',
      state: 'pending',
      direction: 'sent',
      canCancel: true,
      receiver: { id: second.userId },
      match: null,
    });
  });

  it('filtra por estado', async () => {
    const res = await listRequests(
      app,
      organizer.accessToken,
      '?box=received&type=match&state=accepted',
    );

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.requests[0]?.id).toBe(firstMatchRequestId);
  });

  it('pagina las solicitudes recibidas', async () => {
    const pageOne = await listRequests(
      app,
      organizer.accessToken,
      '?box=received&type=match&page=1&pageSize=2',
    );
    expect(pageOne.status).toBe(200);
    expect(pageOne.body).toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
    });
    expect(pageOne.body.requests).toHaveLength(2);

    const pageTwo = await listRequests(
      app,
      organizer.accessToken,
      '?box=received&type=match&page=2&pageSize=2',
    );
    expect(pageTwo.status).toBe(200);
    expect(pageTwo.body.requests).toHaveLength(1);
    expect(pageTwo.body.requests[0]?.id).toBe(secondMatchRequestId);
  });

  it('usa la bandeja de recibidas por defecto y devuelve listas vacías', async () => {
    const received = await listRequests(app, second.accessToken);

    expect(received.status).toBe(200);
    expect(received.body.total).toBe(1);
    expect(received.body.requests[0]).toMatchObject({
      id: firstPlayerRequestId,
      direction: 'received',
    });

    const empty = await listRequests(app, stranger.accessToken);
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({
      requests: [],
      total: 0,
      totalPages: 0,
    });
  });

  it('no expone correo ni teléfono de las partes', async () => {
    const res = await listRequests(app, organizer.accessToken, '?box=received');

    expect(res.status).toBe(200);

    const users = await query<{ email: string; phone: string }>(
      `SELECT email, phone
       FROM users
       WHERE id = ANY($1::int[])`,
      [[organizer.userId, first.userId, second.userId, third.userId]],
    );

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('"phone"');
    expect(payload).not.toContain('"email"');
    for (const row of users.rows) {
      expect(payload).not.toContain(row.email);
      if (row.phone) {
        expect(payload).not.toContain(row.phone);
      }
    }
  });

  it('valida los filtros de la consulta', async () => {
    const badBox = await listRequests(app, organizer.accessToken, '?box=other');
    expect(badBox.status).toBe(400);
    expect(badBox.body.error.code).toBe('VALIDATION_ERROR');

    const badType = await listRequests(app, organizer.accessToken, '?type=other');
    expect(badType.status).toBe(400);

    const badState = await listRequests(
      app,
      organizer.accessToken,
      '?state=declined',
    );
    expect(badState.status).toBe(400);
  });
});
