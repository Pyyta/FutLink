import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  AlertCircleIcon,
  Button,
  Card,
  ChevronLeftIcon,
  ChevronRightIcon,
  Chip,
  Input,
  Select,
  Spinner,
  StarRating,
} from '../components/ui';
import { getErrorMessage } from '../lib/api/error-message';
import { catalogApi, matchesApi, usersApi } from '../lib/api/endpoints';
import type {
  MatchListItem,
  PlayerListItem,
} from '../lib/api/types';
import {
  formatMatchDate,
  formatMatchTime,
  getInitials,
} from '../lib/format';
import { isAppLocale, type AppLocale } from '../i18n';

type SearchTab = 'matches' | 'players';

interface MatchFilters {
  locality: string;
  date: string;
  positionId: string;
}

interface PlayerFilters {
  name: string;
  locality: string;
  positionId: string;
}

const PAGE_SIZE = 10;
const EMPTY_MATCH_FILTERS: MatchFilters = {
  locality: '',
  date: '',
  positionId: '',
};
const EMPTY_PLAYER_FILTERS: PlayerFilters = {
  name: '',
  locality: '',
  positionId: '',
};

function useLocale(): AppLocale {
  const { i18n } = useTranslation();
  return isAppLocale(i18n.language) ? i18n.language : 'es-CO';
}

function MatchResultCard({ match }: { match: MatchListItem }) {
  const { t } = useTranslation();
  const locale = useLocale();

  return (
    <Link to={`/partidos/${match.id}`} className="block">
      <Card
        padding="md"
        className="transition hover:border-primary-300 hover:shadow-card"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-caption font-semibold uppercase tracking-[0.12em] text-primary-700">
              {formatMatchDate(match.matchDate, locale)} ·{' '}
              {formatMatchTime(match.matchDate, locale)}
            </p>
            <h2 className="mt-0.5 truncate text-heading text-ink">
              {match.locality}
            </h2>
          </div>
          <Chip tone="primary" className="shrink-0">
            {t('search.freeSpots', { count: match.freeSpots })}
          </Chip>
        </div>

        {match.modality ? (
          <p className="mt-1 text-sm capitalize text-ink-soft">
            {match.modality}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.positions.map((position) => (
            <Chip key={position.positionId} className="capitalize">
              {position.position} · {position.freeSlots}/{position.slots}
            </Chip>
          ))}
        </div>

        <p className="mt-3 truncate text-xs text-ink-faint">
          {t('search.organizer', {
            name: match.creator.name ?? t('publicProfile.unnamed'),
          })}
        </p>
      </Card>
    </Link>
  );
}

function PlayerResultCard({ player }: { player: PlayerListItem }) {
  const { t } = useTranslation();

  const displayName = player.name ?? t('publicProfile.unnamed');
  const hasRating = player.rating.count > 0 && player.rating.average !== null;

  return (
    <Link to={`/jugadores/${player.id}`} className="block">
      <Card
        padding="md"
        className="transition hover:border-primary-300 hover:shadow-card"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint text-sm font-extrabold text-primary-800">
            {player.profilePic ? (
              <img
                src={player.profilePic}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(player.name, '') || 'FL'
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-ink">
              {displayName}
            </h2>
            <p className="text-xs text-ink-soft">
              {player.locality ?? t('profile.noLocality')}
            </p>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {player.positions.map((position) => (
                <Chip key={position.id} className="capitalize">
                  {position.title}
                </Chip>
              ))}
            </div>
          </div>

          <div className="shrink-0 text-right">
            {hasRating ? (
              <>
                <StarRating
                  value={player.rating.average ?? 0}
                  size="sm"
                  label={t('components.starRating.label', {
                    value: (player.rating.average ?? 0).toFixed(1),
                    max: 5,
                  })}
                />
                <p className="mt-0.5 text-xs font-semibold text-ink-soft">
                  {(player.rating.average ?? 0).toFixed(1)} (
                  {player.rating.count})
                </p>
              </>
            ) : (
              <span className="text-xs text-ink-faint">
                {t('home.noRating')}
              </span>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

function Pagination({ page, totalPages, onChange }: PaginationProps) {
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
        {t('search.previous')}
      </Button>

      <p className="text-xs font-semibold text-ink-soft">
        {t('search.pageOf', { page, totalPages })}
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
        {t('search.next')}
      </Button>
    </div>
  );
}

export function SearchPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<SearchTab>('matches');
  const [matchDraft, setMatchDraft] = useState(EMPTY_MATCH_FILTERS);
  const [matchFilters, setMatchFilters] = useState(EMPTY_MATCH_FILTERS);
  const [matchPage, setMatchPage] = useState(1);
  const [playerDraft, setPlayerDraft] = useState(EMPTY_PLAYER_FILTERS);
  const [playerFilters, setPlayerFilters] = useState(EMPTY_PLAYER_FILTERS);
  const [playerPage, setPlayerPage] = useState(1);

  const catalogQuery = useQuery({
    queryKey: ['catalog'],
    queryFn: catalogApi.get,
  });

  const matchQuery = useQuery({
    queryKey: ['match-search', matchFilters, matchPage],
    queryFn: () =>
      matchesApi.search({
        locality: matchFilters.locality || undefined,
        date: matchFilters.date || undefined,
        positionId: matchFilters.positionId
          ? Number(matchFilters.positionId)
          : undefined,
        page: matchPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === 'matches',
  });

  const playerQuery = useQuery({
    queryKey: ['player-search', playerFilters, playerPage],
    queryFn: () =>
      usersApi.search({
        name: playerFilters.name.trim() || undefined,
        locality: playerFilters.locality || undefined,
        positionId: playerFilters.positionId
          ? Number(playerFilters.positionId)
          : undefined,
        page: playerPage,
        pageSize: PAGE_SIZE,
      }),
    enabled: tab === 'players',
  });

  const positions = catalogQuery.data?.positions ?? [];
  const localities = catalogQuery.data?.localities ?? [];

  const submitMatchFilters = (event: FormEvent) => {
    event.preventDefault();
    setMatchFilters(matchDraft);
    setMatchPage(1);
  };

  const submitPlayerFilters = (event: FormEvent) => {
    event.preventDefault();
    setPlayerFilters(playerDraft);
    setPlayerPage(1);
  };

  const resetFilters = () => {
    if (tab === 'matches') {
      setMatchDraft(EMPTY_MATCH_FILTERS);
      setMatchFilters(EMPTY_MATCH_FILTERS);
      setMatchPage(1);
      return;
    }

    setPlayerDraft(EMPTY_PLAYER_FILTERS);
    setPlayerFilters(EMPTY_PLAYER_FILTERS);
    setPlayerPage(1);
  };

  const resultsCount =
    tab === 'matches'
      ? (matchQuery.data?.total ?? 0)
      : (playerQuery.data?.total ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader title={t('search.title')} subtitle={t('search.subtitle')} />

      <div
        role="tablist"
        aria-label={t('search.tabsLabel')}
        className="grid grid-cols-2 gap-1 rounded-pill bg-surface-sunken p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'matches'}
          onClick={() => {
            setTab('matches');
          }}
          className={`rounded-pill px-3 py-2 text-sm font-semibold transition ${
            tab === 'matches'
              ? 'bg-white text-brand-950 shadow-card'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          {t('search.matchesTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'players'}
          onClick={() => {
            setTab('players');
          }}
          className={`rounded-pill px-3 py-2 text-sm font-semibold transition ${
            tab === 'players'
              ? 'bg-white text-brand-950 shadow-card'
              : 'text-ink-soft hover:text-ink'
          }`}
        >
          {t('search.playersTab')}
        </button>
      </div>

      <Card padding="md">
        {tab === 'matches' ? (
          <form onSubmit={submitMatchFilters} className="space-y-3">
            <Select
              label={t('search.localityFilter')}
              value={matchDraft.locality}
              onChange={(event) => {
                setMatchDraft((current) => ({
                  ...current,
                  locality: event.target.value,
                }));
              }}
            >
              <option value="">{t('search.anyLocality')}</option>
              {localities.map((locality) => (
                <option key={locality.name} value={locality.name}>
                  {locality.name}
                </option>
              ))}
            </Select>

            <div className="grid grid-cols-2 gap-3">
              <Input
                type="date"
                label={t('search.dateFilter')}
                value={matchDraft.date}
                onChange={(event) => {
                  setMatchDraft((current) => ({
                    ...current,
                    date: event.target.value,
                  }));
                }}
              />
              <Select
                label={t('search.positionFilter')}
                value={matchDraft.positionId}
                onChange={(event) => {
                  setMatchDraft((current) => ({
                    ...current,
                    positionId: event.target.value,
                  }));
                }}
              >
                <option value="">{t('search.anyPosition')}</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" fullWidth>
                {t('search.action')}
              </Button>
              <Button variant="ghost" onClick={resetFilters}>
                {t('search.clear')}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={submitPlayerFilters} className="space-y-3">
            <Input
              label={t('search.nameFilter')}
              placeholder={t('search.namePlaceholder')}
              value={playerDraft.name}
              onChange={(event) => {
                setPlayerDraft((current) => ({
                  ...current,
                  name: event.target.value,
                }));
              }}
            />

            <div className="grid grid-cols-2 gap-3">
              <Select
                label={t('search.localityFilter')}
                value={playerDraft.locality}
                onChange={(event) => {
                  setPlayerDraft((current) => ({
                    ...current,
                    locality: event.target.value,
                  }));
                }}
              >
                <option value="">{t('search.anyLocality')}</option>
                {localities.map((locality) => (
                  <option key={locality.name} value={locality.name}>
                    {locality.name}
                  </option>
                ))}
              </Select>
              <Select
                label={t('search.positionFilter')}
                value={playerDraft.positionId}
                onChange={(event) => {
                  setPlayerDraft((current) => ({
                    ...current,
                    positionId: event.target.value,
                  }));
                }}
              >
                <option value="">{t('search.anyPosition')}</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.title}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex gap-2">
              <Button type="submit" fullWidth>
                {t('search.action')}
              </Button>
              <Button variant="ghost" onClick={resetFilters}>
                {t('search.clear')}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {catalogQuery.isError ? (
        <p className="text-xs text-ink-faint">
          {t('search.catalogError')}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading text-ink">
          {tab === 'matches'
            ? t('search.matchesTab')
            : t('search.playersTab')}
        </h2>
        <span className="text-xs font-semibold text-ink-soft">
          {t('search.resultsCount', { count: resultsCount })}
        </span>
      </div>

      {tab === 'matches' ? (
        matchQuery.isLoading ? (
          <Card tone="mint" padding="lg">
            <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
              <Spinner size={18} />
              {t('common.loading')}
            </div>
          </Card>
        ) : matchQuery.isError ? (
          <Card tone="mint" padding="lg">
            <div className="flex items-start gap-3">
              <AlertCircleIcon size={20} className="text-danger-600" />
              <p className="text-sm font-semibold text-primary-900">
                {getErrorMessage(matchQuery.error, t)}
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
        ) : matchQuery.data && matchQuery.data.matches.length > 0 ? (
          <>
            <ul className="space-y-3">
              {matchQuery.data.matches.map((match) => (
                <li key={match.id}>
                  <MatchResultCard match={match} />
                </li>
              ))}
            </ul>
            <Pagination
              page={matchQuery.data.page}
              totalPages={matchQuery.data.totalPages}
              onChange={setMatchPage}
            />
          </>
        ) : (
          <Card padding="lg">
            <p className="text-sm text-ink-soft">{t('search.noMatches')}</p>
          </Card>
        )
      ) : playerQuery.isLoading ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-center gap-3 text-sm font-medium text-primary-900">
            <Spinner size={18} />
            {t('common.loading')}
          </div>
        </Card>
      ) : playerQuery.isError ? (
        <Card tone="mint" padding="lg">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={20} className="text-danger-600" />
            <p className="text-sm font-semibold text-primary-900">
              {getErrorMessage(playerQuery.error, t)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            loading={playerQuery.isFetching}
            onClick={() => {
              void playerQuery.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : playerQuery.data && playerQuery.data.players.length > 0 ? (
        <>
          <ul className="space-y-3">
            {playerQuery.data.players.map((player) => (
              <li key={player.id}>
                <PlayerResultCard player={player} />
              </li>
            ))}
          </ul>
          <Pagination
            page={playerQuery.data.page}
            totalPages={playerQuery.data.totalPages}
            onChange={setPlayerPage}
          />
        </>
      ) : (
        <Card padding="lg">
          <p className="text-sm text-ink-soft">{t('search.noPlayers')}</p>
        </Card>
      )}
    </div>
  );
}
