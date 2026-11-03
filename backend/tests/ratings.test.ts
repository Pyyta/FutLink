import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
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
const nextEmail = makeEmailFactory('ratings');
const REQUIRE_ACCEPTED_REQUEST = 'ratings.require_accepted_request';

const nameBase = `R8${Date.now()}${process.pid}`;
let nameCounter = 0;

function nextName(label: string): string {
  nameCounter += 1;
  return `${nameBase}${label}${nameCounter}`;
}

interface PlayerSession extends TestSession {
  name: string;
  phone: string;
}

async function createPlayer(label: string): Promise<PlayerSession> {
  const session = await registerUser(app, nextEmail());
  const name = nextName(label);
  const profile = await completeProfile(app, session.accessToken, { name });

  if (profile.status !== 200) {
    throw new Error(
      `No se pudo completar el perfil (${profile.status}): ${JSON.stringify(profile.body)}`,
    );
  }

  return {
    ...session,
    name,
    phone: profile.body.user.phone as string,
  };
}

function rate(
  session: TestSession,
  targetId: number,
  body: Record<string, unknown>,
): request.Test {
  return request(app)
    .put(`/api/users/${targetId}/rating`)
    .set(bearer(session.accessToken))
    .send(body);
}

function getProfile(
  viewer: TestSession,
  targetId: number,
): request.Test {
  return request(app)
    .get(`/api/users/${targetId}`)
    .set(bearer(viewer.accessToken));
}

async function countPair(authorId: number, playerId: number): Promise<number> {
  const result = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM usersratings
     WHERE author_id = $1 AND player_id = $2`,
    [authorId, playerId],
  );

  return result.rows[0]?.total ?? 0;
}

afterAll(async () => {
  await query(
    `UPDATE systemsettings
     SET value = 'false'::jsonb, updated_at = now()
     WHERE key = $1`,
    [REQUIRE_ACCEPTED_REQUEST],
  );
  await cleanupByPrefix('ratings');
  await closePool();
});

describe('PUT /api/users/:id/rating (RF-10)', () => {
  it('exige autenticación y perfil completo', async () => {
    const anonymous = await request(app)
      .put('/api/users/1/rating')
      .send({ score: 5 });

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('AUTH_REQUIRED');

    const incomplete = await registerUser(app, nextEmail());
    const target = await createPlayer('objetivo');

    const blocked = await rate(incomplete, target.userId, { score: 5 });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');
    expect(await countPair(incomplete.userId, target.userId)).toBe(0);
  });

  it('crea la calificación, recalcula el promedio y la expone con autor', async () => {
    const author = await createPlayer('autora');
    const target = await createPlayer('calificado');

    const res = await rate(author, target.userId, {
      score: 5,
      comment: '  Excelente partido  ',
    });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.rating).toMatchObject({
      score: 5,
      comment: 'Excelente partido',
    });
    expect(res.body.rating.id).toBeTypeOf('number');
    expect(res.body.rating.createdAt).toBeTypeOf('string');
    expect(res.body.rating.updatedAt).toBeTypeOf('string');
    expect(res.body.summary).toEqual({ average: 5, count: 1 });

    const profileRes = await getProfile(author, target.userId);
    expect(profileRes.status).toBe(200);
    expect(profileRes.body.profile.rating).toEqual({ average: 5, count: 1 });
    expect(profileRes.body.profile.comments).toHaveLength(1);
    expect(profileRes.body.profile.comments[0]).toMatchObject({
      score: 5,
      comment: 'Excelente partido',
      author: { id: author.userId, name: author.name },
    });
    expect(profileRes.body.profile.comments[0].author).not.toHaveProperty(
      'email',
    );
    expect(profileRes.body.profile.comments[0].author).not.toHaveProperty(
      'phone',
    );
    expect(profileRes.body.profile.myRating).toMatchObject({
      score: 5,
      comment: 'Excelente partido',
    });

    const serialized = JSON.stringify(profileRes.body);
    expect(serialized).not.toContain(author.email);
    expect(serialized).not.toContain(author.phone);
    expect(serialized).not.toContain(target.phone);
  });

  it('actualiza la calificación del mismo autor sin duplicados (upsert)', async () => {
    const author = await createPlayer('upsert-autor');
    const target = await createPlayer('upsert-objetivo');

    const first = await rate(author, target.userId, {
      score: 5,
      comment: 'Primera',
    });
    expect(first.status).toBe(200);
    const firstCreatedAt = first.body.rating.createdAt as string;

    const second = await rate(author, target.userId, {
      score: 2,
      comment: 'Segunda',
    });

    expect(second.status).toBe(200);
    expect(second.body.rating.id).toBe(first.body.rating.id);
    expect(second.body.rating.createdAt).toBe(firstCreatedAt);
    expect(second.body.rating).toMatchObject({ score: 2, comment: 'Segunda' });
    expect(second.body.summary).toEqual({ average: 2, count: 1 });
    expect(await countPair(author.userId, target.userId)).toBe(1);

    const profileRes = await getProfile(author, target.userId);
    expect(profileRes.body.profile.rating).toEqual({ average: 2, count: 1 });
    expect(profileRes.body.profile.comments).toHaveLength(1);
    expect(profileRes.body.profile.comments[0]).toMatchObject({
      score: 2,
      comment: 'Segunda',
    });
  });

  it('promedia entre autores y cada visitante ve solo su propia calificación', async () => {
    const target = await createPlayer('promedio-objetivo');
    const first = await createPlayer('promedio-uno');
    const second = await createPlayer('promedio-dos');

    expect(
      (await rate(first, target.userId, { score: 5, comment: 'Cinco' })).status,
    ).toBe(200);
    expect(
      (await rate(second, target.userId, { score: 4, comment: 'Cuatro' })).status,
    ).toBe(200);

    const firstView = await getProfile(first, target.userId);
    expect(firstView.body.profile.rating).toEqual({ average: 4.5, count: 2 });
    expect(firstView.body.profile.comments).toHaveLength(2);
    expect(firstView.body.profile.myRating).toMatchObject({ score: 5 });

    const secondView = await getProfile(second, target.userId);
    expect(secondView.body.profile.myRating).toMatchObject({ score: 4 });

    const outsider = await createPlayer('promedio-tres');
    const outsiderView = await getProfile(outsider, target.userId);
    expect(outsiderView.body.profile.myRating).toBeNull();
    expect(outsiderView.body.profile.rating).toEqual({ average: 4.5, count: 2 });

    const search = await request(app)
      .get('/api/users')
      .query({ name: target.name })
      .set(bearer(outsider.accessToken));

    expect(search.status).toBe(200);
    const found = (
      search.body.players as {
        id: number;
        rating: { average: number | null; count: number };
      }[]
    ).find((player) => player.id === target.userId);
    expect(found?.rating).toEqual({ average: 4.5, count: 2 });
  });

  it('prohíbe la autocalificación', async () => {
    const player = await createPlayer('auto');

    const res = await rate(player, player.userId, {
      score: 5,
      comment: 'Yo mismo',
    });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_RATING_NOT_ALLOWED');
    expect(await countPair(player.userId, player.userId)).toBe(0);

    const ownProfile = await getProfile(player, player.userId);
    expect(ownProfile.body.profile.myRating).toBeNull();
  });

  it('valida la puntuación y la longitud del comentario', async () => {
    const author = await createPlayer('validacion');
    const target = await createPlayer('validacion-objetivo');

    for (const score of [0, 6, 2.5, '5', null, undefined]) {
      const res = await rate(author, target.userId, { score });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    const tooLong = await rate(author, target.userId, {
      score: 4,
      comment: 'a'.repeat(241),
    });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.code).toBe('VALIDATION_ERROR');

    const maxLength = await rate(author, target.userId, {
      score: 4,
      comment: 'b'.repeat(240),
    });
    expect(maxLength.status).toBe(200);
    expect((maxLength.body.rating.comment as string).length).toBe(240);

    const withoutComment = await rate(author, target.userId, { score: 3 });
    expect(withoutComment.status).toBe(200);
    expect(withoutComment.body.rating.comment).toBeNull();

    const blankComment = await rate(author, target.userId, {
      score: 3,
      comment: '   ',
    });
    expect(blankComment.status).toBe(200);
    expect(blankComment.body.rating.comment).toBeNull();
    expect(await countPair(author.userId, target.userId)).toBe(1);
  });

  it('no permite calificar cuentas inexistentes o inactivas', async () => {
    const author = await createPlayer('inactivo-autor');

    const missing = await rate(author, 999_999, { score: 5 });
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');

    const suspended = await createPlayer('inactivo-objetivo');
    await query("UPDATE users SET state = 'suspended' WHERE id = $1", [
      suspended.userId,
    ]);

    const inactive = await rate(author, suspended.userId, { score: 5 });
    expect(inactive.status).toBe(404);
    expect(inactive.body.error.code).toBe('USER_NOT_FOUND');
    expect(await countPair(author.userId, suspended.userId)).toBe(0);

    const invalidId = await request(app)
      .put('/api/users/abc/rating')
      .set(bearer(author.accessToken))
      .send({ score: 5 });
    expect(invalidId.status).toBe(400);
    expect(invalidId.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('puede exigir una solicitud aceptada previa según configuración', async () => {
    const author = await createPlayer('config-autor');
    const target = await createPlayer('config-objetivo');

    await query(
      `UPDATE systemsettings
       SET value = 'true'::jsonb, updated_at = now()
       WHERE key = $1`,
      [REQUIRE_ACCEPTED_REQUEST],
    );

    try {
      const blocked = await rate(author, target.userId, { score: 5 });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error.code).toBe('RATING_REQUIRES_ACCEPTED_REQUEST');
      expect(await countPair(author.userId, target.userId)).toBe(0);

      await query(
        `INSERT INTO requests
           (request_type, sender_id, receiver_id, target_user_id, state)
         VALUES ('player', $1, $2, $2, 'accepted')`,
        [author.userId, target.userId],
      );

      const allowed = await rate(author, target.userId, { score: 5 });
      expect(allowed.status).toBe(200);
      expect(allowed.body.summary).toEqual({ average: 5, count: 1 });
    } finally {
      await query(
        `UPDATE systemsettings
         SET value = 'false'::jsonb, updated_at = now()
         WHERE key = $1`,
        [REQUIRE_ACCEPTED_REQUEST],
      );
    }
  });

  it('no duplica la calificación ante envíos concurrentes del mismo autor', async () => {
    const author = await createPlayer('concurrente-autor');
    const target = await createPlayer('concurrente-objetivo');

    const [first, second] = await Promise.all([
      rate(author, target.userId, { score: 4, comment: 'Cuatro' }),
      rate(author, target.userId, { score: 5, comment: 'Cinco' }),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await countPair(author.userId, target.userId)).toBe(1);

    const profileRes = await getProfile(author, target.userId);
    expect(profileRes.body.profile.rating.count).toBe(1);
    expect([4, 5]).toContain(profileRes.body.profile.rating.average);
  });

  it('conserva y muestra comentarios heredados sin autor', async () => {
    const viewer = await createPlayer('legado-visor');
    const target = await createPlayer('legado-objetivo');

    await query(
      `INSERT INTO usersratings (player_id, score, comment)
       VALUES ($1, 4, 'Comentario heredado')`,
      [target.userId],
    );

    const res = await getProfile(viewer, target.userId);

    expect(res.status).toBe(200);
    expect(res.body.profile.rating).toEqual({ average: 4, count: 1 });
    expect(res.body.profile.comments[0]).toMatchObject({
      score: 4,
      comment: 'Comentario heredado',
      author: null,
    });
    expect(res.body.profile.myRating).toBeNull();
  });
});
