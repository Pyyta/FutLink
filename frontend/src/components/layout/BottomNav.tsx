import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ClipboardListIcon,
  HomeIcon,
  SearchIcon,
  UserIcon,
  type IconProps,
} from '../ui/icons';

interface NavItem {
  to: string;
  labelKey: string;
  icon: ComponentType<IconProps>;
  end?: boolean;
}

const items: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: HomeIcon, end: true },
  { to: '/buscar', labelKey: 'nav.search', icon: SearchIcon },
  { to: '/solicitudes', labelKey: 'nav.requests', icon: ClipboardListIcon },
  { to: '/perfil', labelKey: 'nav.profile', icon: UserIcon },
];

export function BottomNav() {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-app -translate-x-1/2 border-t border-line bg-white/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-nav backdrop-blur">
      <nav
        aria-label={t('nav.primary')}
        className="flex items-stretch gap-1 px-2 pt-1.5"
      >
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end ?? false}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-2xl px-1 py-1.5 text-[11px] font-semibold transition ${
                  isActive
                    ? 'text-primary-800'
                    : 'text-ink-faint hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                      isActive
                        ? 'bg-mint text-primary-700'
                        : 'text-ink-soft'
                    }`}
                  >
                    <Icon size={20} />
                  </span>
                  <span>{t(item.labelKey)}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
