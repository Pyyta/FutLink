import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import {
  authenticate,
  requireCompleteProfile,
  requireRole,
} from '../src/middleware/authenticate.js';
import {
  bearer,
  cleanupByPrefix,
  completeProfile,
  makeEmailFactory,
  registerUser,
  uniquePhone,
} from './helpers/auth.js';

const app = createApp();
const nextEmail = makeEmailFactory('profile');

const probe = express();
probe.use(express.json());
probe.get('/protected', authenticate, requireCompleteProfile, (_req, res) => {
  res.status(200).json({ ok: true });
});
probe.get('/admin', authenticate, requireRole('admin'), (_req, res) => {
  res.status(200).json({ ok: true });
});
probe.use(errorHandler);

afterAll(async () => {
  await cleanupByPrefix('profile');
  await closePool();
});

describe('Perfil (RF-02) y autorización por rol', () => {
  it('exige autenticación para /api/me', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('publica el catálogo de posiciones y localidades', async () => {
    const res = await request(app).get('/api/catalog');

    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(4);
    expect(res.body.localities).toHaveLength(20);
    expect(res.headers['cache-control']).toContain('max-age=300');
  });

  it('devuelve el perfil propio sin campos sensibles', async () => {
    const session = await registerUser(app, nextEmail());
    const res = await request(app).get('/api/me').set(bearer(session.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(session.email);
    expect(res.body.user.profileCompleted).toBe(false);
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('valida localidad, posiciones y campos obligatorios', async () => {
    const session = await registerUser(app, nextEmail());

    const badLocality = await completeProfile(app, session.accessToken, {
      locality: 'Localidad Inexistente',
    });
    expect(badLocality.status).toBe(400);
    expect(badLocality.body.error.details).toMatchObject({ field: 'locality' });

    const badPosition = await completeProfile(app, session.accessToken, {
      positionIds: [999_999],
    });
    expect(badPosition.status).toBe(400);
    expect(badPosition.body.error.details).toMatchObject({ field: 'positionIds' });

    const noPositions = await completeProfile(app, session.accessToken, {
      positionIds: [],
    });
    expect(noPositions.status).toBe(400);
    expect(noPositions.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('completa el perfil, normaliza datos y lo marca como completo', async () => {
    const session = await registerUser(app, nextEmail());
    const phone = '300 123 4567';

    const res = await completeProfile(app, session.accessToken, {
      name: '  Ana Pérez  ',
      phone,
      locality: 'suba',
      positionIds: [1, 2],
    });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Ana Pérez',
      phone: '3001234567',
      locality: 'Suba',
      profileCompleted: true,
    });
    expect(res.body.user.positions).toHaveLength(2);
    expect(res.body.user.role).toBe('user');

    const me = await request(app).get('/api/me').set(bearer(session.accessToken));
    expect(me.body.user.profileCompleted).toBe(true);
    expect(me.body.user.phone).toBe('3001234567');
  });

  it('no permite que el usuario cambie su rol o estado desde el perfil', async () => {
    const session = await registerUser(app, nextEmail());
    const res = await request(app)
      .put('/api/me/profile')
      .set(bearer(session.accessToken))
      .send({
        name: 'Jugador Prueba',
        phone: uniquePhone(),
        locality: 'Kennedy',
        positionIds: [1],
        role: 'admin',
        state: 'suspended',
      });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.state).toBe('active');
  });

  it('edita el perfil sin perder la fecha de finalización (RF-03)', async () => {
    const session = await registerUser(app, nextEmail());
    const created = await completeProfile(app, session.accessToken, {
      name: 'Nombre Original',
      locality: 'Suba',
      positionIds: [1, 2],
    });
    expect(created.status).toBe(200);

    const before = await query<{ profile_completed_at: Date }>(
      'SELECT profile_completed_at FROM users WHERE id = $1',
      [session.userId],
    );
    const newPhone = uniquePhone();

    const res = await request(app)
      .put('/api/me/profile')
      .set(bearer(session.accessToken))
      .send({
        name: 'Nombre Editado',
        phone: newPhone,
        locality: 'Kennedy',
        positionIds: [3, 4],
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({
      name: 'Nombre Editado',
      phone: newPhone,
      locality: 'Kennedy',
      profileCompleted: true,
    });
    expect(res.body.user.positions.map((p: { id: number }) => p.id)).toEqual([3, 4]);

    const after = await query<{ profile_completed_at: Date }>(
      'SELECT profile_completed_at FROM users WHERE id = $1',
      [session.userId],
    );
    expect(after.rows[0]?.profile_completed_at.getTime()).toBe(
      before.rows[0]?.profile_completed_at.getTime(),
    );
  });

  it('conserva los datos originales si la edición es inválida (RF-03)', async () => {
    const session = await registerUser(app, nextEmail());
    const original = await completeProfile(app, session.accessToken, {
      name: 'Datos Intactos',
      locality: 'Usaquén',
      positionIds: [1],
    });
    expect(original.status).toBe(200);

    const invalidLocality = await completeProfile(app, session.accessToken, {
      name: 'No Debe Guardarse',
      locality: 'Localidad Inexistente',
      positionIds: [2],
    });
    expect(invalidLocality.status).toBe(400);

    const invalidPositions = await completeProfile(app, session.accessToken, {
      name: 'No Debe Guardarse',
      positionIds: [],
    });
    expect(invalidPositions.status).toBe(400);

    const me = await request(app).get('/api/me').set(bearer(session.accessToken));
    expect(me.body.user).toMatchObject({
      name: 'Datos Intactos',
      locality: 'Usaquén',
    });
    expect(me.body.user.positions.map((p: { id: number }) => p.id)).toEqual([1]);
  });

  it('incluye el promedio de calificaciones en el perfil propio (RF-09)', async () => {
    const session = await registerUser(app, nextEmail());
    await completeProfile(app, session.accessToken);

    await query('INSERT INTO usersratings (player_id, score) VALUES ($1, $2)', [
      session.userId,
      5,
    ]);
    await query('INSERT INTO usersratings (player_id, score) VALUES ($1, $2)', [
      session.userId,
      4,
    ]);
    await query('INSERT INTO usersratings (player_id, score) VALUES ($1, $2)', [
      session.userId,
      4,
    ]);

    const res = await request(app).get('/api/me').set(bearer(session.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.user.rating.count).toBe(3);
    expect(res.body.user.rating.average).toBeCloseTo(4.33, 2);
  });

  it('rechaza un teléfono ya registrado por otra cuenta', async () => {
    const first = await registerUser(app, nextEmail());
    const firstProfile = await completeProfile(app, first.accessToken);
    expect(firstProfile.status).toBe(200);
    const phone = firstProfile.body.user.phone as string;

    const second = await registerUser(app, nextEmail());
    const res = await completeProfile(app, second.accessToken, { phone });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PHONE_IN_USE');
  });

  it('impide el resto de funcionalidades sin perfil completo (RF-02)', async () => {
    const session = await registerUser(app, nextEmail());

    const blocked = await request(probe)
      .get('/protected')
      .set(bearer(session.accessToken));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PROFILE_INCOMPLETE');

    const completed = await completeProfile(app, session.accessToken);
    expect(completed.status).toBe(200);

    const allowed = await request(probe)
      .get('/protected')
      .set(bearer(session.accessToken));
    expect(allowed.status).toBe(200);
  });

  it('requireRole permite solo al rol indicado y lee el rol actual de la BD', async () => {
    const session = await registerUser(app, nextEmail());

    const forbidden = await request(probe)
      .get('/admin')
      .set(bearer(session.accessToken));
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    await query("UPDATE users SET role = 'admin' WHERE id = $1", [session.userId]);

    const allowed = await request(probe)
      .get('/admin')
      .set(bearer(session.accessToken));
    expect(allowed.status).toBe(200);
  });
});
