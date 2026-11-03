import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card } from '../components/ui';
import {
  ClipboardListIcon,
  MapPinIcon,
  SearchIcon,
  ShieldIcon,
} from '../components/ui/icons';
import { useSession } from '../lib/auth/session-context';
import { getInitials } from '../lib/format';

export function HomePage() {
  const { t } = useTranslation();
  const { user, isAdmin } = useSession();
  const navigate = useNavigate();

  if (!user) return null;

  const firstName = user.name?.trim().split(/\s+/)[0] ?? user.email;
  const hasRating = user.rating.count > 0 && user.rating.average !== null;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t('common.tagline')}
        title={t('home.title', { name: firstName })}
        subtitle={t('home.subtitle')}
      />

      <Card tone="brand" padding="lg">
        <span className="inline-flex rounded-pill bg-white/10 px-3 py-1 text-caption font-semibold uppercase tracking-[0.12em] text-accent-lime">
          FutLink
        </span>
        <h2 className="mt-3 text-title">{t('home.heroTitle')}</h2>
        <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-white/70">
          {t('home.heroBody')}
        </p>
        <Button
          variant="secondary"
          fullWidth
          className="mt-4"
          leadingIcon={<SearchIcon size={18} />}
          onClick={() => {
            navigate('/buscar');
          }}
        >
          {t('home.heroAction')}
        </Button>
      </Card>

      <Card tone="mint" padding="lg">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-white text-base font-extrabold text-primary-800 shadow-card">
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
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-ink-soft">
              <MapPinIcon size={14} className="shrink-0 text-primary-700" />
              <span className="truncate">
                {user.locality ?? t('profile.noLocality')}
              </span>
            </p>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-control bg-white/70 px-2 py-2.5">
            <dt className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-faint">
              {t('home.statsMatches')}
            </dt>
            <dd className="mt-0.5 text-lg font-extrabold text-brand-950">
              {user.matchsPlayed}
            </dd>
          </div>

          <div className="rounded-control bg-white/70 px-2 py-2.5">
            <dt className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-faint">
              {t('home.statsRating')}
            </dt>
            <dd className="mt-0.5 text-lg font-extrabold text-brand-950">
              {hasRating ? user.rating.average?.toFixed(1) : '—'}
              {!hasRating ? (
                <span className="sr-only">{t('home.noRating')}</span>
              ) : null}
            </dd>
          </div>

          <div className="rounded-control bg-white/70 px-2 py-2.5">
            <dt className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-faint">
              {t('home.statsPositions')}
            </dt>
            <dd className="mt-0.5 text-lg font-extrabold text-brand-950">
              {user.positions.length}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              navigate('/perfil/editar');
            }}
          >
            {t('home.editProfile')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              navigate(`/jugadores/${user.id}`);
            }}
          >
            {t('home.viewPublicProfile')}
          </Button>
        </div>
      </Card>

      <Link to="/solicitudes" className="block">
        <Card
          padding="lg"
          className="transition hover:border-primary-300"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-primary-700">
              <ClipboardListIcon size={20} />
            </span>
            <div>
              <h2 className="text-heading text-ink">
                {t('home.requestsTitle')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t('home.requestsBody')}
              </p>
            </div>
          </div>
        </Card>
      </Link>

      {isAdmin ? (
        <Link to="/admin" className="block">
          <Card tone="mint" padding="lg">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-800">
                <ShieldIcon size={20} />
              </span>
              <div>
                <h2 className="text-heading text-brand-950">
                  {t('home.adminCardTitle')}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {t('home.adminCardBody')}
                </p>
              </div>
            </div>
          </Card>
        </Link>
      ) : null}
    </div>
  );
}
