import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';

export interface RefreshTokenRow {
  id: string;
  user_id: number;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface ResetCodeRow {
  id: string;
  user_id: number;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
  used_at: Date | null;
}

function executor(client?: PoolClient) {
  return <T extends QueryResultRow>(
    text: string,
    params: QueryParam[] = [],
  ): Promise<T[]> =>
    client
      ? client.query<T>(text, params).then((result) => result.rows)
      : query<T>(text, params).then((result) => result.rows);
}

export function insertRefreshToken(
  userId: number,
  tokenHash: string,
  expiresAt: Date,
  userAgent: string | null,
  client?: PoolClient,
): Promise<string> {
  return executor(client)<{ id: string }>(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [userId, tokenHash, expiresAt, userAgent],
  ).then((rows) => {
    const row = rows[0];
    if (!row) {
      throw new Error('No se pudo crear el refresh token');
    }
    return row.id;
  });
}

export function findRefreshTokenForUpdate(
  tokenHash: string,
  client: PoolClient,
): Promise<RefreshTokenRow | null> {
  return executor(client)<RefreshTokenRow>(
    `SELECT id, user_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1
     LIMIT 1
     FOR UPDATE`,
    [tokenHash],
  ).then((rows) => rows[0] ?? null);
}

export function findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
  return executor()<RefreshTokenRow>(
    `SELECT id, user_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash],
  ).then((rows) => rows[0] ?? null);
}

export async function revokeRefreshToken(
  id: string,
  replacedById: string | null,
  client?: PoolClient,
): Promise<void> {
  await executor(client)(
    `UPDATE refresh_tokens
     SET revoked_at = now(), replaced_by_id = $2
     WHERE id = $1 AND revoked_at IS NULL`,
    [id, replacedById],
  );
}

export async function revokeAllRefreshTokens(
  userId: number,
  client?: PoolClient,
): Promise<void> {
  await executor(client)(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

export async function invalidateActiveResetCodes(
  userId: number,
  client?: PoolClient,
): Promise<void> {
  await executor(client)(
    `UPDATE password_reset_codes
     SET used_at = now()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  );
}

export async function insertResetCode(
  userId: number,
  codeHash: string,
  expiresAt: Date,
  maxAttempts: number,
  client?: PoolClient,
): Promise<void> {
  await executor(client)(
    `INSERT INTO password_reset_codes (user_id, code_hash, expires_at, max_attempts)
     VALUES ($1, $2, $3, $4)`,
    [userId, codeHash, expiresAt, maxAttempts],
  );
}

export function findActiveResetCodeForUpdate(
  userId: number,
  client: PoolClient,
): Promise<ResetCodeRow | null> {
  return executor(client)<ResetCodeRow>(
    `SELECT id, user_id, code_hash, attempts, max_attempts, expires_at, used_at
     FROM password_reset_codes
     WHERE user_id = $1 AND used_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE`,
    [userId],
  ).then((rows) => rows[0] ?? null);
}

export function incrementResetAttempts(
  id: string,
  client: PoolClient,
): Promise<number> {
  return executor(client)<{ attempts: number }>(
    `UPDATE password_reset_codes
     SET attempts = attempts + 1
     WHERE id = $1
     RETURNING attempts`,
    [id],
  ).then((rows) => rows[0]?.attempts ?? 0);
}

export async function markResetCodeUsed(
  id: string,
  client: PoolClient,
): Promise<void> {
  await executor(client)(
    `UPDATE password_reset_codes
     SET used_at = now()
     WHERE id = $1 AND used_at IS NULL`,
    [id],
  );
}

export async function updateUserPassword(
  userId: number,
  passwordHash: string,
  client: PoolClient,
): Promise<void> {
  await executor(client)(
    `UPDATE users
     SET password = $2, updated_at = now()
     WHERE id = $1`,
    [userId, passwordHash],
  );
}
