import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { UserRole, UserState } from '../auth/auth.types.js';
import type { RequestState, RequestType } from '../requests/requests.types.js';

export interface AdminUserRow {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  locality: string | null;
  role: UserRole;
  state: UserState;
  matchs_played: number;
  register_date: Date;
  profile_pic: string | null;
  profile_completed_at: Date | null;
}

export interface AdminUserFilters {
  searchPattern: string | null;
  state: UserState | null;
  role: UserRole | null;
  limit: number;
  offset: number;
}

export interface AdminUserUpdateFields {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
  locality?: string;
  role?: UserRole;
  state?: 'active' | 'suspended';
}

export interface AdminOwnedMatchRow {
  id: number;
}

export interface AdminCancelledRequestRow {
  id: number;
  sender_id: number;
}

export interface AdminActiveRequestRow {
  id: number;
  request_type: RequestType;
  sender_id: number;
  receiver_id: number;
  match_id: number | null;
  matchvacant_id: number | null;
  state: RequestState;
}

const ADMIN_USER_COLUMNS = `
  u.id,
  u.email,
  u.name,
  u.phone,
  u.locality,
  u.role,
  u.state,
  u.matchs_played,
  u.register_date,
  u.profile_pic,
  u.profile_completed_at
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

export function listAdminUsers(
  filters: AdminUserFilters,
): Promise<AdminUserRow[]> {
  return executor()<AdminUserRow>(
    `SELECT ${ADMIN_USER_COLUMNS}
     FROM users u
     WHERE (
       $1::text IS NULL
       OR u.name ILIKE $1
       OR u.email ILIKE $1
       OR u.phone ILIKE $1
       OR u.locality ILIKE $1
     )
       AND ($2::text IS NULL OR u.state = $2)
       AND ($3::text IS NULL OR u.role = $3)
     ORDER BY u.register_date DESC, u.id DESC
     LIMIT $4 OFFSET $5`,
    [
      filters.searchPattern,
      filters.state,
      filters.role,
      filters.limit,
      filters.offset,
    ],
  );
}

export async function countAdminUsers(
  filters: AdminUserFilters,
): Promise<number> {
  const rows = await executor()<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM users u
     WHERE (
       $1::text IS NULL
       OR u.name ILIKE $1
       OR u.email ILIKE $1
       OR u.phone ILIKE $1
       OR u.locality ILIKE $1
     )
       AND ($2::text IS NULL OR u.state = $2)
       AND ($3::text IS NULL OR u.role = $3)`,
    [filters.searchPattern, filters.state, filters.role],
  );

  return rows[0]?.total ?? 0;
}

export function findAdminUserById(id: number): Promise<AdminUserRow | null> {
  return executor()<AdminUserRow>(
    `SELECT ${ADMIN_USER_COLUMNS}
     FROM users u
     WHERE u.id = $1
     LIMIT 1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function findAdminUserForUpdate(
  id: number,
  client: PoolClient,
): Promise<AdminUserRow | null> {
  return executor(client)<AdminUserRow>(
    `SELECT ${ADMIN_USER_COLUMNS}
     FROM users u
     WHERE u.id = $1
     FOR UPDATE`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function findEmailOwner(
  email: string,
  excludeId: number | null,
): Promise<number | null> {
  return executor()<{ id: number }>(
    `SELECT id
     FROM users
     WHERE lower(email) = lower($1)
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [email, excludeId],
  ).then((rows) => rows[0]?.id ?? null);
}

export function findPhoneOwner(
  phone: string,
  excludeId: number | null,
): Promise<number | null> {
  return executor()<{ id: number }>(
    `SELECT id
     FROM users
     WHERE phone = $1
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [phone, excludeId],
  ).then((rows) => rows[0]?.id ?? null);
}

export async function insertAdminUser(
  data: {
    email: string;
    password: string;
    name: string;
    phone: string;
    locality: string;
    role: UserRole;
  },
  client: PoolClient,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO users
       (email, password, name, phone, locality, role, state,
        profile_completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', now())
     RETURNING id`,
    [
      data.email,
      data.password,
      data.name,
      data.phone,
      data.locality,
      data.role,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('No se pudo crear el usuario');
  }
  return row.id;
}

export async function replaceUserPositions(
  userId: number,
  positionIds: number[],
  client: PoolClient,
): Promise<void> {
  await client.query('DELETE FROM userspositions WHERE id_users = $1', [userId]);
  await client.query(
    `INSERT INTO userspositions (id_users, id_positions)
     SELECT $1, unnest($2::int[])`,
    [userId, positionIds],
  );
}

export async function deleteUserPositions(
  userId: number,
  client: PoolClient,
): Promise<void> {
  await client.query('DELETE FROM userspositions WHERE id_users = $1', [userId]);
}

export async function updateAdminUser(
  userId: number,
  fields: AdminUserUpdateFields,
  client: PoolClient,
): Promise<void> {
  const assignments: string[] = [];
  const params: QueryParam[] = [userId];
  let index = 2;

  const add = (column: string, value: QueryParam): void => {
    assignments.push(`${column} = $${index}`);
    params.push(value);
    index += 1;
  };

  if (fields.email !== undefined) add('email', fields.email);
  if (fields.password !== undefined) add('password', fields.password);
  if (fields.name !== undefined) add('name', fields.name);
  if (fields.phone !== undefined) add('phone', fields.phone);
  if (fields.locality !== undefined) add('locality', fields.locality);
  if (fields.role !== undefined) add('role', fields.role);
  if (fields.state !== undefined) add('state', fields.state);

  assignments.push('updated_at = now()');

  await client.query(
    `UPDATE users
     SET ${assignments.join(', ')}
     WHERE id = $1`,
    params,
  );
}

/**
 * Marca el perfil como completo si ya cumple las cuatro condiciones. Nunca lo
 * vuelve a dejar incompleto: el gate de RF-02 no debe reaparecer por una edición
 * administrativa.
 */
export async function refreshProfileCompletion(
  userId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE users u
     SET profile_completed_at = COALESCE(u.profile_completed_at, now())
     WHERE u.id = $1
       AND u.name IS NOT NULL
       AND u.phone IS NOT NULL
       AND u.locality IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM userspositions up WHERE up.id_users = u.id
       )`,
    [userId],
  );
}

export async function revokeUserSessions(
  userId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  await client.query(
    `UPDATE password_reset_codes
     SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
}

export async function softDeleteUser(
  userId: number,
  anonymizedEmail: string,
  unusablePassword: string,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE users
     SET state = 'deleted',
         email = $2,
         password = $3,
         name = 'Cuenta eliminada',
         phone = NULL,
         locality = NULL,
         profile_pic = NULL,
         birthdate = NULL,
         location = NULL,
         role = 'user',
         profile_completed_at = NULL,
         updated_at = now()
     WHERE id = $1`,
    [userId, anonymizedEmail, unusablePassword],
  );
}

export function lockOwnedMatches(
  userId: number,
  client: PoolClient,
): Promise<AdminOwnedMatchRow[]> {
  return executor(client)<AdminOwnedMatchRow>(
    `SELECT id
     FROM matchs
     WHERE creator_id = $1
       AND state <> 'cancelled'
     ORDER BY id
     FOR UPDATE`,
    [userId],
  );
}

export async function markMatchCancelled(
  matchId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE matchs
     SET state = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [matchId],
  );
}

export async function releaseMatchVacancies(
  matchId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    'UPDATE matchvacants SET occupied = false WHERE match_id = $1',
    [matchId],
  );
}

export async function cancelActiveRequestsForMatch(
  matchId: number,
  cancelledBy: number,
  client: PoolClient,
): Promise<AdminCancelledRequestRow[]> {
  const result = await client.query<AdminCancelledRequestRow>(
    `UPDATE requests
     SET state = 'cancelled',
         cancelled_at = now(),
         cancelled_by = $2,
         updated_at = now()
     WHERE match_id = $1
       AND state IN ('pending', 'accepted')
     RETURNING id, sender_id`,
    [matchId, cancelledBy],
  );

  return result.rows;
}

export function findActiveRequestsInvolvingUser(
  userId: number,
  client: PoolClient,
): Promise<AdminActiveRequestRow[]> {
  return executor(client)<AdminActiveRequestRow>(
    `SELECT id, request_type, sender_id, receiver_id,
            match_id, matchvacant_id, state
     FROM requests
     WHERE (sender_id = $1 OR receiver_id = $1)
       AND state IN ('pending', 'accepted')
     ORDER BY id
     FOR UPDATE`,
    [userId],
  );
}

export async function freeVacancy(
  vacancyId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    'UPDATE matchvacants SET occupied = false WHERE id = $1',
    [vacancyId],
  );
}

export async function reopenMatchIfVacant(
  matchId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE matchs
     SET state = 'available',
         updated_at = now()
     WHERE id = $1
       AND state = 'confirmed'
       AND EXISTS (
         SELECT 1 FROM matchvacants WHERE match_id = $1 AND NOT occupied
       )`,
    [matchId],
  );
}

export async function cancelRequestByAdmin(
  requestId: number,
  adminId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE requests
     SET state = 'cancelled',
         cancelled_at = now(),
         cancelled_by = $2,
         updated_at = now()
     WHERE id = $1`,
    [requestId, adminId],
  );
}
