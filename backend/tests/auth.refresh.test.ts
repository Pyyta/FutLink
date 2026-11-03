import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import { hashToken } from '../src/modules/auth/auth.tokens.js';
import {
  cleanupByPrefix,
  makeEmailFactory,
  registerUser,
} from './helpers/auth.js';

const app = createApp();
const nextEmail = makeEmailFactory('refresh');

afterAll(async () => {
  await cleanupByPrefix('refresh');
  await closePool();
});

describe('POST /api/auth/refresh', () => {
  it('rota el refresh token y entrega un nuevo par', async () => {
    const session = await registerUser(app, nextEmail());

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).not.toBe(session.refreshToken);
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('detecta el reuso y cierra todas las sesiones', async () => {
    const session = await registerUser(app, nextEmail());

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(rotated.status).toBe(200);

    const reuse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    const rotatedTokenAfterReuse = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken });
    expect(rotatedTokenAfterReuse.status).toBe(401);
    expect(rotatedTokenAfterReuse.body.error.code).toBe('REFRESH_REUSED');
  });

  it('logout revoca el refresh token', async () => {
    const session = await registerUser(app, nextEmail());

    const logout = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: session.refreshToken });
    expect(logout.status).toBe(204);

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(res.status).toBe(401);
  });

  it('rechaza tokens desconocidos', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'token-inexistente-de-prueba-1234567890' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });

  it('rechaza tokens expirados', async () => {
    const session = await registerUser(app, nextEmail());
    const expiredToken = 'refresh-expirado-de-prueba-1234567890';

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() - interval '1 minute')`,
      [session.userId, hashToken(expiredToken)],
    );

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: expiredToken });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  });
});
