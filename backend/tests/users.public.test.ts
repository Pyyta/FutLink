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
  uniquePhone,
} from './helpers/auth.js';

const app = createApp();
const nextEmail = makeEmailFactory('public');

afterAll(async () => {
  await cleanupByPrefix('public');
  await closePool();
});

async function createLink(
  creatorId: number,
  playerId: number,
  state: 'pending' | 'accepted' | 'rejected',
): Promise<void> {
  const match = await query<{ id: number }>(
    `INSERT INTO matchs (creator_id, match_date, locality)
     VALUES ($1, now() + interval '1 day', 'Suba')
     RETURNING id`,
    [creatorId],
  );
  const matchId = match.rows[0]?.id;
  if (!matchId) {
    throw new Error('No se pudo crear el partido de prueba');
  }

  const vacant = await query<{ id: number }>(
    `INSERT INTO matchvacants (match_id, position)
     VALUES ($1, 'delantero')
     RETURNING id`,
    [matchId],
  );
  const vacantId = vacant.rows[0]?.id;
  if (!vacantId) {
    throw new Error('No se pudo crear la vacante de prueba');
  }

  await query(
    `INSERT INTO requests
       (request_type, sender_id, receiver_id, match_id, matchvacant_id, state)
     VALUES ('match', $1, $2, $3, $4, $5)`,
    [playerId, creatorId, matchId, vacantId, state],
  );
}

describe('GET /api/users/:id (RF-09)', () => {
  it('exige autenticación', async () => {
    const res = await request(app).get('/api/users/1');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('exige perfil completo al visitante (RF-02)', async () => {
    const incomplete = await registerUser(app, nextEmail());
    const target = await registerUser(app, nextEmail());
    const targetProfile = await completeProfile(app, target.accessToken);
    expect(targetProfile.status).toBe(200);

    const res = await request(app)
      .get(`/api/users/${target.userId}`)
      .set(bearer(incomplete.accessToken));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('PROFILE_INCOMPLETE');
  });

  it('oculta el teléfono y el correo de otro usuario sin solicitud aceptada', async () => {
    const viewer = await registerUser(app, nextEmail());
    await completeProfile(app, viewer.accessToken);

    const target = await registerUser(app, nextEmail());
    const targetPhone = uniquePhone();
    const targetProfile = await completeProfile(app, target.accessToken, {
      name: 'Perfil Público',
      phone: targetPhone,
      locality: 'Kennedy',
      positionIds: [1, 3],
    });
    expect(targetProfile.status).toBe(200);

    const res = await request(app)
      .get(`/api/users/${target.userId}`)
      .set(bearer(viewer.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      id: target.userId,
      name: 'Perfil Público',
      locality: 'Kennedy',
      phone: null,
      phoneVisible: false,
      rating: { average: null, count: 0 },
      comments: [],
    });
    expect(res.body.profile.positions).toHaveLength(2);
    expect(res.body.profile.email).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain(targetPhone);
    expect(JSON.stringify(res.body)).not.toContain(target.email);
  });

  it('muestra el teléfono propio en el perfil público', async () => {
    const owner = await registerUser(app, nextEmail());
    const phone = uniquePhone();
    const profile = await completeProfile(app, owner.accessToken, { phone });
    expect(profile.status).toBe(200);

    const res = await request(app)
      .get(`/api/users/${owner.userId}`)
      .set(bearer(owner.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile.phoneVisible).toBe(true);
    expect(res.body.profile.phone).toBe(phone);
  });

  it('revela el teléfono solo con una solicitud aceptada, en cualquier dirección', async () => {
    const owner = await registerUser(app, nextEmail());
    const ownerPhone = uniquePhone();
    await completeProfile(app, owner.accessToken, { phone: ownerPhone });

    const player = await registerUser(app, nextEmail());
    const playerPhone = uniquePhone();
    await completeProfile(app, player.accessToken, { phone: playerPhone });

    await createLink(owner.userId, player.userId, 'accepted');

    const asPlayer = await request(app)
      .get(`/api/users/${owner.userId}`)
      .set(bearer(player.accessToken));
    expect(asPlayer.body.profile.phoneVisible).toBe(true);
    expect(asPlayer.body.profile.phone).toBe(ownerPhone);

    const asOwner = await request(app)
      .get(`/api/users/${player.userId}`)
      .set(bearer(owner.accessToken));
    expect(asOwner.body.profile.phoneVisible).toBe(true);
    expect(asOwner.body.profile.phone).toBe(playerPhone);
  });

  it('revela el teléfono con una solicitud entre jugadores aceptada', async () => {
    const sender = await registerUser(app, nextEmail());
    await completeProfile(app, sender.accessToken);

    const target = await registerUser(app, nextEmail());
    const targetPhone = uniquePhone();
    await completeProfile(app, target.accessToken, { phone: targetPhone });

    await query(
      `INSERT INTO requests
         (request_type, sender_id, receiver_id, target_user_id, state)
       VALUES ('player', $1, $2, $2, 'accepted')`,
      [sender.userId, target.userId],
    );

    const res = await request(app)
      .get(`/api/users/${target.userId}`)
      .set(bearer(sender.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile.phoneVisible).toBe(true);
    expect(res.body.profile.phone).toBe(targetPhone);
  });

  it('no revela el teléfono con una solicitud pendiente o rechazada', async () => {
    const owner = await registerUser(app, nextEmail());
    await completeProfile(app, owner.accessToken);

    const player = await registerUser(app, nextEmail());
    await completeProfile(app, player.accessToken);

    await createLink(owner.userId, player.userId, 'pending');

    const res = await request(app)
      .get(`/api/users/${owner.userId}`)
      .set(bearer(player.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile.phoneVisible).toBe(false);
    expect(res.body.profile.phone).toBeNull();
  });

  it('calcula promedio, cantidad y comentarios recientes', async () => {
    const viewer = await registerUser(app, nextEmail());
    await completeProfile(app, viewer.accessToken);

    const target = await registerUser(app, nextEmail());
    await completeProfile(app, target.accessToken);

    await query(
      `INSERT INTO usersratings (player_id, score, comment, created_at)
       VALUES
         ($1, 5, 'Excelente', now() - interval '2 days'),
         ($1, 4, 'Bien', now() - interval '1 day'),
         ($1, 3, NULL, now())`,
      [target.userId],
    );

    const res = await request(app)
      .get(`/api/users/${target.userId}`)
      .set(bearer(viewer.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.profile.rating).toEqual({ average: 4, count: 3 });
    expect(res.body.profile.comments).toHaveLength(2);
    expect(res.body.profile.comments[0]).toMatchObject({
      score: 4,
      comment: 'Bien',
    });
    expect(res.body.profile.comments[1]).toMatchObject({
      score: 5,
      comment: 'Excelente',
    });
  });

  it('devuelve 404 para usuarios inexistentes o no activos', async () => {
    const viewer = await registerUser(app, nextEmail());
    await completeProfile(app, viewer.accessToken);

    const missing = await request(app)
      .get('/api/users/999999')
      .set(bearer(viewer.accessToken));
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');

    const suspended = await registerUser(app, nextEmail());
    await completeProfile(app, suspended.accessToken);
    await query("UPDATE users SET state = 'suspended' WHERE id = $1", [
      suspended.userId,
    ]);

    const inactive = await request(app)
      .get(`/api/users/${suspended.userId}`)
      .set(bearer(viewer.accessToken));
    expect(inactive.status).toBe(404);
    expect(inactive.body.error.code).toBe('USER_NOT_FOUND');
  });

  it('valida el identificador de la ruta', async () => {
    const viewer = await registerUser(app, nextEmail());
    await completeProfile(app, viewer.accessToken);

    const res = await request(app)
      .get('/api/users/abc')
      .set(bearer(viewer.accessToken));

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
