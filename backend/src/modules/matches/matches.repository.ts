import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { MatchState } from './matches.types.js';
import type { ModerationState } from '../../shared/moderation.js';

export interface MatchBaseRow {
  id: number;
  creator_id: number;
  creator_name: string | null;
  creator_profile_pic: string | null;
  match_date: Date;
  locality: string;
  modality: string | null;
  description: string | null;
  state: MatchState;
  total_spots: number;
  free_spots: number;
}

export interface MatchListRow extends MatchBaseRow {
  distance_meters: number | null;
}

export interface MatchDetailRow extends MatchBaseRow {
  created_at: Date;
  cancelled_at: Date | null;
  moderation_state: ModerationState;
}

export interface PositionSummaryRow {
  match_id: number;
  position_id: number;
  position: string;
  slots: number;
  free_slots: number;
}

export interface VacancyRow {
  id: number;
  position_id: number;
  position: string;
  occupied: boolean;
}

export interface MatchLockRow {
  creator_id: number;
  state: MatchState;
  moderation_state: ModerationState;
}

export interface CancelledRequestRow {
  id: number;
  sender_id: number;
}

export interface MatchSearchFilters {
  locality: string | null;
  dateStart: Date | null;
  dateEnd: Date | null;
  position: string | null;
  latitude: number | null;
  longitude: number | null;
  limit: number;
  offset: number;
}

export interface InsertMatchData {
  creatorId: number;
  matchDate: Date;
  locality: string;
  modality: string | null;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
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

/**
 * Filtros compartidos por la lista y el conteo de RF-04. Solo partidos
 * disponibles, futuros y con al menos una plaza libre.
 * $1 zona, $2–$3 rango de fecha, $4 posición requerida.
 */
const SEARCH_FILTERS = `
  m.state = 'available'
  AND m.moderation_state = 'visible'
  AND m.match_date >= now()
  AND ($1::text IS NULL OR m.locality = $1)
  AND ($2::timestamptz IS NULL OR m.match_date >= $2)
  AND ($3::timestamptz IS NULL OR m.match_date < $3)
  AND (
    $4::text IS NULL
    OR EXISTS (
      SELECT 1
      FROM matchvacants mvf
      WHERE mvf.match_id = m.id
        AND mvf.position = $4
        AND NOT mvf.occupied
    )
  )
`;

export async function insertMatch(
  data: InsertMatchData,
  client: PoolClient,
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO matchs
       (creator_id, match_date, locality, modality, description, location)
     VALUES (
       $1, $2, $3, $4, $5,
       CASE
         WHEN $6::float8 IS NULL OR $7::float8 IS NULL THEN NULL
         ELSE ST_SetSRID(ST_MakePoint($7::float8, $6::float8), 4326)::geography
       END
     )
     RETURNING id`,
    [
      data.creatorId,
      data.matchDate,
      data.locality,
      data.modality,
      data.description,
      data.latitude,
      data.longitude,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('No se pudo crear el partido');
  }
  return row.id;
}

export async function insertVacancies(
  matchId: number,
  positions: string[],
  client: PoolClient,
): Promise<void> {
  await client.query(
    `INSERT INTO matchvacants (match_id, position)
     SELECT $1, unnest($2::text[])`,
    [matchId, positions],
  );
}

export async function searchMatches(
  filters: MatchSearchFilters,
): Promise<MatchListRow[]> {
  return executor()<MatchListRow>(
    `SELECT
       m.id,
       m.creator_id,
       u.name AS creator_name,
       u.profile_pic AS creator_profile_pic,
       m.match_date,
       m.locality,
       m.modality,
       m.description,
       m.state,
       COUNT(*)::int AS total_spots,
       COUNT(*) FILTER (WHERE NOT mv.occupied)::int AS free_spots,
       CASE
         WHEN $5::float8 IS NOT NULL AND m.location IS NOT NULL
         THEN ST_Distance(
           m.location,
           ST_SetSRID(ST_MakePoint($6::float8, $5::float8), 4326)::geography
         )
       END AS distance_meters
     FROM matchs m
     JOIN users u ON u.id = m.creator_id
     JOIN matchvacants mv ON mv.match_id = m.id
     WHERE ${SEARCH_FILTERS}
     GROUP BY m.id, u.id
     HAVING COUNT(*) FILTER (WHERE NOT mv.occupied) > 0
     ORDER BY distance_meters ASC NULLS LAST, m.match_date ASC, m.id ASC
     LIMIT $7 OFFSET $8`,
    [
      filters.locality,
      filters.dateStart,
      filters.dateEnd,
      filters.position,
      filters.latitude,
      filters.longitude,
      filters.limit,
      filters.offset,
    ],
  );
}

export async function countMatches(filters: MatchSearchFilters): Promise<number> {
  const rows = await executor()<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM (
       SELECT m.id
       FROM matchs m
       JOIN matchvacants mv ON mv.match_id = m.id
       WHERE ${SEARCH_FILTERS}
       GROUP BY m.id
       HAVING COUNT(*) FILTER (WHERE NOT mv.occupied) > 0
     ) AS available_matches`,
    [filters.locality, filters.dateStart, filters.dateEnd, filters.position],
  );

  return rows[0]?.total ?? 0;
}

export function listPositionSummaries(
  matchIds: number[],
): Promise<PositionSummaryRow[]> {
  return executor()<PositionSummaryRow>(
    `SELECT
       mv.match_id,
       p.id AS position_id,
       p.title AS position,
       COUNT(*)::int AS slots,
       COUNT(*) FILTER (WHERE NOT mv.occupied)::int AS free_slots
     FROM matchvacants mv
     JOIN positions p ON p.title = mv.position
     WHERE mv.match_id = ANY($1::int[])
     GROUP BY mv.match_id, p.id, p.title
     ORDER BY p.id`,
    [matchIds],
  );
}

export function findMatchDetail(id: number): Promise<MatchDetailRow | null> {
  return executor()<MatchDetailRow>(
    `SELECT
       m.id,
       m.creator_id,
       u.name AS creator_name,
       u.profile_pic AS creator_profile_pic,
       m.match_date,
       m.locality,
       m.modality,
       m.description,
       m.state,
       m.created_at,
       m.cancelled_at,
       m.moderation_state,
       COUNT(*)::int AS total_spots,
       COUNT(*) FILTER (WHERE NOT mv.occupied)::int AS free_spots
     FROM matchs m
     JOIN users u ON u.id = m.creator_id
     JOIN matchvacants mv ON mv.match_id = m.id
     WHERE m.id = $1
     GROUP BY m.id, u.id`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function listVacancies(matchId: number): Promise<VacancyRow[]> {
  return executor()<VacancyRow>(
    `SELECT mv.id, p.id AS position_id, p.title AS position, mv.occupied
     FROM matchvacants mv
     JOIN positions p ON p.title = mv.position
     WHERE mv.match_id = $1
     ORDER BY mv.id`,
    [matchId],
  );
}

export function lockMatch(
  id: number,
  client: PoolClient,
): Promise<MatchLockRow | null> {
  return client
    .query<MatchLockRow>(
      `SELECT creator_id, state, moderation_state
       FROM matchs
       WHERE id = $1
       FOR UPDATE`,
      [id],
    )
    .then((result) => result.rows[0] ?? null);
}

export async function markMatchCancelled(
  id: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    `UPDATE matchs
     SET state = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
     WHERE id = $1`,
    [id],
  );
}

export async function releaseVacancies(
  matchId: number,
  client: PoolClient,
): Promise<void> {
  await client.query(
    'UPDATE matchvacants SET occupied = false WHERE match_id = $1',
    [matchId],
  );
}

/**
 * Cancela las solicitudes que seguían activas. Las rechazadas y las ya
 * canceladas conservan su estado. El borrado es lógico: se mantiene el historial.
 */
export async function cancelActiveRequests(
  matchId: number,
  cancelledBy: number,
  client: PoolClient,
): Promise<CancelledRequestRow[]> {
  const result = await client.query<CancelledRequestRow>(
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
