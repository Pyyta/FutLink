import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldIcon } from '../components/ui/icons';

export function ForbiddenPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-brand-800">
        <ShieldIcon size={30} />
      </span>
      <h1 className="mt-4 text-title text-ink">{t('forbidden.title')}</h1>
      <p className="mt-1.5 max-w-xs text-sm text-ink-soft">
        {t('forbidden.body')}
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex h-11 items-center rounded-control bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
      >
        {t('forbidden.action')}
      </Link>
    </div>
  );
}
