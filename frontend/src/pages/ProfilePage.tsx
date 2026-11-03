import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LoadingScreen } from '../components/layout/LoadingScreen';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { StarRating } from '../components/ui/StarRating';
import {
  GlobeIcon,
  LogOutIcon,
  ShieldIcon,
} from '../components/ui/icons';
import {
  SUPPORTED_LOCALES,
  changeAppLanguage,
  isAppLocale,
  type AppLocale,
} from '../i18n';
import { useSession } from '../lib/auth/session-context';
import { formatMonthYear, getInitials } from '../lib/format';

export function ProfilePage() {
  const { t, i18n } = useTranslation();
  const { user, isAdmin, signOut } = useSession();
  const navigate = useNavigate();

  if (!user) return <LoadingScreen />;

  const locale: AppLocale = isAppLocale(i18n.language)
    ? i18n.language
    : 'es-CO';
  const average = user.rating.average;

  return (
    <div className="space-y-5">
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      <div className="grid gap-2">
        <Button
          fullWidth
          onClick={() => {
            navigate('/perfil/editar');
          }}
        >
          {t('profile.editAction')}
        </Button>
        <Button
          variant="outline"
          fullWidth
          onClick={() => {
            navigate(`/jugadores/${user.id}`);
          }}
        >
          {t('profile.viewPublic')}
        </Button>
      </div>

      <Card tone="mint" padding="lg">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-white text-lg font-extrabold text-primary-800 shadow-card">
            {user.profilePic ? (
              <img
                src={user.profilePic}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(user.name, user.email)
            )}
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-heading text-brand-950">
              {user.name ?? user.email}
            </h2>
            <p className="truncate text-sm text-ink-soft">{user.email}</p>
          </div>
        </div>

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-start justify-between gap-4">
            <dt className="text-ink-soft">{t('profile.phone')}</dt>
            <dd className="text-right font-medium text-ink">
              {user.phone ?? t('profile.noPhone')}
            </dd>
          </div>

          <div className="flex items-start justify-between gap-4">
            <dt className="text-ink-soft">{t('profile.locality')}</dt>
            <dd className="text-right font-medium text-ink">
              {user.locality ?? t('profile.noLocality')}
            </dd>
          </div>

          <div className="flex items-start justify-between gap-4">
            <dt className="text-ink-soft">{t('profile.rating')}</dt>
            <dd className="text-right font-medium text-ink">
              {user.rating.count > 0 && average !== null ? (
                <span className="inline-flex items-center gap-2">
                  <StarRating
                    value={average}
                    size="sm"
                    label={t('components.starRating.label', {
                      value: average.toFixed(1),
                      max: 5,
                    })}
                  />
                  <span>{average.toFixed(1)}</span>
                  <span className="text-ink-faint">({user.rating.count})</span>
                </span>
              ) : (
                t('profile.noRating')
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-4">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {t('profile.positions')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {user.positions.length > 0 ? (
              user.positions.map((position) => (
                <Chip key={position.id} tone="primary">
                  {position.title}
                </Chip>
              ))
            ) : (
              <Chip>{t('profile.noPositions')}</Chip>
            )}
          </div>
        </div>
      </Card>

      <Card padding="lg">
        <div className="flex items-center gap-2">
          <GlobeIcon size={18} className="text-primary-700" />
          <h2 className="text-heading text-ink">
            {t('profile.languageTitle')}
          </h2>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {t('profile.languageBody')}
        </p>

        <select
          value={locale}
          onChange={(event) => {
            const next = event.target.value;
            if (isAppLocale(next)) {
              void changeAppLanguage(next);
            }
          }}
          aria-label={t('profile.languageTitle')}
          className="mt-3 h-11 w-full rounded-control border border-line-strong bg-white px-3 text-sm font-medium text-ink transition focus:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/30"
        >
          {SUPPORTED_LOCALES.map((option) => (
            <option key={option} value={option}>
              {t(
                option === 'es-CO'
                  ? 'language.esCO'
                  : option === 'es-AR'
                    ? 'language.esAR'
                    : 'language.esMX',
              )}
            </option>
          ))}
        </select>
      </Card>

      {isAdmin ? (
        <Link to="/admin" className="block">
          <Card tone="brand" padding="lg">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-accent-lime">
                <ShieldIcon size={20} />
              </span>
              <div>
                <h2 className="text-heading text-white">{t('common.admin')}</h2>
                <p className="text-sm text-white/70">{t('admin.subtitle')}</p>
              </div>
            </div>
          </Card>
        </Link>
      ) : null}

      <Button
        variant="danger"
        fullWidth
        leadingIcon={<LogOutIcon size={18} />}
        onClick={() => {
          void signOut();
        }}
      >
        {t('common.logout')}
      </Button>

      <p className="pb-2 text-center text-caption text-ink-faint">
        {t('profile.memberSince', {
          date: formatMonthYear(user.createdAt, locale),
        })}
      </p>
    </div>
  );
}
