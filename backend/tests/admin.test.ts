import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/config/db.js';
import {
  bearer,
  cleanupByPrefix,
  completeProfile,
  makeEmailFactory,
  promoteToAdmin,
  registerUser,
  TEST_PASSWORD,
  uniquePhone,
} from './helpers/auth.js';
import type { TestSession } from './helpers/auth.js';
import { publishMatch } from './helpers/matches.js';
import {
  actOnRequest,
  createMatchWithVacancies,
  listRequests,
  sendMatchRequest,
} from './helpers/requests.js';
import { listNotifications } from './helpers/notifications.js';

const app = createApp();
const nextEmail = makeEmailFactory('admin');
const stamp = `${Date.now()}${process.pid}`;

let admin: TestSession;
let normal: TestSession;
let sequence = 0;

function uniqueLabel(label: string): string {
  sequence += 1;
  return `${label}-${stamp}-${sequence}`;
}

async function newCompleteUser(label: string): Promise<TestSession> {
  const session = await registerUser(app, nextEmail());
  const profile = await completeProfile(app, session.accessToken, {
    name: `AdminPrueba ${uniqueLabel(label)}`,
  });
  if (profile.status !== 200) {
    throw new Error(
      `No se pudo completar el perfil (${profile.status}): ${JSON.stringify(profile.body)}`,
    );
  }
  return session;
}

function login(email: string, password: string = TEST_PASSWORD): request.Test {
  return request(app).post('/api/auth/login').send({ email, password });
}

function adminGet(path: string): request.Test {
  return request(app).get(`/api/admin${path}`).set(bearer(admin.accessToken));
}

function adminPost(path: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .post(`/api/admin${path}`)
    .set(bearer(admin.accessToken))
    .send(body);
}

function adminPatch(path: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .patch(`/api/admin${path}`)
    .set(bearer(admin.accessToken))
    .send(body);
}

function adminPut(path: string, body: Record<string, unknown>): request.Test {
  return request(app)
    .put(`/api/admin${path}`)
    .set(bearer(admin.accessToken))
    .send(body);
}

async function createUserThroughAdmin(
  label: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; email: string; body: Record<string, unknown> }> {
  const email = nextEmail();
  const res = await adminPost('/users', {
    email,
    password: TEST_PASSWORD,
    name: `Creado ${uniqueLabel(label)}`,
    phone: uniquePhone(),
    locality: 'Suba',
    positionIds: [1],
    role: 'user',
    ...overrides,
  });

  if (res.status !== 201) {
    throw new Error(
      `No se pudo crear el usuario (${res.status}): ${JSON.stringify(res.body)}`,
    );
  }

  return { id: res.body.user.id as number, email, body: res.body.user };
}

beforeAll(async () => {
  admin = await registerUser(app, nextEmail());
  await promoteToAdmin(admin.userId);
  const profile = await completeProfile(app, admin.accessToken, {
    name: `Administradora ${stamp}`,
  });
  if (profile.status !== 200) {
    throw new Error(
      `No se pudo completar el perfil admin (${profile.status}): ${JSON.stringify(profile.body)}`,
    );
  }

  normal = await newCompleteUser('normal');

  await query(
    `UPDATE systemsettings SET value = 'false'::jsonb, updated_at = now()
     WHERE key = 'ratings.require_accepted_request'`,
  );
  await query(
    `UPDATE systemsettings SET value = 'true'::jsonb, updated_at = now()
     WHERE key = 'notifications.enabled'`,
  );
  await query(
    `UPDATE systemsettings SET value = '1'::jsonb, updated_at = now()
     WHERE key = 'ratings.min_score'`,
  );
  await query(
    `UPDATE systemsettings SET value = '5'::jsonb, updated_at = now()
     WHERE key = 'ratings.max_score'`,
  );
});

afterAll(async () => {
  await query(
    `UPDATE systemsettings SET value = '1'::jsonb, updated_at = now()
     WHERE key = 'ratings.min_score'`,
  );
  await query(
    `UPDATE systemsettings SET value = '5'::jsonb, updated_at = now()
     WHERE key = 'ratings.max_score'`,
  );
  await query(
    `UPDATE systemsettings SET value = 'false'::jsonb, updated_at = now()
     WHERE key = 'ratings.require_accepted_request'`,
  );
  await query(
    `UPDATE systemsettings SET value = 'true'::jsonb, updated_at = now()
     WHERE key = 'notifications.enabled'`,
  );
  await cleanupByPrefix('admin');
  await closePool();
});

describe('Autorización de administración', () => {
  it('exige autenticación', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('rechaza a usuarios sin rol admin', async () => {
    for (const path of ['/users', '/contents', '/reports', '/config']) {
      const res = await request(app)
        .get(`/api/admin${path}`)
        .set(bearer(normal.accessToken));

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});

describe('RF-11 · gestión de usuarios', () => {
  it('lista, busca y crea usuarios', async () => {
    const list = await adminGet(`/users?search=${encodeURIComponent(admin.email)}`);
    expect(list.status).toBe(200);
    expect(list.headers['cache-control']).toBe('no-store');
    expect(
      (list.body.users as { id: number }[]).some((user) => user.id === admin.userId),
    ).toBe(true);

    const created = await createUserThroughAdmin('creado', {
      name: 'Jugador Creado',
    });
    expect(created.body).toMatchObject({
      email: created.email,
      name: 'Jugador Creado',
      locality: 'Suba',
      role: 'user',
      state: 'active',
      profileCompleted: true,
    });

    const createdLogin = await login(created.email);
    expect(createdLogin.status).toBe(200);
    expect(createdLogin.body.user.id).toBe(created.id);

    const detail = await adminGet(`/users/${created.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.user.positions).toEqual([{ id: 1, title: 'portero' }]);
  });

  it('valida datos y evita correos duplicados', async () => {
    const incomplete = await adminPost('/users', {
      email: nextEmail(),
      password: TEST_PASSWORD,
    });
    expect(incomplete.status).toBe(400);

    const duplicate = await adminPost('/users', {
      email: admin.email,
      password: TEST_PASSWORD,
      name: 'Duplicado',
      phone: uniquePhone(),
      locality: 'Suba',
      positionIds: [1],
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_IN_USE');
  });

  it('edita, suspende y reactiva una cuenta', async () => {
    const created = await createUserThroughAdmin('editable');

    const renamed = await adminPatch(`/users/${created.id}`, {
      name: 'Nombre Actualizado',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.user.name).toBe('Nombre Actualizado');

    const suspended = await adminPatch(`/users/${created.id}`, {
      state: 'suspended',
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.user.state).toBe('suspended');

    const blocked = await login(created.email);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const reactivated = await adminPatch(`/users/${created.id}`, {
      state: 'active',
    });
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.user.state).toBe('active');

    const allowed = await login(created.email);
    expect(allowed.status).toBe(200);
  });

  it('impide que el administrador se suspenda o elimine a sí mismo', async () => {
    const suspend = await adminPatch(`/users/${admin.userId}`, {
      state: 'suspended',
    });
    expect(suspend.status).toBe(409);
    expect(suspend.body.error.code).toBe('CANNOT_MODIFY_SELF');

    const remove = await request(app)
      .delete(`/api/admin/users/${admin.userId}`)
      .set(bearer(admin.accessToken));
    expect(remove.status).toBe(409);
    expect(remove.body.error.code).toBe('CANNOT_DELETE_SELF');
  });

  it('elimina la cuenta, cancela partidos y solicitudes y notifica', async () => {
    const victim = await createUserThroughAdmin('eliminada');
    const victimSession = await login(victim.email);
    expect(victimSession.status).toBe(200);

    const match = await createMatchWithVacancies(
      app,
      victimSession.body.accessToken as string,
      1,
      '2034-06-01T19:00:00-05:00',
    );

    const requester = await newCompleteUser('solicitante-eliminacion');
    const sent = await sendMatchRequest(
      app,
      requester.accessToken,
      match.vacancies[0]?.id ?? 0,
    );
    expect(sent.status).toBe(201);

    const removed = await request(app)
      .delete(`/api/admin/users/${victim.id}`)
      .set(bearer(admin.accessToken));

    expect(removed.status).toBe(200);
    expect(removed.body).toMatchObject({
      userId: victim.id,
      state: 'deleted',
      cancelledMatches: 1,
      cancelledRequests: 1,
      notifiedUsers: 1,
    });

    const blocked = await login(victim.email);
    expect(blocked.status).toBe(401);

    const detail = await adminGet(`/users/${victim.id}`);
    expect(detail.body.user).toMatchObject({
      id: victim.id,
      state: 'deleted',
      email: `deleted+${victim.id}@futlink.invalid`,
      name: 'Cuenta eliminada',
      phone: null,
      profileCompleted: false,
    });

    const matchRow = await query<{ state: string }>(
      'SELECT state FROM matchs WHERE id = $1',
      [match.matchId],
    );
    expect(matchRow.rows[0]?.state).toBe('cancelled');

    const requestRow = await query<{ state: string; cancelled_by: number }>(
      'SELECT state, cancelled_by FROM requests WHERE id = $1',
      [sent.body.request.id as number],
    );
    expect(requestRow.rows[0]?.state).toBe('cancelled');
    expect(requestRow.rows[0]?.cancelled_by).toBe(admin.userId);

    const notifications = await listNotifications(
      app,
      requester.accessToken,
      '?pageSize=50',
    );
    expect(
      (notifications.body.notifications as { type: string; match: { id: number } | null }[]).some(
        (item) => item.type === 'match_cancelled' && item.match?.id === match.matchId,
      ),
    ).toBe(true);

    // Se retira físicamente el registro anonimizado para que la limpieza de la
    // suite no deje cuentas borradas acumuladas.
    await query('DELETE FROM users WHERE id = $1', [victim.id]);
  });
});

describe('RF-12 · moderación de contenidos', () => {
  it('edita, oculta y restaura un partido publicado', async () => {
    const owner = await newCompleteUser('autor-partido');
    const viewer = await newCompleteUser('visor-partido');
    const description = `Partido moderado ${uniqueLabel('desc')}`;

    const published = await publishMatch(app, owner.accessToken, {
      description,
      positions: [{ positionId: 1, slots: 1 }],
      matchDate: '2034-07-10T19:00:00-05:00',
    });
    expect(published.status).toBe(201);
    const matchId = published.body.match.id as number;

    const listed = await adminGet(
      `/contents?type=match&search=${encodeURIComponent(description)}`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      type: 'match',
      id: matchId,
      moderationState: 'visible',
      author: { id: owner.userId },
    });

    const edited = await adminPatch(`/contents/matches/${matchId}`, {
      description: 'Descripción corregida por administración',
    });
    expect(edited.status).toBe(200);
    expect(edited.body.content.description).toBe(
      'Descripción corregida por administración',
    );

    const hidden = await adminPatch(`/contents/matches/${matchId}`, {
      moderationState: 'hidden',
    });
    expect(hidden.status).toBe(200);
    expect(hidden.body.content.moderationState).toBe('hidden');

    const detailHidden = await request(app)
      .get(`/api/matches/${matchId}`)
      .set(bearer(viewer.accessToken));
    expect(detailHidden.status).toBe(404);

    const searchHidden = await request(app)
      .get('/api/matches?locality=Suba&pageSize=50')
      .set(bearer(viewer.accessToken));
    expect(
      (searchHidden.body.matches as { id: number }[]).some((item) => item.id === matchId),
    ).toBe(false);

    const ownerNotifications = await listNotifications(
      app,
      owner.accessToken,
      '?pageSize=50',
    );
    expect(
      (ownerNotifications.body.notifications as { type: string; content: unknown }[]).some(
        (item) =>
          item.type === 'content_hidden' &&
          (item.content as { type: string; id: number }).type === 'match' &&
          (item.content as { type: string; id: number }).id === matchId,
      ),
    ).toBe(true);

    const restored = await adminPatch(`/contents/matches/${matchId}`, {
      moderationState: 'visible',
    });
    expect(restored.status).toBe(200);

    const detailVisible = await request(app)
      .get(`/api/matches/${matchId}`)
      .set(bearer(viewer.accessToken));
    expect(detailVisible.status).toBe(200);
  });

  it('elimina un partido, lo cancela y avisa a los solicitantes', async () => {
    const owner = await newCompleteUser('autor-eliminado');
    const requester = await newCompleteUser('solicitante-partido');
    const match = await createMatchWithVacancies(
      app,
      owner.accessToken,
      1,
      '2034-08-10T19:00:00-05:00',
    );

    const sent = await sendMatchRequest(
      app,
      requester.accessToken,
      match.vacancies[0]?.id ?? 0,
    );
    expect(sent.status).toBe(201);

    const removed = await adminPatch(`/contents/matches/${match.matchId}`, {
      moderationState: 'deleted',
    });
    expect(removed.status).toBe(200);
    expect(removed.body.content).toMatchObject({
      moderationState: 'deleted',
      matchState: 'cancelled',
    });

    const requesterNotifications = await listNotifications(
      app,
      requester.accessToken,
      '?pageSize=50',
    );
    expect(
      (requesterNotifications.body.notifications as { type: string }[]).some(
        (item) => item.type === 'match_cancelled',
      ),
    ).toBe(true);

    const requestList = await listRequests(
      app,
      requester.accessToken,
      '?box=sent&pageSize=50',
    );
    const stored = (requestList.body.requests as { id: number; state: string }[]).find(
      (item) => item.id === sent.body.request.id,
    );
    expect(stored?.state).toBe('cancelled');
  });

  it('oculta un comentario y lo excluye del perfil público', async () => {
    const author = await newCompleteUser('autor-comentario');
    const player = await newCompleteUser('calificado-comentario');
    const comment = `Comentario moderado ${uniqueLabel('comentario')}`;

    const rating = await request(app)
      .put(`/api/users/${player.userId}/rating`)
      .set(bearer(author.accessToken))
      .send({ score: 5, comment });
    expect(rating.status).toBe(200);
    const ratingId = rating.body.rating.id as number;

    const listed = await adminGet(
      `/contents?type=comment&search=${encodeURIComponent(comment)}`,
    );
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(listed.body.items[0]).toMatchObject({
      type: 'comment',
      id: ratingId,
      score: 5,
      moderationState: 'visible',
      author: { id: author.userId },
      player: { id: player.userId },
    });

    const hidden = await adminPatch(`/contents/comments/${ratingId}`, {
      moderationState: 'hidden',
    });
    expect(hidden.status).toBe(200);
    expect(hidden.body.content.moderationState).toBe('hidden');

    const profile = await request(app)
      .get(`/api/users/${player.userId}`)
      .set(bearer(author.accessToken));
    expect(profile.status).toBe(200);
    expect(profile.body.profile.rating).toEqual({ average: null, count: 0 });
    expect(profile.body.profile.comments).toEqual([]);

    const notifications = await listNotifications(
      app,
      author.accessToken,
      '?pageSize=50',
    );
    expect(
      (notifications.body.notifications as { type: string; content: unknown }[]).some(
        (item) =>
          item.type === 'content_hidden' &&
          (item.content as { type: string; id: number }).type === 'comment' &&
          (item.content as { type: string; id: number }).id === ratingId,
      ),
    ).toBe(true);

    const restored = await adminPatch(`/contents/comments/${ratingId}`, {
      moderationState: 'visible',
      comment: 'Comentario editado por administración',
    });
    expect(restored.status).toBe(200);
    expect(restored.body.content.comment).toBe(
      'Comentario editado por administración',
    );

    const deleted = await adminPatch(`/contents/comments/${ratingId}`, {
      moderationState: 'deleted',
    });
    expect(deleted.status).toBe(200);
    expect(deleted.body.content.moderationState).toBe('deleted');
  });
});

describe('RF-13 · reportes y exportación', () => {
  const now = Date.now();
  const period = {
    from: new Date(now - 30 * 86_400_000).toISOString(),
    to: new Date(now + 86_400_000).toISOString(),
  };

  it('genera y lista reportes de usuarios, partidos y solicitudes', async () => {
    const reports: Record<string, number> = {};

    for (const type of ['users', 'matches', 'requests'] as const) {
      const created = await adminPost('/reports', { type, ...period });
      expect(created.status).toBe(201);
      expect(created.body.report).toMatchObject({
        type,
        generatedBy: { id: admin.userId },
      });
      expect(created.body.report.rowCount).toBeGreaterThanOrEqual(0);
      reports[type] = created.body.report.id as number;
    }

    const listed = await adminGet('/reports?type=users&pageSize=50');
    expect(listed.status).toBe(200);
    expect(
      (listed.body.reports as { id: number }[]).some(
        (report) => report.id === reports.users,
      ),
    ).toBe(true);
  });

  it('valida el tipo y el periodo del reporte', async () => {
    const invalidType = await adminPost('/reports', {
      type: 'inventario',
      ...period,
    });
    expect(invalidType.status).toBe(400);

    const invalidPeriod = await adminPost('/reports', {
      type: 'users',
      from: '2035-01-01T00:00:00.000Z',
      to: '2020-01-01T00:00:00.000Z',
    });
    expect(invalidPeriod.status).toBe(400);
  });

  it('exporta el CSV con BOM, encabezados y neutralización de fórmulas', async () => {
    const risky = await createUserThroughAdmin('formula', { name: '=2+2' });
    expect(risky.body.name).toBe('=2+2');

    const created = await adminPost('/reports', { type: 'users', ...period });
    expect(created.status).toBe(201);
    const reportId = created.body.report.id as number;

    const exported = await adminGet(`/reports/${reportId}/export`);
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.headers['content-disposition']).toContain(
      `futlink-reporte-users-${reportId}.csv`,
    );

    const csv = exported.text;
    expect(csv.codePointAt(0)).toBe(0xfeff);
    expect(csv).toContain('ID,Nombre,Correo');
    expect(csv).toContain(admin.email);
    expect(csv).toContain("'=2+2");
    expect(csv.startsWith('\uFEFF')).toBe(true);

    const missing = await adminGet('/reports/999999/export');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('REPORT_NOT_FOUND');
  });
});

describe('RF-14 · configuración global', () => {
  it('expone la configuración, catálogos y escala vigente', async () => {
    const res = await adminGet('/config');
    expect(res.status).toBe(200);
    expect(res.body.config.ratings).toEqual({
      minScore: 1,
      maxScore: 5,
      requireAcceptedRequest: false,
    });
    expect(res.body.config.notifications).toEqual({ enabled: true });
    expect(
      (res.body.config.positions as { title: string }[]).some(
        (position) => position.title === 'portero',
      ),
    ).toBe(true);
    expect(
      (res.body.config.localities as { name: string }[]).some(
        (locality) => locality.name === 'Suba',
      ),
    ).toBe(true);
  });

  it('permite ampliar la escala a 10 y bloquea reducirla con notas fuera de rango', async () => {
    const raised = await adminPut('/config/ratings', { maxScore: 10 });
    expect(raised.status).toBe(200);
    expect(raised.body.ratings.maxScore).toBe(10);

    const author = await newCompleteUser('autor-escala');
    const player = await newCompleteUser('calificado-escala');
    const rated = await request(app)
      .put(`/api/users/${player.userId}/rating`)
      .set(bearer(author.accessToken))
      .send({ score: 9, comment: 'Nota alta de prueba' });
    expect(rated.status).toBe(200);
    const ratingId = rated.body.rating.id as number;

    const blocked = await adminPut('/config/ratings', { maxScore: 5 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('RATING_SCALE_IN_USE');
    expect(blocked.body.error.details.count).toBeGreaterThanOrEqual(1);

    const adjusted = await adminPatch(`/contents/comments/${ratingId}`, {
      score: 5,
    });
    expect(adjusted.status).toBe(200);

    const narrowed = await adminPut('/config/ratings', { maxScore: 5 });
    expect(narrowed.status).toBe(200);
    expect(narrowed.body.ratings.maxScore).toBe(5);

    const invalid = await adminPut('/config/ratings', { minScore: 6 });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('desactiva y reactiva la generación de notificaciones', async () => {
    const owner = await newCompleteUser('autor-sin-notificar');
    const requester = await newCompleteUser('sin-notificar');
    const match = await createMatchWithVacancies(
      app,
      owner.accessToken,
      1,
      '2034-09-10T19:00:00-05:00',
    );
    const sent = await sendMatchRequest(
      app,
      requester.accessToken,
      match.vacancies[0]?.id ?? 0,
    );
    expect(sent.status).toBe(201);

    const disabled = await adminPut('/config/notifications', { enabled: false });
    expect(disabled.status).toBe(200);

    const accepted = await actOnRequest(
      app,
      owner.accessToken,
      sent.body.request.id as number,
      'accept',
    );
    expect(accepted.status).toBe(200);

    const afterAccept = await listNotifications(
      app,
      requester.accessToken,
      '?pageSize=50',
    );
    expect(
      (afterAccept.body.notifications as { type: string }[]).some(
        (item) => item.type === 'request_accepted',
      ),
    ).toBe(false);

    const enabled = await adminPut('/config/notifications', { enabled: true });
    expect(enabled.status).toBe(200);

    const cancelled = await actOnRequest(
      app,
      requester.accessToken,
      sent.body.request.id as number,
      'cancel',
    );
    expect(cancelled.status).toBe(200);

    const afterCancel = await listNotifications(
      app,
      owner.accessToken,
      '?pageSize=50',
    );
    expect(
      (afterCancel.body.notifications as { type: string }[]).some(
        (item) => item.type === 'request_cancelled',
      ),
    ).toBe(true);
  });

  it('crea, renombra y elimina posiciones no utilizadas', async () => {
    const title = uniqueLabel('posicion').toLowerCase();

    const created = await adminPost('/config/positions', {
      title: `  ${title.toUpperCase()}  `,
    });
    expect(created.status).toBe(201);
    expect(created.body.position.title).toBe(title);
    const positionId = created.body.position.id as number;

    const duplicate = await adminPost('/config/positions', { title });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('POSITION_ALREADY_EXISTS');

    const renamedTitle = `${title}-b`;
    const renamed = await adminPatch(`/config/positions/${positionId}`, {
      title: renamedTitle,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.position.title).toBe(renamedTitle);

    const removed = await request(app)
      .delete(`/api/admin/config/positions/${positionId}`)
      .set(bearer(admin.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: true });

    const inUse = await request(app)
      .delete('/api/admin/config/positions/1')
      .set(bearer(admin.accessToken));
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('POSITION_IN_USE');
  });

  it('crea, renombra y elimina localidades no utilizadas', async () => {
    const name = `Localidad ${uniqueLabel('loc')}`;

    const created = await adminPost('/config/localities', { name });
    expect(created.status).toBe(201);
    expect(created.body.locality.name).toBe(name);
    const localityId = created.body.locality.id as number;

    const duplicate = await adminPost('/config/localities', {
      name: name.toUpperCase(),
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('LOCALITY_ALREADY_EXISTS');

    const renamedName = `${name} Bis`;
    const renamed = await adminPatch(`/config/localities/${localityId}`, {
      name: renamedName,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.locality.name).toBe(renamedName);

    const removed = await request(app)
      .delete(`/api/admin/config/localities/${localityId}`)
      .set(bearer(admin.accessToken));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ deleted: true });

    const config = await adminGet('/config');
    const suba = (config.body.config.localities as { id: number; name: string }[]).find(
      (locality) => locality.name.toLowerCase() === 'suba',
    );
    expect(suba).toBeDefined();

    const inUse = await request(app)
      .delete(`/api/admin/config/localities/${suba?.id ?? 0}`)
      .set(bearer(admin.accessToken));
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.code).toBe('LOCALITY_IN_USE');
  });
});
