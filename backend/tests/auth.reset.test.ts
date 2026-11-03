import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import {
  MemoryMailService,
  resetMailService,
  setMailService,
} from '../src/modules/auth/auth.mail.js';
import {
  cleanupByPrefix,
  makeEmailFactory,
  registerUser,
  TEST_PASSWORD,
} from './helpers/auth.js';

const app = createApp();
const nextEmail = makeEmailFactory('reset');
const mailbox = new MemoryMailService();

setMailService(mailbox);

beforeEach(() => {
  mailbox.messages.length = 0;
});

afterAll(async () => {
  resetMailService();
  await cleanupByPrefix('reset');
  await closePool();
});

function extractCode(text: string): string {
  const match = /Tu código de verificación es (\d{6})/.exec(text);
  if (!match?.[1]) {
    throw new Error(`No se encontró el código en el correo: ${text}`);
  }
  return match[1];
}

async function requestCode(email: string): Promise<string> {
  const res = await request(app).post('/api/auth/forgot-password').send({ email });
  expect(res.status).toBe(200);
  const message = mailbox.messages.at(-1);
  if (!message) {
    throw new Error('No se envió correo de recuperación');
  }
  return extractCode(message.text);
}

describe('Recuperación de contraseña (RNF-05)', () => {
  it('responde lo mismo exista o no el correo y no envía correo a desconocidos', async () => {
    const existing = nextEmail();
    await registerUser(app, existing);

    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: existing });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: nextEmail() });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
    expect(mailbox.messages).toHaveLength(1);
    expect(mailbox.messages[0]?.to).toBe(existing);
  });

  it('envía un código de 6 dígitos y permite restablecerla una sola vez', async () => {
    const email = nextEmail();
    const session = await registerUser(app, email);
    const code = await requestCode(email);
    const newPassword = 'NuevaClave456';

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code, newPassword });
    expect(reset.status).toBe(200);

    const reuse = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'OtraClave789' });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('INVALID_RESET_CODE');

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email, password: newPassword });
    expect(newLogin.status).toBe(200);

    const oldSession = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: session.refreshToken });
    expect(oldSession.status).toBe(401);
  });

  it('limita los intentos fallidos e invalida el código al agotarlos', async () => {
    const email = nextEmail();
    await registerUser(app, email);
    const code = await requestCode(email);
    const wrongCode = code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email, code: wrongCode, newPassword: 'ClaveInvalida1' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_RESET_CODE');
    }

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'ClaveValida123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_CODE');
  });

  it('rechaza códigos expirados', async () => {
    const email = nextEmail();
    const session = await registerUser(app, email);
    const code = await requestCode(email);

    await query(
      `UPDATE password_reset_codes
       SET expires_at = now() - interval '1 minute'
       WHERE user_id = $1 AND used_at IS NULL`,
      [session.userId],
    );

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code, newPassword: 'ClaveValida123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_CODE');
  });

  it('invalida el código anterior al solicitar uno nuevo', async () => {
    const email = nextEmail();
    await registerUser(app, email);
    const firstCode = await requestCode(email);
    const secondCode = await requestCode(email);

    if (firstCode === secondCode) {
      return;
    }

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email, code: firstCode, newPassword: 'ClaveValida123' });
    expect(res.status).toBe(400);
  });

  it('exige un código de 6 dígitos', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: nextEmail(), code: '123', newPassword: 'ClaveValida123' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
