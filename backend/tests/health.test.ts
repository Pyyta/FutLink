import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool } from '../src/config/db.js';

const app = createApp();

afterAll(async () => {
  await closePool();
});

describe('GET /api/health', () => {
  it('responde 200 con estado de la BD y versión de PostGIS', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('up');
    expect(res.body.postgis).toMatch(/^3\./);
    expect(typeof res.body.now).toBe('string');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('responde 404 uniforme para rutas inexistentes', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(typeof res.body.error.message).toBe('string');
  });

  it('responde 400 uniforme ante JSON inválido', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"roto":');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
