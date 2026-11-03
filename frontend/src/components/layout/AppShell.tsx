import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';

export function AppShell() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-surface-sunken">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-control bg-white px-4 py-2 text-sm font-semibold text-ink shadow-card focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('common.skipToContent')}
      </a>

      <div className="mx-auto flex min-h-dvh w-full max-w-app flex-col bg-white shadow-frame">
        <AppHeader />
        <main id="contenido" className="flex-1 px-5 pt-5 pb-28">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
