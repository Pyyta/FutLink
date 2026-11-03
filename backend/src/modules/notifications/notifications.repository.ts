import type { PoolClient, QueryResultRow } from 'pg';
import { query } from '../../config/db.js';
import type { QueryParam } from '../../config/db.js';
import type { RequestType } from '../requests/requests.types.js';
import type {
  CreateNotificationData,
  NotificationType,
} from './notifications.types.js';

export interface NotificationRow {
  id: number;
  user_id: number;
  type: NotificationType;
  read_at: Date | null;
  created_at: Date;
  actor_id: number | null;
  actor_name: string | null;
  actor_profile_pic: string | null;
  request_id: number | null;
  request_type: RequestType | null;
  match_id: number | null;
  match_date: Date | null;
  match_locality: string | null;
  rating_id: number | null;
}

export interface ListNotificationsFilters {
  userId: number;
  status: 'unread' | 'all';
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

const NOTIFICATION_SELECT = `
  SELECT
    n.id,
    n.user_id,
    n.type,
    n.read_at,
    n.created_at,
    n.actor_id,
    a.name AS actor_name,
    a.profile_pic AS actor_profile_pic,
    n.request_id,
    r.request_type,
    n.match_id,
    m.match_date,
    m.locality AS match_locality,
    n.rating_id
  FROM notifications n
  LEFT JOIN users a ON a.id = n.actor_id
  LEFT JOIN requests r ON r.id = n.request_id
  LEFT JOIN matchs m ON m.id = n.match_id
`;

export function listNotifications(
  filters: ListNotificationsFilters,
): Promise<NotificationRow[]> {
  return executor()<NotificationRow>(
    `${NOTIFICATION_SELECT}
     WHERE n.user_id = $1
       AND ($2::text = 'all' OR n.read_at IS NULL)
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $3 OFFSET $4`,
    [filters.userId, filters.status, filters.limit, filters.offset],
  );
}

export async function countNotifications(
  filters: ListNotificationsFilters,
): Promise<number> {
  const rows = await executor()<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM notifications n
     WHERE n.user_id = $1
       AND ($2::text = 'all' OR n.read_at IS NULL)`,
    [filters.userId, filters.status],
  );

  return rows[0]?.total ?? 0;
}

export async function countUnread(userId: number): Promise<number> {
  const rows = await executor()<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM notifications
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );

  return rows[0]?.total ?? 0;
}

export function findNotificationById(
  id: number,
): Promise<NotificationRow | null> {
  return executor()<NotificationRow>(
    `${NOTIFICATION_SELECT}
     WHERE n.id = $1`,
    [id],
  ).then((rows) => rows[0] ?? null);
}

/**
 * Se ejecuta dentro de la transacción que cambia el estado de la solicitud:
 * si la acción falla, la notificación no queda huérfana.
 */
export async function insertNotification(
  data: CreateNotificationData,
  client: PoolClient,
): Promise<void> {
  // RF-14: el administrador puede apagar la generación de notificaciones.
  const setting = await client.query<{ value: unknown }>(
    `SELECT value FROM systemsettings
     WHERE key = 'notifications.enabled'
     LIMIT 1`,
  );
  if (setting.rows[0]?.value === false) {
    return;
  }

  await client.query(
    `INSERT INTO notifications
       (user_id, type, request_id, match_id, rating_id, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      data.userId,
      data.type,
      data.requestId,
      data.matchId,
      data.ratingId ?? null,
      data.actorId,
    ],
  );
}

/**
 * Marca como leída solo si pertenece al usuario. Es idempotente: si ya estaba
 * leída, conserva la fecha original.
 */
export async function markNotificationRead(
  id: number,
  userId: number,
): Promise<void> {
  await query(
    `UPDATE notifications
     SET read_at = COALESCE(read_at, now())
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
}
