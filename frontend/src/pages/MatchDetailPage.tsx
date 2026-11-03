import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AlertCircleIcon,
  BottomSheet,
  Button,
  CalendarIcon,
  Card,
  CheckCircleIcon,
  ChevronLeftIcon,
  Chip,
  MapPinIcon,
  Spinner,
  UsersIcon,
} from '../components/ui';
import { ApiError } from '../lib/api/client';
import { getErrorMessage } from '../lib/api/error-message';
import { matchesApi, requestsApi } from '../lib/api/endpoints';
import type { MatchVacancy } from '../lib/api/types';
import {
  formatMatchDate,
  formatMatchTime,
  getInitials,
} from '../lib/format';
import { isAppLocale, type AppLocale } from '../i18n';

export function MatchDetailPage() {
  const { t, i18n } = useTranslation();
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedVacancy, setSelectedVacancy] = useState<MatchVacancy | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);

  const id = Number(idParam);
  const validId = Number.isInteger(id) && id > 0;
  const locale: AppLocale = isAppLocale(i18n.language)
    ? i18n.language
    : 'es-CO';

  const matchQuery = useQuery({
    queryKey: ['match', id],
    queryFn: () => matchesApi.get(id),
    enabled: validId,
    retry: false,
  });

  const closeSheet = () => {
    if (submitting) return;
    setSelectedVacancy(null);
    setRequestError(null);
  };

  const sendRequest = async () => {
    if (!selectedVacancy) return;

    setSubmitting(true);
    setRequestError(null);

    try {
      await requestsApi.create({
        type: 'match',
        vacancyId: selectedVacancy.id,
      });
      setSelectedVacancy(null);
      setRequestSent(true);
    } catch (error) {
      setRequestError(getErrorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  };

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={<ChevronLeftIcon size={16} />}
      className="-ml-2"
      onClick={() => {
        navigate('/buscar');
      }}
    >
      {t('matchDetail.backToSearch')}
    </Button>
  );

  if (matchQuery.isLoading) {
    return (
      <div className="space-y-5">
        {backButton}
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      </div>
    );
  }

  const error = matchQuery.error;
  const notFound =
    !validId ||
    (error instanceof ApiError && error.code === 'MATCH_NOT_FOUND');

  if (notFound) {
    return (
      <div className="space-y-5">
        {backButton}
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-danger-600">
              <AlertCircleIcon size={20} />
            </span>
            <div>
              <h1 className="text-heading text-brand-950">
                {t('matchDetail.notFoundTitle')}
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t('matchDetail.notFoundBody')}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => {
              navigate('/buscar');
            }}
          >
            {t('matchDetail.backToSearch')}
          </Button>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-5">
        {backButton}
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-danger-600">
              <AlertCircleIcon size={20} />
            </span>
            <p className="text-sm font-semibold text-primary-900">
              {getErrorMessage(error, t)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={matchQuery.isFetching}
            onClick={() => {
              void matchQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      </div>
    );
  }

  const match = matchQuery.data?.match;
  if (!match) return null;

  const creatorName =
    match.creator.name ?? t('publicProfile.unnamed');
  const freeVacancies = match.vacancies.filter((vacancy) => !vacancy.occupied);
  const canRequest =
    !match.isOwner && match.state === 'available' && freeVacancies.length > 0;

  if (requestSent) {
    return (
      <div className="space-y-5">
        {backButton}
        <Card tone="mint" padding="lg">
          <div className="flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-primary-600 shadow-card">
              <CheckCircleIcon size={34} />
            </span>
            <h1 className="mt-4 text-heading text-brand-950">
              {t('matchDetail.requestSentTitle')}
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {t('matchDetail.requestSentBody', { name: creatorName })}
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.12em] text-primary-700">
              {match.locality} · {formatMatchDate(match.matchDate, locale)}
            </p>
          </div>

          <div className="mt-5 space-y-2">
            <Button
              fullWidth
              onClick={() => {
                navigate('/solicitudes');
              }}
            >
              {t('matchDetail.viewRequests')}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => {
                navigate('/buscar');
              }}
            >
              {t('matchDetail.keepSearching')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {backButton}

      <PageHeader
        eyebrow={t('matchDetail.eyebrow')}
        title={match.locality}
        subtitle={`${formatMatchDate(match.matchDate, locale, true)} · ${formatMatchTime(
          match.matchDate,
          locale,
        )}`}
      />

      <div className="grid grid-cols-2 gap-3">
        <Card tone="mint" padding="md">
          <div className="flex items-center gap-2 text-primary-700">
            <UsersIcon size={17} />
            <span className="text-caption font-semibold uppercase tracking-[0.1em]">
              {t('matchDetail.freeSpots')}
            </span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-brand-950">
            {match.freeSpots}
            <span className="text-sm font-semibold text-ink-soft">
              {' '}
              / {match.totalSpots}
            </span>
          </p>
        </Card>

        <Card tone="mint" padding="md">
          <div className="flex items-center gap-2 text-primary-700">
            <CalendarIcon size={17} />
            <span className="text-caption font-semibold uppercase tracking-[0.1em]">
              {t('matchDetail.time')}
            </span>
          </div>
          <p className="mt-1 text-lg font-extrabold text-brand-950">
            {formatMatchTime(match.matchDate, locale)}
          </p>
        </Card>
      </div>

      {match.isOwner ? (
        <Card padding="md">
          <p className="text-sm font-semibold text-ink">
            {t('matchDetail.ownerTitle')}
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {t('matchDetail.ownerBody')}
          </p>
        </Card>
      ) : null}

      {match.description ? (
        <Card padding="lg">
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-faint">
            {t('matchDetail.description')}
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
            {match.description}
          </p>
        </Card>
      ) : null}

      <Card padding="lg">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-xs font-extrabold text-primary-800">
            {match.creator.profilePic ? (
              <img
                src={match.creator.profilePic}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(match.creator.name, '') || 'FL'
            )}
          </div>
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {t('matchDetail.organizer')}
            </p>
            <Link
              to={
                match.isOwner
                  ? '/perfil'
                  : `/jugadores/${match.creator.id}`
              }
              className="block truncate text-sm font-bold text-ink hover:text-primary-700"
            >
              {creatorName}
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Chip tone="primary">
            <MapPinIcon size={13} />
            {match.locality}
          </Chip>
          {match.modality ? (
            <Chip className="capitalize">{match.modality}</Chip>
          ) : null}
          <Chip>{t(`matchDetail.state.${match.state}`)}</Chip>
        </div>

        {match.positions.length > 0 ? (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {match.positions.map((position) => (
              <div
                key={position.positionId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium capitalize text-ink">
                  {position.position}
                </span>
                <span className="text-ink-soft">
                  {t('matchDetail.positionSlots', {
                    free: position.freeSlots,
                    total: position.slots,
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      <section aria-labelledby="vacancies-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="vacancies-title" className="text-heading text-ink">
            {t('matchDetail.vacancies')}
          </h2>
          <Chip tone="primary">
            {t('search.freeSpots', { count: match.freeSpots })}
          </Chip>
        </div>

        {match.vacancies.length === 0 ? (
          <Card padding="lg">
            <p className="text-sm text-ink-soft">
              {t('matchDetail.noVacancies')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2">
            {match.vacancies.map((vacancy) => (
              <li key={vacancy.id}>
                <Card padding="sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold capitalize text-ink">
                        {vacancy.position}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {vacancy.occupied
                          ? t('matchDetail.vacancyOccupied')
                          : t('matchDetail.vacancyFree')}
                      </p>
                    </div>

                    {vacancy.occupied ? (
                      <Chip>{t('matchDetail.vacancyOccupied')}</Chip>
                    ) : canRequest ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setRequestError(null);
                          setSelectedVacancy(vacancy);
                        }}
                      >
                        {t('matchDetail.requestAction')}
                      </Button>
                    ) : (
                      <Chip tone="neutral">
                        {t('matchDetail.unavailable')}
                      </Chip>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {!match.isOwner && !canRequest && match.vacancies.length > 0 ? (
          <p className="text-xs leading-relaxed text-ink-faint">
            {match.state === 'available'
              ? t('matchDetail.noFreeVacancies')
              : t('matchDetail.notAvailable')}
          </p>
        ) : null}
      </section>

      <BottomSheet
        open={selectedVacancy !== null}
        onClose={closeSheet}
        title={t('matchDetail.confirmTitle')}
        description={t('matchDetail.confirmBody')}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={submitting}
              onClick={closeSheet}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              loading={submitting}
              onClick={() => {
                void sendRequest();
              }}
            >
              {t('matchDetail.confirmAction')}
            </Button>
          </div>
        }
      >
        {selectedVacancy ? (
          <div className="space-y-2 rounded-card bg-surface-sunken p-4 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">{t('matchDetail.position')}</span>
              <span className="font-semibold capitalize text-ink">
                {selectedVacancy.position}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">{t('matchDetail.when')}</span>
              <span className="text-right font-semibold text-ink">
                {formatMatchDate(match.matchDate, locale)} ·{' '}
                {formatMatchTime(match.matchDate, locale)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                {t('matchDetail.locality')}
              </span>
              <span className="font-semibold text-ink">{match.locality}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-soft">
                {t('matchDetail.organizer')}
              </span>
              <span className="text-right font-semibold text-ink">
                {creatorName}
              </span>
            </div>
          </div>
        ) : null}

        {requestError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-600">
            {requestError}
          </p>
        ) : null}
      </BottomSheet>
    </div>
  );
}
