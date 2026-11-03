import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AlertCircleIcon,
  BellIcon,
  Button,
  CalendarIcon,
  Card,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Chip,
  InfoIcon,
  ShieldIcon,
  Spinner,
  useToast,
  type IconProps,
} from '../components/ui';
import { getErrorMessage } from '../lib/api/error-message';
import { notificationsApi } from '../lib/api/endpoints';
import type {
  NotificationDto,
  NotificationStatus,
  NotificationType,
} from '../lib/api/types';
import {
  formatDateTime,
  formatMatchDate,
  formatMatchTime,
} from '../lib/format';
import { isAppLocale, type AppLocale } from '../i18n';

const PAGE_SIZE = 10;

const typeIcons: Record<
  NotificationType,
  ComponentType<IconProps>
> = {
  request_accepted: CheckCircleIcon,
  request_cancelled: InfoIcon,
  match_cancelled: CalendarIcon,
  content_hidden: ShieldIcon,
  content_deleted: AlertCircleIcon,
};

const typeTones: Record<NotificationType, string> = {
  request_accepted: 'bg-success-50 text-success-700',
  request_cancelled: 'bg-warning-50 text-warning-700',
  match_cancelled: 'bg-danger-50 text-danger-700',
  content_hidden: 'bg-warning-50 text-warning-700',
  content_deleted: 'bg-danger-50 text-danger-700',
};

function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return isAppLocale(i18n.language) ? i18n.language : 'es-CO';
}

interface NotificationCopy {
  text: string;
  link: string | null;
  linkLabel: string | null;
}

function getNotificationCopy(
  notification: NotificationDto,
  t: TFunction,
  locale: AppLocale,
): NotificationCopy {
  const actorName =
    notification.actor?.name ??
    (notification.type.startsWith('content_')
      ? t('notifications.administrator')
      : t('notifications.someone'));
  const date = notification.match
    ? `${formatMatchDate(notification.match.matchDate, locale)} · ${formatMatchTime(
        notification.match.matchDate,
        locale,
      )}`
    : '';
  const locality = notification.match?.locality ?? '';

  switch (notification.type) {
    case 'request_accepted': {
      const isMatch = notification.request?.type === 'match';
      return {
        text: isMatch
          ? notification.match
            ? t('notifications.types.request_accepted_match', {
                name: actorName,
                date,
                locality,
              })
            : t('notifications.types.request_accepted_match_simple', {
                name: actorName,
              })
          : t('notifications.types.request_accepted_player', {
              name: actorName,
            }),
        link: notification.request ? '/solicitudes?box=sent' : null,
        linkLabel: notification.request
          ? t('notifications.viewRequest')
          : null,
      };
    }

    case 'request_cancelled': {
      const isMatch = notification.request?.type === 'match';
      return {
        text: isMatch
          ? notification.match
            ? t('notifications.types.request_cancelled_match', {
                name: actorName,
                date,
                locality,
              })
            : t('notifications.types.request_cancelled_match_simple', {
                name: actorName,
              })
          : t('notifications.types.request_cancelled_player', {
              name: actorName,
            }),
        link: notification.request ? '/solicitudes?box=received' : null,
        linkLabel: notification.request
          ? t('notifications.viewRequest')
          : null,
      };
    }

    case 'match_cancelled':
      return {
        text: notification.match
          ? t('notifications.types.match_cancelled', {
              name: actorName,
              date,
              locality,
            })
          : t('notifications.types.match_cancelled_simple', {
              name: actorName,
            }),
        link: notification.match
          ? `/partidos/${notification.match.id}`
          : null,
        linkLabel: notification.match
          ? t('notifications.viewMatch')
          : null,
      };

    case 'content_hidden':
    case 'content_deleted': {
      const key =
        notification.type === 'content_hidden'
          ? 'content_hidden'
          : 'content_deleted';

      if (notification.content?.type === 'match' || notification.match) {
        const matchId =
          notification.content?.type === 'match'
            ? notification.content.id
            : notification.match?.id;
        return {
          text: notification.match
            ? t(`notifications.types.${key}_match`, {
                name: actorName,
                date,
                locality,
              })
            : t(`notifications.types.${key}_match_simple`, {
                name: actorName,
              }),
          link: matchId ? `/partidos/${matchId}` : null,
          linkLabel: matchId ? t('notifications.viewMatch') : null,
        };
      }

      return {
        text: t(`notifications.types.${key}_comment`, { name: actorName }),
        link: null,
        linkLabel: null,
      };
    }
  }
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="sm"
        leadingIcon={<ChevronLeftIcon size={16} />}
        disabled={page <= 1}
        onClick={() => {
          onChange(page - 1);
        }}
      >
        {t('notifications.previous')}
      </Button>

      <p className="text-xs font-semibold text-ink-soft">
        {t('notifications.pageOf', { page, totalPages })}
      </p>

      <Button
        variant="outline"
        size="sm"
        trailingIcon={<ChevronRightIcon size={16} />}
        disabled={page >= totalPages}
        onClick={() => {
          onChange(page + 1);
        }}
      >
        {t('notifications.next')}
      </Button>
    </div>
  );
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<NotificationStatus>('unread');
  const [page, setPage] = useState(1);

  const notificationsQuery = useQuery({
    queryKey: ['notifications', status, page],
    queryFn: () =>
      notificationsApi.list({ status, page, pageSize: PAGE_SIZE }),
  });

  useEffect(() => {
    const data = notificationsQuery.data;
    if (!data || notificationsQuery.isFetching || page <= 1) return;
    if (data.notifications.length === 0 && data.totalPages < page) {
      setPage(Math.max(1, data.totalPages));
    }
  }, [page, notificationsQuery.data, notificationsQuery.isFetching]);

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: () => {
      show('success', t('notifications.markedRead'));
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({
        queryKey: ['notifications-unread'],
      });
    },
    onError: (error) => {
      show('error', getErrorMessage(error, t));
    },
  });

  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const notifications = notificationsQuery.data?.notifications ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle')}
      />

      <div className="flex items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={t('notifications.tabsLabel')}
          className="grid grid-cols-2 gap-1 rounded-pill bg-surface-sunken p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={status === 'unread'}
            onClick={() => {
              setStatus('unread');
              setPage(1);
            }}
            className={`rounded-pill px-3 py-1.5 text-sm font-semibold transition ${
              status === 'unread'
                ? 'bg-white text-brand-950 shadow-card'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t('notifications.unreadTab')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={status === 'all'}
            onClick={() => {
              setStatus('all');
              setPage(1);
            }}
            className={`rounded-pill px-3 py-1.5 text-sm font-semibold transition ${
              status === 'all'
                ? 'bg-white text-brand-950 shadow-card'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t('notifications.allTab')}
          </button>
        </div>

        <Chip tone="primary" className="shrink-0">
          {t('notifications.unreadCount', { count: unreadCount })}
        </Chip>
      </div>

      {notificationsQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : notificationsQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <p className="text-sm font-semibold text-primary-900">
              {notificationsQuery.error
                ? getErrorMessage(notificationsQuery.error, t)
                : t('notifications.loadError')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={notificationsQuery.isFetching}
            onClick={() => {
              void notificationsQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : notifications.length > 0 ? (
        <>
          <ul className="space-y-3">
            {notifications.map((notification) => {
              const copy = getNotificationCopy(notification, t, locale);
              const Icon = typeIcons[notification.type];
              const unread = notification.readAt === null;
              const marking =
                markReadMutation.isPending &&
                markReadMutation.variables === notification.id;

              return (
                <li key={notification.id}>
                  <Card
                    tone={unread ? 'mint' : 'white'}
                    padding="md"
                    className="space-y-2"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${typeTones[notification.type]}`}
                      >
                        <Icon size={20} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-relaxed text-ink">
                            {copy.text}
                          </p>
                          {unread ? (
                            <span className="mt-1 flex shrink-0 items-center gap-1">
                              <span className="sr-only">
                                {t('notifications.unreadTab')}
                              </span>
                              <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 rounded-full bg-primary-600"
                              />
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-1 text-xs text-ink-faint">
                          {formatDateTime(notification.createdAt, locale)}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {copy.link ? (
                            <Link
                              to={copy.link}
                              className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                            >
                              {copy.linkLabel}
                            </Link>
                          ) : null}

                          {unread ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={marking}
                              onClick={() => {
                                markReadMutation.mutate(notification.id);
                              }}
                            >
                              {t('notifications.markRead')}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={notificationsQuery.data?.page ?? page}
            totalPages={notificationsQuery.data?.totalPages ?? 0}
            onChange={setPage}
          />
        </>
      ) : (
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-primary-700">
              <BellIcon size={20} />
            </span>
            <p className="text-sm text-ink-soft">
              {status === 'unread'
                ? t('notifications.emptyUnread')
                : t('notifications.emptyAll')}
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
