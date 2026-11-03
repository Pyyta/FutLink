import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { MatchState } from '../matches/matches.types.js';
import type { ModerationState } from '../../shared/moderation.js';
import type {
  RequestBox,
  RequestState,
  RequestType,
} from './requests.types.js';

export interface RequestRow {
  id: number;
  request_type: RequestType;
  state: RequestState;
  sender_id: number;
  receiver_id: number;
  match_id: number | null;
  matchvacant_id: number | null;
  target_user_id: number | null;
  created_at: Date;
  updated_at: Date;
  responded_at: Date | null;
  cancelled_at: Date | null;
  sender_name: string | null;
  sender_profile_pic: string | null;
  sender_locality: string | null;
  sender_rating_average: number | null;
  sender_rating_count: number;
  receiver_name: string | null;
  receiver_profile_pic: string | null;
  receiver_locality: string | null;
  receiver_rating_average: number | null;
  receiver_rating_count: number;
  match_date: Date | null;
  match_locality: string | null;
  match_state: MatchState | null;
  position: string | null;
}

export interface RequestHeaderRow {
  id: number;
  request_type: RequestType;
  state: RequestState;
  sender_id: number;
  receiver_id: number;
  match_id: number | null;
  matchvacant_id: number | null;
  target_user_id: number | null;
}

export interface RequestVacancyRow {
  id: number;
  match_id: number;
  position: string;
  occupied: boolean;
  creator_id: number;
  match_state: MatchState;
  match_date: Date;
  moderation_state: ModerationState;
}

export interface InsertRequestData {
  type: RequestType;
  senderId: number;
  receiverId: number;
  matchId: number | null;
  matchVacantId: number | null;
  targetUserId: number | null;
}

export interface ListRequestsFilters {
  viewerId: number;
  box: RequestBox;
  type: RequestType | null;
  state: RequestState | null;
  limit: number;
  offset: number;
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

const REQUEST_SELECT = `
  SELECT
    r.id,
    r.request_type,
    r.state,
    r.sender_id,
    r.receiver_id,
    r.match_id,
    r.matchvacant_id,
    r.target_user_id,
    r.created_at,
    r.updated_at,
    r.responded_at,
    r.cancelled_at,
    s.name AS sender_name,
    s.profile_pic AS sender_profile_pic,
    s.locality AS sender_locality,
    (
      SELECT AVG(score)::float8 FROM usersratings
      WHERE player_id = s.id AND moderation_state = 'visible'
    ) AS sender_rating_average,
    (
      SELECT COUNT(*)::int FROM usersratings
      WHERE player_id = s.id AND moderation_state = 'visible'
    ) AS sender_rating_count,
    t.name AS receiver_name,
    t.profile_pic AS receiver_profile_pic,
    t.locality AS receiver_locality,
    (
      SELECT AVG(score)::float8 FROM usersratings
      WHERE player_id = t.id AND moderation_state = 'visible'
    ) AS receiver_rating_average,
    (
      SELECT COUNT(*)::int FROM usersratings
      WHERE player_id = t.id AND moderation_state = 'visible'
    ) AS receiver_rating_count,
    m.match_date,
    m.locality AS match_locality,
    m.state AS match_state,
    mv.position
  FROM requests r
  JOIN users s ON s.id = r.sender_id
  JOIN users t ON t.id = r.receiver_id
  LEFT JOIN matchs m ON m.id = r.match_id
  LEFT JOIN matchvacants mv ON mv.id = r.matchvacant_id
`;

export function listRequests(
  filters: ListRequestsFilters,
): Promise<RequestRow[]> {
  const boxColumn = filters.box === 'sent' ? 'r.sender_id' : 'r.receiver_id';

  return executor()<RequestRow>(
    `${REQUEST_SELECT}
     WHERE ${boxColumn} = $1
       AND ($2::text IS NULL OR r.request_type = $2)
       AND ($3::text IS NULL OR r.state = $3)
     ORDER BY
       CASE r.state
         WHEN 'pending' THEN 0
         WHEN 'accepted' THEN 1
         ELSE 2
       END,
       r.created_at DESC,
       r.id DESC
     LIMIT $4 OFFSET $5`,
    [
      filters.viewerId,
      filters.type,
      filters.state,
      filters.limit,
      filters.offset,
    ],
  );
}

export async function countRequests(
  filters: ListRequestsFilters,
): Promise<number> {
  const boxColumn = filters.box === 'sent' ? 'r.sender_id' : 'r.receiver_id';

  const rows = await executor()<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM requests r
     WHERE ${boxColumn} = $1
       AND ($2::text IS NULL OR r.request_type = $2)
       AND ($3::text IS NULL OR r.state = $3)`,
    [filters.viewerId, filters.type, filters.state],
  );

  return rows[0]?.total ?? 0;
}

export function findRequestById(id: number): Promise<RequestRow | null> {
  return executor()<RequestRow>(
    `${REQUEST_SELECT}
     WHERE r.id = $1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function findRequestHeader(
  id: number,
): Promise<RequestHeaderRow | null> {
  return executor()<RequestHeaderRow>(
    `SELECT id, request_type, state, sender_id, receiver_id,
            match_id, matchvacant_id, target_user_id
     FROM requests
     WHERE id = $1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function lockRequest(
  id: number,
  client: PoolClient,
): Promise<RequestHeaderRow | null> {
  return client
    .query<RequestHeaderRow>(
      `SELECT id, request_type, state, sender_id, receiver_id,
              match_id, matchvacant_id, target_user_id
       FROM requests
       WHERE id = $1
       FOR UPDATE`,
      [id],
    )
    .then((result) => result.rows[0] ?? null);
}

export function findVacancy(id: number): Promise<RequestVacancyRow | null> {
  return executor()<RequestVacancyRow>(
    `SELECT mv.id, mv.match_id, mv.position, mv.occupied,
            m.creator_id, m.state AS match_state, m.match_date,
            m.moderation_state
     FROM matchvacants mv
     JOIN matchs m ON m.id = mv.match_id
     WHERE mv.id = $1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function lockVacancy(
  id: number,
  client: PoolClient,
): Promise<RequestVacancyRow | null> {
  return client
    .query<RequestVacancyRow>(
      `SELECT mv.id, mv.match_id, mv.position, mv.occupied,
              m.creator_id, m.state AS match_state, m.match_date,
              m.moderation_state
       FROM matchvacants mv
       JOIN matchs m ON m.id = mv.match_id
       WHERE mv.id = $1
       FOR UPDATE OF mv`,
      [id],
    )
    .then((result) => result.rows[0] ?? null);
}

export function insertRequest(
  data: InsertRequestData,
  client: PoolClient,
): Promise<number> {
  return client
    .query<{ id: number }>(
      `INSERT INTO requests
         (request_type, sender_id, receiver_id, match_id, matchvacant_id, target_user_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        data.type,
        data.senderId,
        data.receiverId,
        data.matchId,
        data.matchVacantId,
        data.targetUserId,
      ],
    )
    .then((result) => {
      const row = result.rows[0];
      if (!row) {
        throw new Error('No se pudo crear la solicitud');
      }
      return row.id;
    });
}

export async function markRequestAccepted(
  id: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE requests
     SET state = 'accepted',
         responded_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

export async function markRequestRejected(
  id: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE requests
     SET state = 'rejected',
         responded_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

export async function markRequestCancelled(
  id: number,
  cancelledBy: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE requests
     SET state = 'cancelled',
         cancelled_at = now(),
         cancelled_by = $2,
         updated_at = now()
     WHERE id = $1`,
    [id, cancelledBy],
  );
}

export async function occupyVacancy(
  id: number,
  client: PoolClient,
): Promise<void> {
  await client.query('UPDATE matchvacants SET occupied = true WHERE id = $1', [id]);
}

export async function freeVacancy(
  id: number,
  client: PoolClient,
): Promise<void> {
  await client.query('UPDATE matchvacants SET occupied = false WHERE id = $1', [id]);
}

export async function countFreeVacancies(
  matchId: number,
  client: PoolClient,
): Promise<number> {
  const result = await client.query<{ free: number }>(
    `SELECT COUNT(*)::int AS free
     FROM matchvacants
     WHERE match_id = $1 AND NOT occupied`,
    [matchId],
  );

  return result.rows[0]?.free ?? 0;
}

export async function setMatchState(
  matchId: number,
  state: MatchState,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE matchs
     SET state = $2,
         updated_at = now()
     WHERE id = $1`,
    [matchId, state],
  );
}
