import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { ModerationState } from '../../shared/moderation.js';
import type { MatchState } from '../matches/matches.types.js';

export interface AdminContentFilters {
  type: 'match' | 'comment' | null;
  state: ModerationState | null;
  searchPattern: string | null;
  authorId: number | null;
  from: Date | null;
  to: Date | null;
  limit: number;
  offset: number;
}

export interface AdminContentUnionRow {
  content_type: 'match' | 'comment';
  id: number;
  author_id: number | null;
  author_name: string | null;
  created_at: Date;
  moderation_state: ModerationState;
  match_date: Date | null;
  locality: string | null;
  modality: string | null;
  description: string | null;
  match_state: MatchState | null;
  score: number | null;
  comment: string | null;
  player_id: number | null;
  player_name: string | null;
}

export interface AdminMatchContentRow {
  id: number;
  creator_id: number;
  creator_name: string | null;
  created_at: Date;
  moderation_state: ModerationState;
  match_date: Date;
  locality: string;
  modality: string | null;
  description: string | null;
  match_state: MatchState;
}

export interface AdminCommentContentRow {
  id: number;
  author_id: number | null;
  author_name: string | null;
  player_id: number;
  player_name: string | null;
  created_at: Date;
  moderation_state: ModerationState;
  score: number;
  comment: string | null;
}

export interface AdminMatchForUpdateRow {
  id: number;
  creator_id: number;
  moderation_state: ModerationState;
  match_state: MatchState;
}

export interface AdminCommentForUpdateRow {
  id: number;
  author_id: number | null;
  player_id: number;
  moderation_state: ModerationState;
}

export interface AdminMatchUpdateFields {
  matchDate?: Date;
  locality?: string;
  modality?: string | null;
  description?: string | null;
}

export interface AdminCommentUpdateFields {
  score?: number;
  comment?: string | null;
}

const CONTENT_UNION_SQL = `
  SELECT
    'match'::text AS content_type,
    m.id,
    m.creator_id AS author_id,
    u.name AS author_name,
    m.created_at,
    m.moderation_state,
    m.match_date,
    m.locality,
    m.modality,
    m.description,
    m.state AS match_state,
    NULL::int AS score,
    NULL::text AS comment,
    NULL::int AS player_id,
    NULL::text AS player_name
  FROM matchs m
  JOIN users u ON u.id = m.creator_id
  WHERE ($1::text IS NULL OR $1 = 'match')
    AND ($2::text IS NULL OR m.moderation_state = $2)
    AND (
      $3::text IS NULL
      OR m.locality ILIKE $3
      OR m.modality ILIKE $3
      OR m.description ILIKE $3
      OR u.name ILIKE $3
    )
    AND ($4::int IS NULL OR m.creator_id = $4)
    AND ($5::timestamptz IS NULL OR m.created_at >= $5)
    AND ($6::timestamptz IS NULL OR m.created_at < $6)

  UNION ALL

  SELECT
    'comment'::text AS content_type,
    ur.id,
    ur.author_id,
    u.name AS author_name,
    ur.created_at,
    ur.moderation_state,
    NULL::timestamptz AS match_date,
    NULL::text AS locality,
    NULL::text AS modality,
    NULL::text AS description,
    NULL::text AS match_state,
    ur.score,
    ur.comment,
    ur.player_id,
    p.name AS player_name
  FROM usersratings ur
  LEFT JOIN users u ON u.id = ur.author_id
  JOIN users p ON p.id = ur.player_id
  WHERE ($1::text IS NULL OR $1 = 'comment')
    AND ($2::text IS NULL OR ur.moderation_state = $2)
    AND (
      $3::text IS NULL
      OR ur.comment ILIKE $3
      OR u.name ILIKE $3
      OR p.name ILIKE $3
    )
    AND ($4::int IS NULL OR ur.author_id = $4)
    AND ($5::timestamptz IS NULL OR ur.created_at >= $5)
    AND ($6::timestamptz IS NULL OR ur.created_at < $6)
`;

function contentFilterParams(filters: AdminContentFilters): QueryParam[] {
  return [
    filters.type,
    filters.state,
    filters.searchPattern,
    filters.authorId,
    filters.from,
    filters.to,
  ];
}

export function listContents(
  filters: AdminContentFilters,
): Promise<AdminContentUnionRow[]> {
  return query<AdminContentUnionRow>(
    `WITH combined AS (${CONTENT_UNION_SQL})
     SELECT *
     FROM combined
     ORDER BY created_at DESC, content_type ASC, id DESC
     LIMIT $7 OFFSET $8`,
    [...contentFilterParams(filters), filters.limit, filters.offset],
  ).then((result) => result.rows);
}

export async function countContents(
  filters: AdminContentFilters,
): Promise<number> {
  const result = await query<{ total: number }>(
    `WITH combined AS (${CONTENT_UNION_SQL})
     SELECT COUNT(*)::int AS total FROM combined`,
    contentFilterParams(filters),
  );

  return result.rows[0]?.total ?? 0;
}

export function findMatchContent(
  id: number,
): Promise<AdminMatchContentRow | null> {
  return query<AdminMatchContentRow>(
    `SELECT
       m.id,
       m.creator_id,
       u.name AS creator_name,
       m.created_at,
       m.moderation_state,
       m.match_date,
       m.locality,
       m.modality,
       m.description,
       m.state AS match_state
     FROM matchs m
     JOIN users u ON u.id = m.creator_id
     WHERE m.id = $1
     LIMIT 1`,
    [id],
  ).then((result) => result.rows[0] ?? null);
}

export function findMatchContentForUpdate(
  id: number,
  client: PoolClient,
): Promise<AdminMatchForUpdateRow | null> {
  return client
    .query<AdminMatchForUpdateRow>(
      `SELECT id, creator_id, moderation_state, state AS match_state
       FROM matchs
       WHERE id = $1
       FOR UPDATE`,
      [id],
    )
    .then((result) => result.rows[0] ?? null);
}

export async function moderateMatch(
  id: number,
  state: ModerationState,
  adminId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE matchs
     SET moderation_state = $2,
         moderated_at = now(),
         moderated_by = $3,
         updated_at = now()
     WHERE id = $1`,
    [id, state, adminId],
  );
}

export async function updateMatchFields(
  id: number,
  fields: AdminMatchUpdateFields,
  client: PoolClient,
): Promise<void> {
  const assignments: string[] = [];
  const params: QueryParam[] = [id];
  let index = 2;

  const add = (column: string, value: QueryParam): void => {
    assignments.push(`${column} = $${index}`);
    params.push(value);
    index += 1;
  };

  if (fields.matchDate !== undefined) add('match_date', fields.matchDate);
  if (fields.locality !== undefined) add('locality', fields.locality);
  if (fields.modality !== undefined) add('modality', fields.modality);
  if (fields.description !== undefined) {
    add('description', fields.description);
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = now()');
  await client.query(
    `UPDATE matchs
     SET ${assignments.join(', ')}
     WHERE id = $1`,
    params,
  );
}

export function findCommentContent(
  id: number,
): Promise<AdminCommentContentRow | null> {
  return query<AdminCommentContentRow>(
    `SELECT
       ur.id,
       ur.author_id,
       u.name AS author_name,
       ur.player_id,
       p.name AS player_name,
       ur.created_at,
       ur.moderation_state,
       ur.score,
       ur.comment
     FROM usersratings ur
     LEFT JOIN users u ON u.id = ur.author_id
     JOIN users p ON p.id = ur.player_id
     WHERE ur.id = $1
     LIMIT 1`,
    [id],
  ).then((result) => result.rows[0] ?? null);
}

export function findCommentContentForUpdate(
  id: number,
  client: PoolClient,
): Promise<AdminCommentForUpdateRow | null> {
  return client
    .query<AdminCommentForUpdateRow>(
      `SELECT id, author_id, player_id, moderation_state
       FROM usersratings
       WHERE id = $1
       FOR UPDATE`,
      [id],
    )
    .then((result) => result.rows[0] ?? null);
}

export async function moderateComment(
  id: number,
  state: ModerationState,
  adminId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE usersratings
     SET moderation_state = $2,
         moderated_at = now(),
         moderated_by = $3,
         updated_at = now()
     WHERE id = $1`,
    [id, state, adminId],
  );
}

export async function updateCommentFields(
  id: number,
  fields: AdminCommentUpdateFields,
  client: PoolClient,
): Promise<void> {
  const assignments: string[] = [];
  const params: QueryParam[] = [id];
  let index = 2;

  if (fields.score !== undefined) {
    assignments.push(`score = $${index}`);
    params.push(fields.score);
    index += 1;
  }
  if (fields.comment !== undefined) {
    assignments.push(`comment = $${index}`);
    params.push(fields.comment);
    index += 1;
  }

  if (assignments.length === 0) {
    return;
  }

  assignments.push('updated_at = now()');
  await client.query(
    `UPDATE usersratings
     SET ${assignments.join(', ')}
     WHERE id = $1`,
    params,
  );
}
