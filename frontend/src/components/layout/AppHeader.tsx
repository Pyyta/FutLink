import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BellIcon, ShieldIcon } from '../ui/icons';
import { notificationsApi } from '../../lib/api/endpoints';
import { useSession } from '../../lib/auth/session-context';
import { getInitials } from '../../lib/format';
import { BrandLogo } from './BrandLogo';

export function AppHeader() {
  const { t } = useTranslation();
  const { user, isAdmin } = useSession();

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () =>
      notificationsApi.list({ status: 'unread', page: 1, pageSize: 1 }),
    enabled: Boolean(user),
    staleTime: 15_000,
  });

  if (!user) return null;

  const unreadCount = unreadQuery.data?.unreadCount ?? 0;

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <BrandLogo />

        <div className="flex items-center gap-1">
          {isAdmin ? (
            <Link
              to="/admin"
              aria-label={t('common.admin')}
              className="rounded-full p-2 text-brand-800 transition hover:bg-mint hover:text-primary-700"
            >
              <ShieldIcon size={20} />
            </Link>
          ) : null}

          <Link
            to="/notificaciones"
            aria-label={
              unreadCount > 0
                ? t('notifications.openUnread', { count: unreadCount })
                : t('notifications.open')
            }
            className="relative rounded-full p-2 text-brand-800 transition hover:bg-mint hover:text-primary-700"
          >
            <BellIcon size={20} />
            {unreadCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold leading-none text-white"
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>

          <Link
            to="/perfil"
            aria-label={t('nav.profile')}
            className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-line bg-mint text-xs font-bold text-primary-800 transition hover:border-primary-300"
          >
            {user.profilePic ? (
              <img
                src={user.profilePic}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(user.name, user.email)
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
