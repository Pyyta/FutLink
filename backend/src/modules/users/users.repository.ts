import type { PoolClient, QueryResultRow } from 'pg';
import { query, withTransaction } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { UserRole, UserState, SessionUser } from '../auth/auth.types.js';
import type { ModerationState } from '../../shared/moderation.js';

export interface ProfileRow {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  role: UserRole;
  state: UserState;
  matchs_played: number;
  register_date: Date;
  locality: string | null;
  profile_pic: string | null;
  profile_completed_at: Date | null;
}

export interface UserRow extends ProfileRow {
  password: string;
}

export interface PositionRow {
  id: number;
  title: string;
}

export interface LocalityRow {
  name: string;
}

export interface RatingSummaryRow {
  average: number | null;
  count: number;
}

export interface RatingRow {
  id: number;
  author_id: number | null;
  player_id: number;
  score: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
  moderation_state: ModerationState;
}

export interface MyRatingRow {
  id: number;
  score: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
  moderation_state: ModerationState;
}

export interface RatingCommentRow {
  id: number;
  author_id: number | null;
  author_name: string | null;
  author_profile_pic: string | null;
  score: number;
  comment: string;
  created_at: Date;
  updated_at: Date;
}

export interface PlayerSearchRow {
  id: number;
  name: string | null;
  locality: string | null;
  profile_pic: string | null;
  positions: PositionRow[];
  rating_average: number | null;
  rating_count: number;
}

export interface PlayerSearchFilters {
  viewerId: number;
  name: string | null;
  locality: string | null;
  positionId: number | null;
  limit: number;
  offset: number;
}

const PROFILE_COLUMNS = `
  id,
  name,
  email,
  phone,
  role,
  state,
  matchs_played,
  register_date,
  locality,
  profile_pic,
  profile_completed_at
`;

function executor(client?: PoolClient) {
  return <T extends QueryResultRow>(
    text: string,
    params: QueryParam[] = [],
  ): Promise<T[]> =>
    client
      ? client.query<T>(text, params).then((result) => result.rows)
      : query<T>(text, params).then((result) => result.rows);
}

export function findUserByEmail(
  email: string,
  client?: PoolClient,
): Promise<UserRow | null> {
  return executor(client)<UserRow>(
    `SELECT ${PROFILE_COLUMNS}, password
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [email],
  ).then((rows) => rows[0] ?? null);
}

export function findUserById(
  id: number,
  client?: PoolClient,
): Promise<UserRow | null> {
  return executor(client)<UserRow>(
    `SELECT ${PROFILE_COLUMNS}, password
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function findProfileById(id: number): Promise<ProfileRow | null> {
  return executor()<ProfileRow>(
    `SELECT ${PROFILE_COLUMNS}
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function findSessionUserById(id: number): Promise<SessionUser | null> {
  return executor()<SessionUser>(
    `SELECT id, email, role, state, profile_completed_at AS "profileCompletedAt"
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
  const rows = await executor()<UserRow>(
    `INSERT INTO users (email, password)
     VALUES ($1, $2)
     RETURNING ${PROFILE_COLUMNS}, password`,
    [email, passwordHash],
  );
  const row = rows[0];
  if (!row) {
    throw new Error('No se pudo crear el usuario');
  }
  return row;
}

export function listUserPositions(userId: number): Promise<PositionRow[]> {
  return executor()<PositionRow>(
    `SELECT p.id, p.title
     FROM positions p
     JOIN userspositions up ON up.id_positions = p.id
     WHERE up.id_users = $1
     ORDER BY p.id`,
    [userId],
  );
}

export function findLocalityByName(name: string): Promise<LocalityRow | null> {
  return executor()<LocalityRow>(
    `SELECT name
     FROM localities
     WHERE lower(name) = lower($1)
     LIMIT 1`,
    [name],
  ).then((rows) => rows[0] ?? null);
}

export async function getRatingSummary(
  userId: number,
  client?: PoolClient,
): Promise<RatingSummaryRow> {
  const rows = await executor(client)<RatingSummaryRow>(
    `SELECT AVG(score)::float8 AS average, COUNT(*)::int AS count
     FROM usersratings
     WHERE player_id = $1
       AND moderation_state = 'visible'`,
    [userId],
  );

  return rows[0] ?? { average: null, count: 0 };
}

export function listRecentComments(
  userId: number,
  limit = 20,
): Promise<RatingCommentRow[]> {
  return executor()<RatingCommentRow>(
    `SELECT
       ur.id,
       ur.author_id,
       u.name AS author_name,
       u.profile_pic AS author_profile_pic,
       ur.score,
       ur.comment,
       ur.created_at,
       ur.updated_at
     FROM usersratings ur
     LEFT JOIN users u ON u.id = ur.author_id
     WHERE ur.player_id = $1
       AND ur.moderation_state = 'visible'
       AND ur.comment IS NOT NULL
       AND btrim(ur.comment) <> ''
     ORDER BY ur.updated_at DESC, ur.id DESC
     LIMIT $2`,
    [userId, limit],
  );
}

export function findRatingByAuthor(
  authorId: number,
  playerId: number,
): Promise<MyRatingRow | null> {
  return executor()<MyRatingRow>(
    `SELECT id, score, comment, created_at, updated_at, moderation_state
     FROM usersratings
     WHERE author_id = $1 AND player_id = $2
     LIMIT 1`,
    [authorId, playerId],
  ).then((rows) => rows[0] ?? null);
}

/**
 * Upsert de RF-10: una calificación por par autor→perfil. La unicidad real
 * vive en `usersratings_author_player_ux`; aquí solo se aprovecha para
 * actualizar la existente. El promedio se lee en la misma transacción para
 * devolverlo ya recalculado.
 */
export function upsertRating(
  authorId: number,
  playerId: number,
  score: number,
  comment: string | null,
): Promise<{ rating: RatingRow; summary: RatingSummaryRow }> {
  return withTransaction(async (client) => {
    const rows = await executor(client)<RatingRow>(
      `INSERT INTO usersratings (author_id, player_id, score, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (author_id, player_id) WHERE author_id IS NOT NULL
       DO UPDATE SET
         score = EXCLUDED.score,
         comment = EXCLUDED.comment,
         updated_at = now()
       RETURNING id, author_id, player_id, score, comment, created_at, updated_at,
                 moderation_state`,
      [authorId, playerId, score, comment],
    );

    const rating = rows[0];
    if (!rating) {
      throw new Error('No se pudo guardar la calificación');
    }

    const summary = await getRatingSummary(playerId, client);
    return { rating, summary };
  });
}

/**
 * Regla de privacidad: el teléfono solo se revela si existe una solicitud
 * aceptada entre ambos usuarios, en cualquier dirección y para cualquiera de
 * los dos tipos (partido o jugador).
 */
export async function hasAcceptedRequestBetween(
  viewerId: number,
  ownerId: number,
): Promise<boolean> {
  const rows = await executor()<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM requests
       WHERE state = 'accepted'
         AND (
           (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1)
         )
     ) AS allowed`,
    [viewerId, ownerId],
  );

  return rows[0]?.allowed === true;
}

export function findPositionsByIds(ids: number[]): Promise<PositionRow[]> {
  return executor()<PositionRow>(
    `SELECT id, title
     FROM positions
     WHERE id = ANY($1::int[])
     ORDER BY id`,
    [ids],
  );
}

export function phoneBelongsToAnotherUser(
  phone: string,
  userId: number,
): Promise<boolean> {
  return executor()<{ id: number }>(
    `SELECT id
     FROM users
     WHERE phone = $1 AND id <> $2
     LIMIT 1`,
    [phone, userId],
  ).then((rows) => rows.length > 0);
}

export async function updateUserProfile(
  userId: number,
  data: { name: string; phone: string; locality: string; positionIds: number[] },
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users
       SET name = $2,
           phone = $3,
           locality = $4,
           profile_completed_at = COALESCE(profile_completed_at, now()),
           updated_at = now()
       WHERE id = $1`,
      [userId, data.name, data.phone, data.locality],
    );

    await client.query('DELETE FROM userspositions WHERE id_users = $1', [userId]);
    await client.query(
      `INSERT INTO userspositions (id_users, id_positions)
       SELECT $1, unnest($2::int[])`,
      [userId, data.positionIds],
    );
  });
}

export function listAllPositions(): Promise<PositionRow[]> {
  return executor()<PositionRow>('SELECT id, title FROM positions ORDER BY id');
}

export function listAllLocalities(): Promise<LocalityRow[]> {
  return executor()<LocalityRow>('SELECT name FROM localities ORDER BY name');
}

/**
 * Filtros compartidos por la lista y el conteo de RF-05. Solo cuentas activas
 * con perfil completo y distintas del visitante. $1 visitante, $2 nombre,
 * $3 localidad, $4 posición.
 */
const PLAYER_SEARCH_FILTERS = `
  u.profile_completed_at IS NOT NULL
  AND u.state = 'active'
  AND u.id <> $1
  AND ($2::text IS NULL OR u.name ILIKE '%' || $2 || '%')
  AND ($3::text IS NULL OR u.locality = $3)
  AND (
    $4::int IS NULL
    OR EXISTS (
      SELECT 1
      FROM userspositions up
      WHERE up.id_users = u.id
        AND up.id_positions = $4
    )
  )
`;

export function searchPlayers(
  filters: PlayerSearchFilters,
): Promise<PlayerSearchRow[]> {
  return executor()<PlayerSearchRow>(
    `WITH filtered AS (
       SELECT u.id, u.name, u.locality, u.profile_pic
       FROM users u
       WHERE ${PLAYER_SEARCH_FILTERS}
       ORDER BY u.name ASC NULLS LAST, u.id ASC
       LIMIT $5 OFFSET $6
     )
     SELECT
       f.id,
       f.name,
       f.locality,
       f.profile_pic,
       rating.average AS rating_average,
       rating.count AS rating_count,
       positions.items AS positions
     FROM filtered f
     LEFT JOIN LATERAL (
       SELECT AVG(ur.score)::float8 AS average, COUNT(*)::int AS count
       FROM usersratings ur
       WHERE ur.player_id = f.id
         AND ur.moderation_state = 'visible'
     ) rating ON true
     LEFT JOIN LATERAL (
       SELECT COALESCE(
         json_agg(json_build_object('id', p.id, 'title', p.title) ORDER BY p.id),
         '[]'::json
       ) AS items
       FROM userspositions up
       JOIN positions p ON p.id = up.id_positions
       WHERE up.id_users = f.id
     ) positions ON true
     ORDER BY f.name ASC NULLS LAST, f.id ASC`,
    [
      filters.viewerId,
      filters.name,
      filters.locality,
      filters.positionId,
      filters.limit,
      filters.offset,
    ],
  );
}

export async function countPlayers(filters: PlayerSearchFilters): Promise<number> {
  const rows = await executor()<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM users u
     WHERE ${PLAYER_SEARCH_FILTERS}`,
    [filters.viewerId, filters.name, filters.locality, filters.positionId],
  );

  return rows[0]?.total ?? 0;
}
