import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import {
  cleanupByPrefix,
  makeEmailFactory,
  registerUser,
  TEST_PASSWORD,
} from './helpers/auth.js';

const app = createApp();
const nextEmail = makeEmailFactory('register');

afterAll(async () => {
  await cleanupByPrefix('register');
  await closePool();
});

describe('POST /api/auth/register (RF-01)', () => {
  it('crea la cuenta, inicia sesión y devuelve un perfil incompleto', async () => {
    const email = nextEmail();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: TEST_PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.tokenType).toBe('Bearer');
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.expiresIn).toBeGreaterThan(0);
    expect(res.body.user).toMatchObject({
      email,
      name: null,
      phone: null,
      locality: null,
      role: 'user',
      state: 'active',
      profileCompleted: false,
      positions: [],
    });
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('guarda la contraseña con bcrypt y nunca en texto plano (RNF-04)', async () => {
    const email = nextEmail();
    await registerUser(app, email);

    const stored = await query<{ password: string }>(
      'SELECT password FROM users WHERE email = $1',
      [email],
    );

    expect(stored.rows[0]?.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(stored.rows[0]?.password).not.toBe(TEST_PASSWORD);
  });

  it('rechaza un correo ya registrado sin distinguir mayúsculas', async () => {
    const email = nextEmail();
    await registerUser(app, email);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: TEST_PASSWORD });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('valida correo y contraseña', async () => {
    const invalidEmail = await request(app)
      .post('/api/auth/register')
      .send({ email: 'no-es-un-correo', password: TEST_PASSWORD });
    expect(invalidEmail.status).toBe(400);
    expect(invalidEmail.body.error.code).toBe('VALIDATION_ERROR');

    const shortPassword = await request(app)
      .post('/api/auth/register')
      .send({ email: nextEmail(), password: 'corta' });
    expect(shortPassword.status).toBe(400);
    expect(shortPassword.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rechaza contraseñas que superan 72 bytes (límite de bcrypt)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: nextEmail(), password: 'á'.repeat(40) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('ignora campos no permitidos como role o state', async () => {
    const email = nextEmail();
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'admin',
        state: 'suspended',
      });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.state).toBe('active');
  });
});
