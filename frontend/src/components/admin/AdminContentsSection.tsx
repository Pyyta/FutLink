import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getErrorMessage } from '../../lib/api/error-message';
import { adminApi } from '../../lib/api/endpoints';
import type {
  AdminCommentContent,
  AdminContent,
  AdminContentTypeFilter,
  AdminMatchContent,
  AdminModerationFilter,
  ModerationState,
  UpdateAdminCommentInput,
  UpdateAdminMatchInput,
} from '../../lib/api/types';
import {
  formatDateTime,
  formatMatchDate,
  formatMatchTime,
  formatShortDate,
} from '../../lib/format';
import { isAppLocale, type AppLocale } from '../../i18n';
import {
  AlertCircleIcon,
  BottomSheet,
  Button,
  Card,
  FormError,
  Input,
  Select,
  Spinner,
  useToast,
} from '../ui';
import { AdminPagination } from './AdminPagination';

const PAGE_SIZE = 10;

interface Filters {
  type: AdminContentTypeFilter;
  state: AdminModerationFilter;
  search: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  type: 'all',
  state: 'all',
  search: '',
  from: '',
  to: '',
};

const MODERATION_CLASSES: Record<ModerationState, string> = {
  visible: 'bg-success-50 text-success-700',
  hidden: 'bg-warning-50 text-warning-700',
  deleted: 'bg-danger-50 text-danger-700',
};

type ModerationAction = 'hide' | 'show' | 'delete';

interface ConfirmTarget {
  content: AdminContent;
  action: ModerationAction;
}

type ContentUpdate =
  | { content: AdminMatchContent; input: UpdateAdminMatchInput }
  | { content: AdminCommentContent; input: UpdateAdminCommentInput };

function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return isAppLocale(i18n.language) ? i18n.language : 'es-CO';
}

function bogotaDayStart(value: string): string {
  return new Date(`${value}T00:00:00-05:00`).toISOString();
}

function bogotaNextDayStart(value: string): string {
  return new Date(
    Date.parse(`${value}T00:00:00-05:00`) + 86_400_000,
  ).toISOString();
}

function toBogotaInputValue(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }

  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = values.hour;
  const minute = values.minute;
  if (!year || !month || !day || !hour || !minute) return '';

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function bogotaInputToIso(value: string): string | null {
  const date = new Date(`${value}:00-05:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

interface ContentEditFormProps {
  content: AdminContent;
  ratingMax: number;
  submitting: boolean;
  error: string | null;
  onSubmitMatch(input: UpdateAdminMatchInput): void;
  onSubmitComment(input: UpdateAdminCommentInput): void;
  onCancel(): void;
}

function ContentEditForm({
  content,
  ratingMax,
  submitting,
  error,
  onSubmitMatch,
  onSubmitComment,
  onCancel,
}: ContentEditFormProps) {
  const { t } = useTranslation();
  const [matchDate, setMatchDate] = useState(() =>
    content.type === 'match' ? toBogotaInputValue(content.matchDate) : '',
  );
  const [locality, setLocality] = useState(() =>
    content.type === 'match' ? content.locality : '',
  );
  const [modality, setModality] = useState(() =>
    content.type === 'match' ? content.modality ?? '' : '',
  );
  const [description, setDescription] = useState(() =>
    content.type === 'match' ? content.description ?? '' : '',
  );
  const [score, setScore] = useState(() =>
    content.type === 'comment' ? String(content.score) : '1',
  );
  const [comment, setComment] = useState(() =>
    content.type === 'comment' ? content.comment ?? '' : '',
  );
  const [moderationState, setModerationState] = useState<ModerationState>(
    content.moderationState,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next: Record<string, string> = {};

    if (content.type === 'match') {
      const matchIso = matchDate ? bogotaInputToIso(matchDate) : null;
      if (!matchIso) next.matchDate = t('admin.contents.validation.matchDate');
      if (locality.trim().length < 2) {
        next.locality = t('admin.contents.validation.locality');
      }
      if (modality.trim().length > 20) {
        next.modality = t('admin.contents.validation.modality');
      }
      if (description.trim().length > 500) {
        next.description = t('admin.contents.validation.description');
      }

      if (Object.keys(next).length > 0 || !matchIso) {
        setErrors(next);
        return;
      }

      onSubmitMatch({
        matchDate: matchIso,
        locality: locality.trim(),
        modality: modality.trim() ? modality.trim() : null,
        description: description.trim() ? description.trim() : null,
        moderationState,
      });
      return;
    }

    const parsedScore = Number(score);
    if (
      !Number.isInteger(parsedScore) ||
      parsedScore < 1 ||
      parsedScore > ratingMax
    ) {
      next.score = t('admin.contents.validation.score', { max: ratingMax });
    }
    if (comment.trim().length > 240) {
      next.comment = t('admin.contents.validation.comment');
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }

    onSubmitComment({
      score: parsedScore,
      comment: comment.trim() ? comment.trim() : null,
      moderationState,
    });
  };

  const moderationSelect = (
    <Select
      id="admin-content-moderation"
      label={t('admin.contents.fields.moderationState')}
      value={moderationState}
      onChange={(event) => {
        setModerationState(event.target.value as ModerationState);
      }}
    >
      <option value="visible">{t('admin.contents.states.visible')}</option>
      <option value="hidden">{t('admin.contents.states.hidden')}</option>
      <option value="deleted">{t('admin.contents.states.deleted')}</option>
    </Select>
  );

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      {content.type === 'match' ? (
        <>
          <Input
            id="admin-content-match-date"
            type="datetime-local"
            label={t('admin.contents.fields.matchDate')}
            value={matchDate}
            error={errors.matchDate}
            required
            onChange={(event) => setMatchDate(event.target.value)}
          />

          <Input
            id="admin-content-locality"
            label={t('admin.contents.fields.locality')}
            value={locality}
            error={errors.locality}
            required
            onChange={(event) => setLocality(event.target.value)}
          />

          <Input
            id="admin-content-modality"
            label={t('admin.contents.fields.modality')}
            hint={t('admin.contents.fields.modalityHint')}
            value={modality}
            error={errors.modality}
            onChange={(event) => setModality(event.target.value)}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="admin-content-description"
              className="block text-sm font-semibold text-ink"
            >
              {t('admin.contents.fields.description')}
            </label>
            <textarea
              id="admin-content-description"
              rows={3}
              maxLength={500}
              value={description}
              aria-invalid={errors.description ? true : undefined}
              aria-describedby={
                errors.description
                  ? 'admin-content-description-error'
                  : undefined
              }
              onChange={(event) => setDescription(event.target.value)}
              className="w-full rounded-control border border-line-strong bg-white p-3 text-sm text-ink transition focus:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/30"
            />
            {errors.description ? (
              <p
                id="admin-content-description-error"
                role="alert"
                className="text-xs font-medium text-danger-600"
              >
                {errors.description}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <Input
            id="admin-content-score"
            type="number"
            inputMode="numeric"
            min={1}
            max={ratingMax}
            label={t('admin.contents.fields.score')}
            hint={t('admin.contents.fields.scoreHint', { max: ratingMax })}
            value={score}
            error={errors.score}
            required
            onChange={(event) => setScore(event.target.value)}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="admin-content-comment"
              className="block text-sm font-semibold text-ink"
            >
              {t('admin.contents.fields.comment')}
            </label>
            <textarea
              id="admin-content-comment"
              rows={3}
              maxLength={240}
              value={comment}
              aria-invalid={errors.comment ? true : undefined}
              aria-describedby={
                errors.comment ? 'admin-content-comment-error' : undefined
              }
              onChange={(event) => setComment(event.target.value)}
              className="w-full rounded-control border border-line-strong bg-white p-3 text-sm text-ink transition focus:border-primary-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400/30"
            />
            <p className="text-xs text-ink-soft">
              {t('admin.contents.fields.commentHint', {
                count: comment.length,
              })}
            </p>
            {errors.comment ? (
              <p
                id="admin-content-comment-error"
                role="alert"
                className="text-xs font-medium text-danger-600"
              >
                {errors.comment}
              </p>
            ) : null}
          </div>
        </>
      )}

      {moderationSelect}
      <FormError>{error}</FormError>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled={submitting}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" fullWidth loading={submitting}>
          {t('admin.contents.saveAction')}
        </Button>
      </div>
    </form>
  );
}

export function AdminContentsSection({ ratingMax }: { ratingMax: number }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [editor, setEditor] = useState<AdminContent | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const contentsQuery = useQuery({
    queryKey: ['admin-contents', filters, page],
    queryFn: () =>
      adminApi.listContents({
        type: filters.type === 'all' ? undefined : filters.type,
        state: filters.state === 'all' ? undefined : filters.state,
        search: filters.search || undefined,
        from: filters.from ? bogotaDayStart(filters.from) : undefined,
        to: filters.to ? bogotaNextDayStart(filters.to) : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const invalidateContents = (content?: AdminContent) => {
    void queryClient.invalidateQueries({ queryKey: ['admin-contents'] });
    if (content?.type === 'match') {
      void queryClient.invalidateQueries({ queryKey: ['match-search'] });
      void queryClient.invalidateQueries({
        queryKey: ['match', content.id],
      });
    }
  };

  const saveMutation = useMutation<unknown, unknown, ContentUpdate>({
    mutationFn: (update: ContentUpdate) =>
      update.content.type === 'match'
        ? adminApi.updateMatchContent(update.content.id, update.input)
        : adminApi.updateCommentContent(update.content.id, update.input),
    onSuccess: (_result, update) => {
      show('success', t('admin.contents.updated'));
      invalidateContents(update.content);
      setEditor(null);
      setFormError(null);
    },
    onError: (error) => {
      setFormError(getErrorMessage(error, t));
    },
  });

  const moderationMutation = useMutation<unknown, unknown, ConfirmTarget>({
    mutationFn: (target: ConfirmTarget) => {
      const moderationState: ModerationState =
        target.action === 'hide'
          ? 'hidden'
          : target.action === 'show'
            ? 'visible'
            : 'deleted';

      return target.content.type === 'match'
        ? adminApi.updateMatchContent(target.content.id, { moderationState })
        : adminApi.updateCommentContent(target.content.id, { moderationState });
    },
    onSuccess: (_result, target) => {
      show('success', t(`admin.contents.success.${target.action}`));
      invalidateContents(target.content);
      setConfirmTarget(null);
      setConfirmError(null);
    },
    onError: (error) => {
      setConfirmError(getErrorMessage(error, t));
    },
  });

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError(t('admin.contents.dateRangeError'));
      return;
    }

    setFilterError(null);
    setFilters({ ...draft, search: draft.search.trim() });
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFilterError(null);
    setPage(1);
  };

  const openEditor = (content: AdminContent) => {
    setFormError(null);
    setEditor(content);
  };

  const closeEditor = () => {
    if (saveMutation.isPending) return;
    setEditor(null);
    setFormError(null);
  };

  const openConfirm = (content: AdminContent, action: ModerationAction) => {
    setConfirmError(null);
    setConfirmTarget({ content, action });
  };

  const closeConfirm = () => {
    if (moderationMutation.isPending) return;
    setConfirmTarget(null);
    setConfirmError(null);
  };

  const hasFilters =
    filters.type !== 'all' ||
    filters.state !== 'all' ||
    filters.search !== '' ||
    filters.from !== '' ||
    filters.to !== '';

  const confirmTitle = confirmTarget
    ? t(`admin.contents.confirm.${confirmTarget.action}Title`)
    : '';
  const confirmBody = confirmTarget
    ? t(`admin.contents.confirm.${confirmTarget.action}Body`)
    : '';
  const confirmIsDelete = confirmTarget?.action === 'delete';

  return (
    <div className="space-y-4">
      <Card padding="md">
        <form className="space-y-3" onSubmit={applyFilters}>
          <Input
            id="admin-contents-search"
            label={t('admin.contents.searchLabel')}
            placeholder={t('admin.contents.searchPlaceholder')}
            value={draft.search}
            onChange={(event) => {
              setDraft((current) => ({ ...current, search: event.target.value }));
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <Select
              id="admin-contents-type"
              label={t('admin.contents.typeFilter')}
              value={draft.type}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  type: event.target.value as AdminContentTypeFilter,
                }));
              }}
            >
              <option value="all">{t('admin.contents.allTypes')}</option>
              <option value="match">{t('admin.contents.types.match')}</option>
              <option value="comment">
                {t('admin.contents.types.comment')}
              </option>
            </Select>

            <Select
              id="admin-contents-state"
              label={t('admin.contents.stateFilter')}
              value={draft.state}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  state: event.target.value as AdminModerationFilter,
                }));
              }}
            >
              <option value="all">{t('admin.contents.allStates')}</option>
              <option value="visible">
                {t('admin.contents.states.visible')}
              </option>
              <option value="hidden">
                {t('admin.contents.states.hidden')}
              </option>
              <option value="deleted">
                {t('admin.contents.states.deleted')}
              </option>
            </Select>

            <Input
              id="admin-contents-from"
              type="date"
              label={t('admin.contents.from')}
              value={draft.from}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  from: event.target.value,
                }));
              }}
            />

            <Input
              id="admin-contents-to"
              type="date"
              label={t('admin.contents.to')}
              value={draft.to}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  to: event.target.value,
                }));
              }}
            />
          </div>

          {filterError ? (
            <p role="alert" className="text-sm font-medium text-danger-600">
              {filterError}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" fullWidth loading={contentsQuery.isFetching}>
              {t('admin.contents.filterAction')}
            </Button>
            <Button
              type="button"
              variant="outline"
              fullWidth
              onClick={clearFilters}
            >
              {t('admin.contents.clearFilters')}
            </Button>
          </div>
        </form>
      </Card>

      <p className="text-xs font-semibold text-ink-soft">
        {contentsQuery.data
          ? t('admin.contents.total', { count: contentsQuery.data.total })
          : null}
      </p>

      {contentsQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : contentsQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <p className="text-sm font-semibold text-primary-900">
              {getErrorMessage(contentsQuery.error, t)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={contentsQuery.isFetching}
            onClick={() => {
              void contentsQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : contentsQuery.data && contentsQuery.data.items.length > 0 ? (
        <>
          <ul className="space-y-3">
            {contentsQuery.data.items.map((content) => {
              const author =
                content.author?.name ?? t('admin.contents.unknownAuthor');

              return (
                <li key={`${content.type}-${content.id}`}>
                  <Card padding="md" className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex rounded-pill bg-mint px-2.5 py-1 text-[11px] font-bold text-primary-800">
                            {content.type === 'match'
                              ? t('admin.contents.types.match')
                              : t('admin.contents.types.comment')}
                          </span>
                          <span
                            className={`inline-flex rounded-pill px-2.5 py-1 text-[11px] font-bold ${MODERATION_CLASSES[content.moderationState]}`}
                          >
                            {t(
                              `admin.contents.states.${content.moderationState}`,
                            )}
                          </span>
                          {content.type === 'match' ? (
                            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
                              {t(`matchDetail.state.${content.matchState}`)}
                            </span>
                          ) : null}
                        </div>

                        <h2 className="mt-1.5 truncate text-heading text-ink">
                          {content.type === 'match'
                            ? content.locality
                            : content.player.name ??
                              t('admin.contents.unknownPlayer')}
                        </h2>
                        <p className="truncate text-sm text-ink-soft">
                          {content.type === 'match'
                            ? t('admin.contents.matchOf', {
                                name: author,
                              })
                            : t('admin.contents.commentOf', {
                                name: author,
                              })}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs text-ink-faint">
                        {formatShortDate(content.createdAt, locale)}
                      </span>
                    </div>

                    {content.type === 'match' ? (
                      <div className="space-y-1 rounded-control bg-surface-sunken p-3">
                        <p className="text-sm font-semibold text-ink">
                          {formatMatchDate(content.matchDate, locale, true)} ·{' '}
                          {formatMatchTime(content.matchDate, locale)}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {content.modality ?? t('admin.contents.noModality')}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {content.description ??
                            t('admin.contents.noDescription')}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1 rounded-control bg-surface-sunken p-3">
                        <p className="text-sm font-semibold text-ink">
                          {t('admin.contents.scoreValue', {
                            score: content.score,
                          })}
                        </p>
                        <p className="text-xs text-ink-soft">
                          {content.comment ?? t('admin.contents.noComment')}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-ink-faint">
                      {t('admin.contents.createdAt', {
                        date: formatDateTime(content.createdAt, locale),
                      })}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          openEditor(content);
                        }}
                      >
                        {t('admin.contents.editAction')}
                      </Button>

                      {content.moderationState === 'visible' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            openConfirm(content, 'hide');
                          }}
                        >
                          {t('admin.contents.hideAction')}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            openConfirm(content, 'show');
                          }}
                        >
                          {t('admin.contents.showAction')}
                        </Button>
                      )}

                      {content.moderationState !== 'deleted' ? (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => {
                            openConfirm(content, 'delete');
                          }}
                        >
                          {t('admin.contents.deleteAction')}
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>

          <AdminPagination
            page={contentsQuery.data.page}
            totalPages={contentsQuery.data.totalPages}
            onChange={setPage}
          />
        </>
      ) : (
        <Card padding="lg">
          <p className="text-sm text-ink-soft">
            {hasFilters
              ? t('admin.contents.emptyFiltered')
              : t('admin.contents.empty')}
          </p>
        </Card>
      )}

      <BottomSheet
        open={editor !== null}
        onClose={closeEditor}
        title={t(
          editor?.type === 'match'
            ? 'admin.contents.editMatchTitle'
            : 'admin.contents.editCommentTitle',
        )}
        description={t('admin.contents.editHint')}
      >
        {editor ? (
          <ContentEditForm
            key={`${editor.type}-${editor.id}`}
            content={editor}
            ratingMax={ratingMax}
            submitting={saveMutation.isPending}
            error={formError}
            onSubmitMatch={(input) => {
              if (editor.type !== 'match') return;
              saveMutation.mutate({ content: editor, input });
            }}
            onSubmitComment={(input) => {
              if (editor.type !== 'comment') return;
              saveMutation.mutate({ content: editor, input });
            }}
            onCancel={closeEditor}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={confirmTarget !== null}
        onClose={closeConfirm}
        title={confirmTitle}
        description={confirmBody}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={moderationMutation.isPending}
              onClick={closeConfirm}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              variant={confirmIsDelete ? 'danger' : 'primary'}
              loading={moderationMutation.isPending}
              onClick={() => {
                if (confirmTarget) moderationMutation.mutate(confirmTarget);
              }}
            >
              {t('admin.contents.confirm.action')}
            </Button>
          </div>
        }
      >
        {confirmError ? (
          <p role="alert" className="text-sm font-medium text-danger-600">
            {confirmError}
          </p>
        ) : confirmIsDelete && confirmTarget?.content.type === 'match' ? (
          <p className="text-sm font-medium text-danger-700">
            {t('admin.contents.confirm.deleteMatchHint')}
          </p>
        ) : null}
      </BottomSheet>
    </div>
  );
}
