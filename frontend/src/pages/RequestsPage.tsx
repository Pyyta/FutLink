import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AlertCircleIcon,
  BottomSheet,
  Button,
  Card,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  Select,
  Spinner,
  useToast,
} from '../components/ui';
import { getErrorMessage } from '../lib/api/error-message';
import { requestsApi } from '../lib/api/endpoints';
import type {
  RequestAction,
  RequestBox,
  RequestDto,
  RequestResponse,
  RequestState,
  RequestType,
} from '../lib/api/types';
import {
  formatMatchDate,
  formatMatchTime,
  formatShortDate,
} from '../lib/format';
import { isAppLocale, type AppLocale } from '../i18n';

const PAGE_SIZE = 10;

type TypeFilter = '' | RequestType;
type StateFilter = '' | RequestState;

interface ActionTarget {
  request: RequestDto;
  action: RequestAction;
}

const STATE_CLASSES: Record<RequestState, string> = {
  pending: 'bg-warning-50 text-warning-700',
  accepted: 'bg-success-50 text-success-700',
  rejected: 'bg-danger-50 text-danger-700',
  cancelled: 'bg-surface-sunken text-ink-faint',
};

function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return isAppLocale(i18n.language) ? i18n.language : 'es-CO';
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3">
      <Button
        variant="outline"
        size="sm"
        leadingIcon={<ChevronLeftIcon size={16} />}
        disabled={page <= 1}
        onClick={() => {
          onChange(page - 1);
        }}
      >
        {t('requests.previous')}
      </Button>

      <p className="text-xs font-semibold text-ink-soft">
        {t('requests.pageOf', { page, totalPages })}
      </p>

      <Button
        variant="outline"
        size="sm"
        trailingIcon={<ChevronRightIcon size={16} />}
        disabled={page >= totalPages}
        onClick={() => {
          onChange(page + 1);
        }}
      >
        {t('requests.next')}
      </Button>
    </div>
  );
}

function RequestCard({
  request,
  onAction,
}: {
  request: RequestDto;
  onAction: (target: ActionTarget) => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();

  const counterpart =
    request.direction === 'received' ? request.sender : request.receiver;
  const counterpartName = counterpart.name ?? t('publicProfile.unnamed');

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex rounded-pill px-2.5 py-1 text-[11px] font-bold ${STATE_CLASSES[request.state]}`}
            >
              {t(`requests.states.${request.state}`)}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              {t(`requests.direction.${request.direction}`)}
            </span>
          </div>

          <h2 className="mt-1.5 truncate text-heading text-ink">
            {request.type === 'match' && request.match
              ? request.match.locality
              : counterpartName}
          </h2>
          <p className="truncate text-sm text-ink-soft">
            {t(`requests.counterpart.${request.direction}`, {
              name: counterpartName,
            })}
          </p>
        </div>

        <ClipboardListIcon
          size={20}
          className="mt-1 shrink-0 text-primary-700"
        />
      </div>

      {request.type === 'match' && request.match ? (
        <div className="rounded-control bg-surface-sunken p-3">
          <p className="text-sm font-semibold text-ink">
            {formatMatchDate(request.match.matchDate, locale)} ·{' '}
            {formatMatchTime(request.match.matchDate, locale)}
          </p>
          <p className="mt-1 text-xs text-ink-soft">
            {request.match.position
              ? t('requests.position', { position: request.match.position })
              : t('requests.noPosition')}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {t('requests.matchRequest')}
          </p>
        </div>
      ) : (
        <div className="rounded-control bg-surface-sunken p-3">
          <p className="text-xs text-ink-soft">
            {counterpart.locality ?? t('profile.noLocality')}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {t('requests.playerRequest')}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {request.type === 'match' && request.match ? (
          <Link
            to={`/partidos/${request.match.id}`}
            className="font-semibold text-primary-700 hover:text-primary-800"
          >
            {t('requests.viewMatch')}
          </Link>
        ) : null}
        <Link
          to={`/jugadores/${counterpart.id}`}
          className="font-semibold text-primary-700 hover:text-primary-800"
        >
          {t('requests.viewProfile')}
        </Link>
      </div>

      {request.respondedAt ? (
        <p className="text-xs text-ink-faint">
          {t('requests.respondedAt', {
            date: formatShortDate(request.respondedAt, locale),
          })}
        </p>
      ) : null}

      {request.cancelledAt ? (
        <p className="text-xs text-ink-faint">
          {t('requests.cancelledAt', {
            date: formatShortDate(request.cancelledAt, locale),
          })}
        </p>
      ) : null}

      {request.canRespond || request.canCancel ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {request.canRespond ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  onAction({ request, action: 'accept' });
                }}
              >
                {t('requests.actions.accept')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onAction({ request, action: 'reject' });
                }}
              >
                {t('requests.actions.reject')}
              </Button>
            </>
          ) : null}

          {request.canCancel ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                onAction({ request, action: 'cancel' });
              }}
            >
              {t('requests.actions.cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export function RequestsPage() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const boxFromUrl: RequestBox =
    searchParams.get('box') === 'sent' ? 'sent' : 'received';
  const [box, setBox] = useState<RequestBox>(boxFromUrl);
  const [type, setType] = useState<TypeFilter>('');
  const [state, setState] = useState<StateFilter>('');
  const [page, setPage] = useState(1);
  const [actionTarget, setActionTarget] = useState<ActionTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setBox(boxFromUrl);
    setPage(1);
  }, [boxFromUrl]);

  const requestsQuery = useQuery({
    queryKey: ['requests', box, type, state, page],
    queryFn: () =>
      requestsApi.list({
        box,
        type: type || undefined,
        state: state || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  useEffect(() => {
    const data = requestsQuery.data;
    if (!data || requestsQuery.isFetching || page <= 1) return;
    if (data.requests.length === 0 && data.totalPages < page) {
      setPage(Math.max(1, data.totalPages));
    }
  }, [page, requestsQuery.data, requestsQuery.isFetching]);

  const actionMutation = useMutation<
    RequestResponse,
    unknown,
    ActionTarget
  >({
    mutationFn: (target) => {
      switch (target.action) {
        case 'accept':
          return requestsApi.accept(target.request.id);
        case 'reject':
          return requestsApi.reject(target.request.id);
        case 'cancel':
          return requestsApi.cancel(target.request.id);
      }
    },
    onSuccess: (_data, target) => {
      show('success', t(`requests.success.${target.action}`));
      setActionTarget(null);
      setActionError(null);

      void queryClient.invalidateQueries({ queryKey: ['requests'] });
      void queryClient.invalidateQueries({ queryKey: ['match-search'] });
      if (target.request.match) {
        void queryClient.invalidateQueries({
          queryKey: ['match', target.request.match.id],
        });
      }
    },
    onError: (error) => {
      setActionError(getErrorMessage(error, t));
    },
  });

  const hasFilters = type !== '' || state !== '';

  const openAction = (target: ActionTarget) => {
    setActionError(null);
    setActionTarget(target);
  };

  const closeAction = () => {
    if (actionMutation.isPending) return;
    setActionTarget(null);
    setActionError(null);
  };

  const actionRequest = actionTarget?.request;
  const actionCounterpart = actionRequest
    ? actionRequest.direction === 'received'
      ? actionRequest.sender
      : actionRequest.receiver
    : null;
  const actionName = actionCounterpart?.name ?? t('publicProfile.unnamed');
  const action = actionTarget?.action;

  const actionTitle = action ? t(`requests.confirm.${action}Title`) : '';
  const actionBody = action
    ? t(`requests.confirm.${action}Body`, { name: actionName })
    : '';

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('requests.title')}
        subtitle={t('requests.subtitle')}
      />

      <div
        role="tablist"
        aria-label={t('requests.tabsLabel')}
        className="grid grid-cols-2 gap-1 rounded-pill bg-surface-sunken p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={box === 'received'}
          onClick={() => {
            setBox('received');
            setPage(1);
          }}
          className={`rounded-pill px-3 py-2 text-sm font-semibold transition ${
            box === 'received'
              ? 'bg-white text-brand-950 shadow-card'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          {t('requests.received')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={box === 'sent'}
          onClick={() => {
            setBox('sent');
            setPage(1);
          }}
          className={`rounded-pill px-3 py-2 text-sm font-semibold transition ${
            box === 'sent'
              ? 'bg-white text-brand-950 shadow-card'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          {t('requests.sent')}
        </button>
      </div>

      <Card padding="md">
        <div className="grid grid-cols-2 gap-3">
          <Select
            label={t('requests.filters.type')}
            value={type}
            onChange={(event) => {
              setType(event.target.value as TypeFilter);
              setPage(1);
            }}
          >
            <option value="">{t('requests.filters.allTypes')}</option>
            <option value="match">{t('requests.filters.match')}</option>
            <option value="player">{t('requests.filters.player')}</option>
          </Select>

          <Select
            label={t('requests.filters.state')}
            value={state}
            onChange={(event) => {
              setState(event.target.value as StateFilter);
              setPage(1);
            }}
          >
            <option value="">{t('requests.filters.allStates')}</option>
            <option value="pending">{t('requests.states.pending')}</option>
            <option value="accepted">{t('requests.states.accepted')}</option>
            <option value="rejected">{t('requests.states.rejected')}</option>
            <option value="cancelled">{t('requests.states.cancelled')}</option>
          </Select>
        </div>
      </Card>

      {requestsQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : requestsQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <p className="text-sm font-semibold text-primary-900">
              {requestsQuery.error
                ? getErrorMessage(requestsQuery.error, t)
                : t('requests.loadError')}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={requestsQuery.isFetching}
            onClick={() => {
              void requestsQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : requestsQuery.data && requestsQuery.data.requests.length > 0 ? (
        <>
          <ul className="space-y-3">
            {requestsQuery.data.requests.map((request) => (
              <li key={request.id}>
                <RequestCard request={request} onAction={openAction} />
              </li>
            ))}
          </ul>
          <Pagination
            page={requestsQuery.data.page}
            totalPages={requestsQuery.data.totalPages}
            onChange={setPage}
          />
        </>
      ) : (
        <Card padding="lg">
          <p className="text-sm text-ink-soft">
            {hasFilters ? t('requests.emptyFiltered') : t('requests.empty')}
          </p>
        </Card>
      )}

      <BottomSheet
        open={actionTarget !== null}
        onClose={closeAction}
        title={actionTitle}
        description={actionBody}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              fullWidth
              disabled={actionMutation.isPending}
              onClick={closeAction}
            >
              {t('common.cancel')}
            </Button>
            <Button
              fullWidth
              variant={action === 'accept' ? 'primary' : 'danger'}
              loading={actionMutation.isPending}
              onClick={() => {
                if (actionTarget) actionMutation.mutate(actionTarget);
              }}
            >
              {t('requests.confirm.action')}
            </Button>
          </div>
        }
      >
        {actionTarget ? (
          <>
            <div className="space-y-2 rounded-card bg-surface-sunken p-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-ink-soft">
                  {t('requests.summary.player')}
                </span>
                <span className="text-right font-semibold text-ink">
                  {actionName}
                </span>
              </div>

              {actionTarget.request.type === 'match' &&
              actionTarget.request.match ? (
                <>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">
                      {t('requests.summary.when')}
                    </span>
                    <span className="text-right font-semibold text-ink">
                      {formatMatchDate(
                        actionTarget.request.match.matchDate,
                        locale,
                      )}{' '}
                      ·{' '}
                      {formatMatchTime(
                        actionTarget.request.match.matchDate,
                        locale,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">
                      {t('requests.summary.locality')}
                    </span>
                    <span className="text-right font-semibold text-ink">
                      {actionTarget.request.match.locality}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-soft">
                      {t('requests.summary.position')}
                    </span>
                    <span className="text-right font-semibold capitalize text-ink">
                      {actionTarget.request.match.position ??
                        t('requests.noPosition')}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between gap-3">
                  <span className="text-ink-soft">
                    {t('requests.summary.player')}
                  </span>
                  <span className="text-right font-semibold text-ink">
                    {actionCounterpart?.locality ?? t('profile.noLocality')}
                  </span>
                </div>
              )}
            </div>

            {action === 'accept' &&
            actionTarget.request.type === 'match' ? (
              <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                {t('requests.confirm.acceptMatchHint')}
              </p>
            ) : null}

            {actionError ? (
              <p
                role="alert"
                className="mt-3 text-sm font-medium text-danger-600"
              >
                {actionError}
              </p>
            ) : null}
          </>
        ) : null}
      </BottomSheet>
    </div>
  );
}
