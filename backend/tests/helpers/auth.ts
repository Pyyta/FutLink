import type { Express } from 'express';
import request from 'supertest';
import { query } from '../../src/config/db.js';

export const TEST_PASSWORD = 'Futbol1234';

export interface TestSession {
  email: string;
  password: string;
  userId: number;
  accessToken: string;
  refreshToken: string;
}

export function makeEmailFactory(prefix: string): () => string {
  const base = `${prefix}.${Date.now()}.${process.pid}`;
  let counter = 0;
  return () => {
    counter += 1;
    return `test.${base}.${counter}@example.com`;
  };
}

export async function cleanupByPrefix(prefix: string): Promise<void> {
  const pattern = `test.${prefix}.%@example.com`;

  // Las FKs usan ON DELETE CASCADE / SET NULL, pero se limpian primero las
  // notificaciones y solicitudes de los usuarios de prueba para no depender del
  // orden de borrado.
  await query(
    `DELETE FROM notifications
     WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
        OR actor_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [pattern],
  );
  await query(
    `DELETE FROM requests
     WHERE sender_id IN (SELECT id FROM users WHERE email LIKE $1)
        OR receiver_id IN (SELECT id FROM users WHERE email LIKE $1)`,
    [pattern],
  );
  await query(
    `DELETE FROM generatedreports
     WHERE generated_by IN (SELECT id FROM users WHERE email LIKE $1)`,
    [pattern],
  );
  await query('DELETE FROM users WHERE email LIKE $1', [pattern]);
}

export async function promoteToAdmin(userId: number): Promise<void> {
  await query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
}

export function uniquePhone(): string {
  const random = Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
  return `3${String(Date.now()).slice(-6)}${random.slice(0, 3)}`;
}

export async function registerUser(
  app: Express,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<TestSession> {
  const res = await request(app).post('/api/auth/register').send({ email, password });

  if (res.status !== 201) {
    throw new Error(`Registro falló (${res.status}): ${JSON.stringify(res.body)}`);
  }

  return {
    email,
    password,
    userId: res.body.user.id as number,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
  };
}

export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export async function completeProfile(
  app: Express,
  accessToken: string,
  overrides: {
    name?: string;
    phone?: string;
    locality?: string;
    positionIds?: number[];
  } = {},
): Promise<request.Response> {
  const catalog = await request(app).get('/api/catalog');
  const allPositionIds = (catalog.body.positions as { id: number }[]).map(
    (position) => position.id,
  );

  return request(app)
    .put('/api/me/profile')
    .set(bearer(accessToken))
    .send({
      name: overrides.name ?? 'Jugadora de Prueba',
      phone: overrides.phone ?? uniquePhone(),
      locality: overrides.locality ?? 'Suba',
      positionIds: overrides.positionIds ?? allPositionIds.slice(0, 2),
    });
}
