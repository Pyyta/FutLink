import type { QueryResultRow } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { ModerationState } from '../../shared/moderation.js';
import type { MatchState } from '../matches/matches.types.js';
import type { RequestState, RequestType } from '../requests/requests.types.js';
import type { ReportType } from './admin.types.js';

export interface ReportRow {
  id: number;
  report_type: ReportType;
  period_start: Date;
  period_end: Date;
  row_count: number;
  generated_by: number | null;
  generated_by_name: string | null;
  created_at: Date;
}

export interface ReportFilters {
  type: ReportType | null;
  limit: number;
  offset: number;
}

export interface ReportUserRow {
  id: number;
  name: string | null;
  email: string;
  phone: string | null;
  locality: string | null;
  role: string;
  state: string;
  register_date: Date;
  profile_completed_at: Date | null;
}

export interface ReportMatchRow {
  id: number;
  creator_id: number;
  creator_name: string | null;
  creator_email: string;
  match_date: Date;
  locality: string;
  modality: string | null;
  description: string | null;
  state: MatchState;
  moderation_state: ModerationState;
  created_at: Date;
}

export interface ReportRequestRow {
  id: number;
  request_type: RequestType;
  state: RequestState;
  sender_id: number;
  sender_name: string | null;
  sender_email: string;
  receiver_id: number;
  receiver_name: string | null;
  receiver_email: string;
  match_id: number | null;
  created_at: Date;
  responded_at: Date | null;
  accepted_at: Date | null;
  cancelled_at: Date | null;
}

function executor<T extends QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<T[]> {
  return query<T>(text, params).then((result) => result.rows);
}

export function insertReport(
  data: {
    type: ReportType;
    from: Date;
    to: Date;
    rowCount: number;
    csv: string;
    generatedBy: number;
  },
): Promise<ReportRow> {
  return executor<ReportRow>(
    `WITH inserted AS (
       INSERT INTO generatedreports
         (report_type, period_start, period_end, row_count, csv_data, generated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *
     )
     SELECT
       i.id,
       i.report_type,
       i.period_start,
       i.period_end,
       i.row_count,
       i.generated_by,
       u.name AS generated_by_name,
       i.created_at
     FROM inserted i
     LEFT JOIN users u ON u.id = i.generated_by`,
    [data.type, data.from, data.to, data.rowCount, data.csv, data.generatedBy],
  ).then((rows) => {
    const row = rows[0];
    if (!row) {
      throw new Error('No se pudo guardar el reporte');
    }
    return row;
  });
}

export function listReports(filters: ReportFilters): Promise<ReportRow[]> {
  return executor<ReportRow>(
    `SELECT
       r.id,
       r.report_type,
       r.period_start,
       r.period_end,
       r.row_count,
       r.generated_by,
       u.name AS generated_by_name,
       r.created_at
     FROM generatedreports r
     LEFT JOIN users u ON u.id = r.generated_by
     WHERE ($1::text IS NULL OR r.report_type = $1)
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT $2 OFFSET $3`,
    [filters.type, filters.limit, filters.offset],
  );
}

export async function countReports(filters: ReportFilters): Promise<number> {
  const rows = await executor<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM generatedreports r
     WHERE ($1::text IS NULL OR r.report_type = $1)`,
    [filters.type],
  );

  return rows[0]?.total ?? 0;
}

export function findReportById(id: number): Promise<ReportRow | null> {
  return executor<ReportRow>(
    `SELECT
       r.id,
       r.report_type,
       r.period_start,
       r.period_end,
       r.row_count,
       r.generated_by,
       u.name AS generated_by_name,
       r.created_at
     FROM generatedreports r
     LEFT JOIN users u ON u.id = r.generated_by
     WHERE r.id = $1
     LIMIT 1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

export function findReportCsv(id: number): Promise<string | null> {
  return executor<{ csv_data: string }>(
    'SELECT csv_data FROM generatedreports WHERE id = $1 LIMIT 1',
    [id],
  ).then((rows) => rows[0]?.csv_data ?? null);
}

export function listUsersForPeriod(
  from: Date,
  to: Date,
): Promise<ReportUserRow[]> {
  return executor<ReportUserRow>(
    `SELECT
       id, name, email, phone, locality, role, state,
       register_date, profile_completed_at
     FROM users
     WHERE register_date >= $1
       AND register_date < $2
     ORDER BY register_date ASC, id ASC`,
    [from, to],
  );
}

export function listMatchesForPeriod(
  from: Date,
  to: Date,
): Promise<ReportMatchRow[]> {
  return executor<ReportMatchRow>(
    `SELECT
       m.id,
       m.creator_id,
       u.name AS creator_name,
       u.email AS creator_email,
       m.match_date,
       m.locality,
       m.modality,
       m.description,
       m.state,
       m.moderation_state,
       m.created_at
     FROM matchs m
     JOIN users u ON u.id = m.creator_id
     WHERE m.created_at >= $1
       AND m.created_at < $2
     ORDER BY m.created_at ASC, m.id ASC`,
    [from, to],
  );
}

export function listRequestsForPeriod(
  from: Date,
  to: Date,
): Promise<ReportRequestRow[]> {
  return executor<ReportRequestRow>(
    `SELECT
       r.id,
       r.request_type,
       r.state,
       r.sender_id,
       s.name AS sender_name,
       s.email AS sender_email,
       r.receiver_id,
       t.name AS receiver_name,
       t.email AS receiver_email,
       r.match_id,
       r.created_at,
       r.responded_at,
       CASE WHEN r.state = 'accepted' THEN r.responded_at END AS accepted_at,
       r.cancelled_at
     FROM requests r
     JOIN users s ON s.id = r.sender_id
     JOIN users t ON t.id = r.receiver_id
     WHERE r.created_at >= $1
       AND r.created_at < $2
     ORDER BY r.created_at ASC, r.id ASC`,
    [from, to],
  );
}
