import { AppError } from '../../shared/errors.js';
import * as repository from './notifications.repository.js';
import type { NotificationRow } from './notifications.repository.js';
import type {
  ListNotificationsInput,
  MarkNotificationReadResultDto,
  NotificationDto,
  NotificationPageDto,
} from './notifications.types.js';

function notificationNotFound(): AppError {
  return new AppError(
    404,
    'NOTIFICATION_NOT_FOUND',
    'No existe la notificación indicada',
  );
}

function toNotificationDto(row: NotificationRow): NotificationDto {
  const actor =
    row.actor_id === null
      ? null
      : {
          id: row.actor_id,
          name: row.actor_name,
          profilePic: row.actor_profile_pic,
        };

  const match =
    row.match_id !== null &&
    row.match_date !== null &&
    row.match_locality !== null
      ? {
          id: row.match_id,
          matchDate: row.match_date.toISOString(),
          locality: row.match_locality,
        }
      : null;

  const request =
    row.request_id !== null && row.request_type !== null
      ? {
          id: row.request_id,
          type: row.request_type,
        }
      : null;

  let content: NotificationDto['content'] = null;
  if (row.type === 'content_hidden' || row.type === 'content_deleted') {
    if (row.rating_id !== null) {
      content = { type: 'comment', id: row.rating_id };
    } else if (row.match_id !== null) {
      content = { type: 'match', id: row.match_id };
    }
  }

  return {
    id: row.id,
    type: row.type,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    actor,
    request,
    match,
    content,
  };
}

export async function listNotifications(
  userId: number,
  input: ListNotificationsInput,
): Promise<NotificationPageDto> {
  const filters: repository.ListNotificationsFilters = {
    userId,
    status: input.status,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total, unreadCount] = await Promise.all([
    repository.listNotifications(filters),
    repository.countNotifications(filters),
    repository.countUnread(userId),
  ]);

  return {
    items: rows.map(toNotificationDto),
    unreadCount,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

/**
 * Marca una notificación como leída. Si pertenece a otra cuenta se responde
 * 404 para no revelar su existencia.
 */
export async function markNotificationRead(
  userId: number,
  notificationId: number,
): Promise<MarkNotificationReadResultDto> {
  const current = await repository.findNotificationById(notificationId);
  if (!current || current.user_id !== userId) {
    throw notificationNotFound();
  }

  if (current.read_at === null) {
    await repository.markNotificationRead(notificationId, userId);
  }

  const [updated, unreadCount] = await Promise.all([
    repository.findNotificationById(notificationId),
    repository.countUnread(userId),
  ]);

  if (!updated) {
    throw notificationNotFound();
  }

  return {
    notification: toNotificationDto(updated),
    unreadCount,
  };
}
