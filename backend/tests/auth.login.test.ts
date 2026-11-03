import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import {
  bearer,
  cleanupByPrefix,
  makeEmailFactory,
  registerUser,
  TEST_PASSWORD,
} from './helpers/auth.js';

const app = createApp();
const nextEmail = makeEmailFactory('login');

afterAll(async () => {
  await cleanupByPrefix('login');
  await closePool();
});

describe('POST /api/auth/login (RF-01)', () => {
  it('inicia sesión con credenciales correctas', async () => {
    const email = nextEmail();
    await registerUser(app, email);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.user.email).toBe(email);
  });

  it('usa el mismo mensaje para contraseña incorrecta y correo inexistente', async () => {
    const email = nextEmail();
    await registerUser(app, email);

    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'OtraClave123' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: nextEmail(), password: TEST_PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('bloquea cuentas suspendidas (RF-11)', async () => {
    const email = nextEmail();
    await registerUser(app, email);
    await query("UPDATE users SET state = 'suspended' WHERE email = $1", [email]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('invalida de inmediato un access token de una cuenta suspendida', async () => {
    const email = nextEmail();
    const session = await registerUser(app, email);

    const before = await request(app)
      .get('/api/me')
      .set(bearer(session.accessToken));
    expect(before.status).toBe(200);

    await query("UPDATE users SET state = 'suspended' WHERE email = $1", [email]);

    const after = await request(app)
      .get('/api/me')
      .set(bearer(session.accessToken));
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('ACCOUNT_INACTIVE');
  });

  it('no revela que una cuenta eliminada existe', async () => {
    const email = nextEmail();
    await registerUser(app, email);
    await query("UPDATE users SET state = 'deleted' WHERE email = $1", [email]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('valida el cuerpo de la petición', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: nextEmail() });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
