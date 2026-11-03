import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  BottomSheet,
  Button,
  Card,
  CheckCircleIcon,
  Chip,
  Spinner,
  StarRating,
  useToast,
} from '../components/ui';
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  PhoneIcon,
} from '../components/ui/icons';
import { ApiError } from '../lib/api/client';
import { getErrorMessage } from '../lib/api/error-message';
import { requestsApi, usersApi } from '../lib/api/endpoints';
import { useSession } from '../lib/auth/session-context';
import { formatShortDate, getInitials } from '../lib/format';
import { isAppLocale, type AppLocale } from '../i18n';

export function PublicProfilePage() {
  const { t, i18n } = useTranslation();
  const { user } = useSession();
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestSentFor, setRequestSentFor] = useState<number | null>(null);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const id = Number(idParam);
  const validId = Number.isInteger(id) && id > 0;
  const locale: AppLocale = isAppLocale(i18n.language)
    ? i18n.language
    : 'es-CO';

  useEffect(() => {
    setRequestOpen(false);
    setRequestError(null);
    setRatingOpen(false);
    setRatingError(null);
  }, [id]);

  const profileQuery = useQuery({
    queryKey: ['public-profile', id],
    queryFn: () => usersApi.get(id),
    enabled: validId,
    retry: false,
  });

  const goHome = () => {
    navigate('/');
  };

  const backButton = (
    <Button
      variant="ghost"
      size="sm"
      leadingIcon={<ChevronLeftIcon size={16} />}
      className="-ml-2"
      onClick={goHome}
    >
      {t('publicProfile.backHome')}
    </Button>
  );

  if (profileQuery.isLoading) {
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

  const error = profileQuery.error;
  const notFound =
    !validId ||
    (error instanceof ApiError && error.code === 'USER_NOT_FOUND');

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
                {t('publicProfile.notFoundTitle')}
              </h1>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t('publicProfile.notFoundBody')}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={goHome}
          >
            {t('publicProfile.backHome')}
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
              {t('publicProfile.loadError')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={profileQuery.isFetching}
            onClick={() => {
              void profileQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      </div>
    );
  }

  const profile = profileQuery.data?.profile;
  if (!profile) return null;

  const isSelf = user?.id === profile.id;
  const displayName = profile.name ?? t('publicProfile.unnamed');
  const hasRating = profile.rating.count > 0 && profile.rating.average !== null;
  const average = profile.rating.average ?? 0;
  const phoneVisible = profile.phoneVisible && profile.phone !== null;
  const requestSent = requestSentFor === profile.id;
  const myRating = profile.myRating;

  const sendRequest = async () => {
    setRequestSubmitting(true);
    setRequestError(null);

    try {
      await requestsApi.create({
        type: 'player',
        targetUserId: profile.id,
      });
      setRequestOpen(false);
      setRequestSentFor(profile.id);
    } catch (error) {
      setRequestError(getErrorMessage(error, t));
    } finally {
      setRequestSubmitting(false);
    }
  };

  const openRating = () => {
    setRatingScore(profile.myRating?.score ?? 0);
    setRatingComment(profile.myRating?.comment ?? '');
    setRatingError(null);
    setRatingOpen(true);
  };

  const submitRating = async () => {
    if (ratingScore < 1) {
      setRatingError(t('rating.scoreRequired'));
      return;
    }

    setRatingSubmitting(true);
    setRatingError(null);

    try {
      const comment = ratingComment.trim();
      await usersApi.rate(profile.id, {
        score: ratingScore,
        comment: comment.length > 0 ? comment : undefined,
      });
      setRatingOpen(false);
      toast.success(t('rating.saved'));
      await queryClient.invalidateQueries({
        queryKey: ['public-profile', profile.id],
      });
    } catch (error) {
      setRatingError(getErrorMessage(error, t));
    } finally {
      setRatingSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {backButton}

      <PageHeader
        title={displayName}
        subtitle={profile.locality ?? t('profile.noLocality')}
      />

      {isSelf ? (
        <Button
          variant="outline"
          fullWidth
          onClick={() => {
            navigate('/perfil/editar');
          }}
        >
          {t('profile.editAction')}
        </Button>
      ) : requestSent ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-primary-600 shadow-card">
              <CheckCircleIcon size={24} />
            </span>
            <div className="min-w-0">
              <h2 className="text-heading text-brand-950">
                {t('publicProfile.requestSentTitle')}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {t('publicProfile.requestSentBody', { name: displayName })}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={() => {
                  navigate('/solicitudes');
                }}
              >
                {t('publicProfile.viewRequests')}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Button
          fullWidth
          onClick={() => {
            setRequestError(null);
            setRequestOpen(true);
          }}
        >
          {t('publicProfile.requestAction')}
        </Button>
      )}

      <Card tone="mint" padding="lg">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white bg-white text-lg font-extrabold text-primary-800 shadow-card">
            {profile.profilePic ? (
              <img
                src={profile.profilePic}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(profile.name, '') || 'FL'
            )}
          </div>

          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-faint">
              {t('publicProfile.rating')}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {hasRating ? (
                <>
                  <StarRating
                    value={average}
                    size="sm"
                    label={t('components.starRating.label', {
                      value: average.toFixed(1),
                      max: 5,
                    })}
                  />
                  <span className="text-lg font-extrabold text-brand-950">
                    {average.toFixed(1)}
                  </span>
                  <span className="text-sm text-ink-soft">
                    ({profile.rating.count})
                  </span>
                </>
              ) : (
                <span className="text-sm font-medium text-ink-soft">
                  {t('profile.noRating')}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isSelf ? (
          <div className="mt-4 border-t border-primary-100 pt-3">
            {myRating ? (
              <>
                <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-faint">
                  {t('rating.yourRating')}
                </p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StarRating
                      value={myRating.score}
                      size="sm"
                      label={t('components.starRating.label', {
                        value: String(myRating.score),
                        max: 5,
                      })}
                    />
                    <span className="text-sm font-semibold text-brand-950">
                      {myRating.score}/5
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={openRating}>
                    {t('rating.editAction')}
                  </Button>
                </div>
                {myRating.comment ? (
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ink-soft">
                    {myRating.comment}
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={openRating}>
                  {t('rating.rateAction')}
                </Button>
                <p className="mt-2 text-xs leading-relaxed text-ink-faint">
                  {t('rating.hint')}
                </p>
              </>
            )}
          </div>
        ) : null}
      </Card>

      <Card padding="lg">
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {t('publicProfile.positions')}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {profile.positions.length > 0 ? (
            profile.positions.map((position) => (
              <Chip key={position.id} tone="primary" className="capitalize">
                {position.title}
              </Chip>
            ))
          ) : (
            <span className="text-sm text-ink-soft">
              {t('profile.noPositions')}
            </span>
          )}
        </div>
      </Card>

      <Card padding="lg">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mint text-primary-700">
            <PhoneIcon size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">
              {t('publicProfile.phone')}
            </p>
            <p
              className={`mt-0.5 text-sm ${
                phoneVisible ? 'font-medium text-ink' : 'text-ink-soft'
              }`}
            >
              {phoneVisible ? profile.phone : t('publicProfile.phonePrivate')}
            </p>
            {!phoneVisible ? (
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                {t('publicProfile.phonePrivateHint')}
              </p>
            ) : !isSelf ? (
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                {t('publicProfile.phoneVisibleHint')}
              </p>
            ) : null}
          </div>
        </div>
      </Card>

      <section aria-labelledby="comments-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="comments-title" className="text-heading text-ink">
            {t('publicProfile.comments')}
          </h2>
          <Chip>{profile.comments.length}</Chip>
        </div>

        {profile.comments.length === 0 ? (
          <Card padding="lg">
            <p className="text-sm text-ink-soft">
              {t('publicProfile.noComments')}
            </p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {profile.comments.map((comment) => {
              const authorName =
                comment.author?.name ?? t('publicProfile.anonymousAuthor');
              const authorInitials =
                getInitials(comment.author?.name ?? null, '') || 'FL';

              return (
                <li key={comment.id}>
                  <Card padding="md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-xs font-bold text-primary-800">
                          {comment.author?.profilePic ? (
                            <img
                              src={comment.author.profilePic}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            authorInitials
                          )}
                        </div>
                        <div className="min-w-0">
                          {comment.author ? (
                            <Link
                              to={
                                comment.author.id === user?.id
                                  ? '/perfil'
                                  : `/jugadores/${comment.author.id}`
                              }
                              className="block truncate text-sm font-semibold text-ink hover:text-primary-700"
                            >
                              {authorName}
                            </Link>
                          ) : (
                            <span className="block truncate text-sm font-semibold text-ink">
                              {authorName}
                            </span>
                          )}
                          <p className="text-caption text-ink-faint">
                            {formatShortDate(comment.updatedAt, locale)}
                          </p>
                        </div>
                      </div>

                      <StarRating
                        value={comment.score}
                        size="sm"
                        label={t('components.starRating.label', {
                          value: String(comment.score),
                          max: 5,
                        })}
                      />
                    </div>

                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                      {comment.comment}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BottomSheet
        open={requestOpen}
        onClose={() => {
          if (requestSubmitting) return;
          setRequestOpen(false);
          setRequestError(null);
        }}
        title={t('publicProfile.confirmTitle')}
        description={t('publicProfile.confirmBody', { name: displayName })}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={requestSubmitting}
              onClick={() => {
                setRequestOpen(false);
                setRequestError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              loading={requestSubmitting}
              onClick={() => {
                void sendRequest();
              }}
            >
              {t('publicProfile.confirmAction')}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 rounded-card bg-surface-sunken p-4 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-ink-soft">
              {t('publicProfile.player')}
            </span>
            <span className="text-right font-semibold text-ink">
              {displayName}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink-soft">
              {t('publicProfile.locality')}
            </span>
            <span className="text-right font-semibold text-ink">
              {profile.locality ?? t('profile.noLocality')}
            </span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-ink-soft">
              {t('publicProfile.positions')}
            </span>
            <span className="text-right font-semibold capitalize text-ink">
              {profile.positions.length > 0
                ? profile.positions
                    .map((position) => position.title)
                    .join(', ')
                : t('profile.noPositions')}
            </span>
          </div>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          {t('publicProfile.requestHint')}
        </p>

        {requestError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger-600">
            {requestError}
          </p>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={ratingOpen}
        onClose={() => {
          if (ratingSubmitting) return;
          setRatingOpen(false);
          setRatingError(null);
        }}
        title={t('rating.dialogTitle', { name: displayName })}
        description={t('rating.dialogBody')}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={ratingSubmitting}
              onClick={() => {
                setRatingOpen(false);
                setRatingError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              loading={ratingSubmitting}
              onClick={() => {
                void submitRating();
              }}
            >
              {t('rating.submit')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {t('rating.scoreLabel')}
            </p>
            <div className="mt-2 flex items-center gap-3">
              <StarRating
                value={ratingScore}
                max={5}
                size="lg"
                label={t('rating.scoreLabel')}
                onChange={setRatingScore}
              />
              <span
                aria-live="polite"
                className="text-sm font-semibold text-ink-soft"
              >
                {ratingScore > 0 ? `${ratingScore}/5` : '—'}
              </span>
            </div>
          </div>

          <div>
            <label
              htmlFor="rating-comment"
              className="block text-sm font-semibold text-ink"
            >
              {t('rating.commentLabel')}
            </label>
            <textarea
              id="rating-comment"
              rows={3}
              maxLength={240}
              value={ratingComment}
              placeholder={t('rating.commentPlaceholder')}
              onChange={(event) => {
                setRatingComment(event.target.value);
              }}
              className="mt-1.5 w-full resize-none rounded-control border border-line-strong bg-white px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint transition focus:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/30"
            />
            <div className="mt-1 flex justify-between gap-3 text-xs text-ink-faint">
              <span>{t('rating.commentHint')}</span>
              <span>{t('rating.commentCount', { count: ratingComment.length })}</span>
            </div>
          </div>

          {ratingError ? (
            <p role="alert" className="text-sm font-medium text-danger-600">
              {ratingError}
            </p>
          ) : null}
        </div>
      </BottomSheet>
    </div>
  );
}
