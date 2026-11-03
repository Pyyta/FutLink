import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLogo } from '../components/layout/BrandLogo';

export function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 text-center">
      <BrandLogo />
      <p className="mt-6 text-caption font-semibold uppercase tracking-[0.18em] text-primary-700">
        404
      </p>
      <h1 className="mt-2 text-title text-ink">{t('notFound.title')}</h1>
      <p className="mt-1.5 max-w-xs text-sm text-ink-soft">
        {t('notFound.body')}
      </p>
      <Link
        to="/"
        className="mt-5 inline-flex h-11 items-center rounded-control bg-primary-600 px-4 text-sm font-semibold text-white transition hover:bg-primary-700"
      >
        {t('notFound.action')}
      </Link>
    </div>
  );
}
