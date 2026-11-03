import type { RequestType } from '../requests/requests.types.js';

export type NotificationType =
  | 'request_accepted'
  | 'request_cancelled'
  | 'match_cancelled'
  | 'content_hidden'
  | 'content_deleted';

export type NotificationStatusFilter = 'unread' | 'all';

export interface NotificationActorDto {
  id: number;
  name: string | null;
  profilePic: string | null;
}

export interface NotificationRequestDto {
  id: number;
  type: RequestType;
}

export interface NotificationMatchDto {
  id: number;
  matchDate: string;
  locality: string;
}

export interface NotificationContentDto {
  type: 'match' | 'comment';
  id: number;
}

export interface NotificationDto {
  id: number;
  type: NotificationType;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActorDto | null;
  request: NotificationRequestDto | null;
  match: NotificationMatchDto | null;
  content: NotificationContentDto | null;
}

export interface NotificationPageDto {
  items: NotificationDto[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListNotificationsInput {
  status: NotificationStatusFilter;
  page: number;
  pageSize: number;
}

export interface MarkNotificationReadResultDto {
  notification: NotificationDto;
  unreadCount: number;
}

export interface CreateNotificationData {
  userId: number;
  type: NotificationType;
  requestId: number | null;
  matchId: number | null;
  ratingId?: number | null;
  actorId: number;
}
