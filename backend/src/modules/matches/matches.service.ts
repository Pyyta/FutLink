import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import * as notificationsRepository from '../notifications/notifications.repository.js';
import {
  findLocalityByName,
  findPositionsByIds,
} from '../users/users.repository.js';
import * as repository from './matches.repository.js';
import type {
  CreateMatchInput,
  MatchDetailDto,
  MatchListItemDto,
  MatchPageDto,
  MatchPositionDto,
  MatchSearchInput,
  MatchVacancyDto,
} from './matches.types.js';
import type { MatchBaseRow, VacancyRow } from './matches.repository.js';

function toMatchListItem(
  row: MatchBaseRow,
  positions: MatchPositionDto[],
  viewerId: number,
  distanceMeters: number | null,
): MatchListItemDto {
  return {
    id: row.id,
    locality: row.locality,
    matchDate: row.match_date.toISOString(),
    modality: row.modality,
    description: row.description,
    state: row.state,
    totalSpots: row.total_spots,
    freeSpots: row.free_spots,
    positions,
    creator: {
      id: row.creator_id,
      name: row.creator_name,
      profilePic: row.creator_profile_pic,
    },
    isOwner: row.creator_id === viewerId,
    distanceMeters,
  };
}

function summarizeVacancies(vacancies: VacancyRow[]): MatchPositionDto[] {
  const byPosition = new Map<number, MatchPositionDto>();

  for (const vacancy of vacancies) {
    const current = byPosition.get(vacancy.position_id) ?? {
      positionId: vacancy.position_id,
      position: vacancy.position,
      slots: 0,
      freeSlots: 0,
    };
    current.slots += 1;
    if (!vacancy.occupied) {
      current.freeSlots += 1;
    }
    byPosition.set(vacancy.position_id, current);
  }

  return [...byPosition.values()];
}

async function resolveLocality(name: string): Promise<string> {
  const locality = await findLocalityByName(name);
  if (!locality) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La localidad indicada no es válida', {
      field: 'locality',
    });
  }
  return locality.name;
}

async function resolvePosition(positionId: number): Promise<string> {
  const positions = await findPositionsByIds([positionId]);
  const position = positions[0];
  if (!position) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'La posición indicada no es válida',
      { field: 'positionId' },
    );
  }
  return position.title;
}

/**
 * Bogotá D.C. no aplica horario de verano: el día calendario se calcula con el
 * desplazamiento fijo UTC-05:00.
 */
function bogotaDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00-05:00`);
  const end = new Date(start.getTime() + 86_400_000);

  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== date) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La fecha indicada no es válida', {
      field: 'date',
    });
  }

  return { start, end };
}

export async function createMatch(
  creatorId: number,
  input: CreateMatchInput,
): Promise<MatchDetailDto> {
  if (input.matchDate.getTime() <= Date.now()) {
    throw new AppError(
      400,
      'MATCH_DATE_IN_PAST',
      'La fecha y hora del partido deben estar en el futuro',
      { field: 'matchDate' },
    );
  }

  const locality = await resolveLocality(input.locality);
  const positionIds = input.positions.map((item) => item.positionId);
  const positions = await findPositionsByIds(positionIds);

  if (positions.length !== positionIds.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Una o más posiciones indicadas no son válidas',
      { field: 'positions' },
    );
  }

  const titleById = new Map(positions.map((position) => [position.id, position.title]));
  const vacancyTitles: string[] = [];

  for (const group of input.positions) {
    const title = titleById.get(group.positionId);
    if (!title) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Una o más posiciones indicadas no son válidas',
        { field: 'positions' },
      );
    }
    for (let slot = 0; slot < group.slots; slot += 1) {
      vacancyTitles.push(title);
    }
  }

  const matchId = await withTransaction(async (client) => {
    const id = await repository.insertMatch(
      {
        creatorId,
        matchDate: input.matchDate,
        locality,
        modality: input.modality,
        description: input.description,
        latitude: input.latitude,
        longitude: input.longitude,
      },
      client,
    );

    await repository.insertVacancies(id, vacancyTitles, client);
    return id;
  });

  return getMatchDetail(creatorId, matchId);
}

export async function searchMatches(
  viewerId: number,
  input: MatchSearchInput,
): Promise<MatchPageDto> {
  const locality = input.locality === null ? null : await resolveLocality(input.locality);
  const position =
    input.positionId === null ? null : await resolvePosition(input.positionId);
  const range = input.date === null ? null : bogotaDayRange(input.date);

  const filters: repository.MatchSearchFilters = {
    locality,
    dateStart: range?.start ?? null,
    dateEnd: range?.end ?? null,
    position,
    latitude: input.latitude,
    longitude: input.longitude,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total] = await Promise.all([
    repository.searchMatches(filters),
    repository.countMatches(filters),
  ]);

  const summaries =
    rows.length > 0
      ? await repository.listPositionSummaries(rows.map((row) => row.id))
      : [];

  const byMatch = new Map<number, MatchPositionDto[]>();
  for (const summary of summaries) {
    const list = byMatch.get(summary.match_id) ?? [];
    list.push({
      positionId: summary.position_id,
      position: summary.position,
      slots: summary.slots,
      freeSlots: summary.free_slots,
    });
    byMatch.set(summary.match_id, list);
  }

  const items = rows.map((row) =>
    toMatchListItem(
      row,
      byMatch.get(row.id) ?? [],
      viewerId,
      row.distance_meters === null ? null : Math.round(row.distance_meters),
    ),
  );

  return {
    items,
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export async function getMatchDetail(
  viewerId: number,
  matchId: number,
): Promise<MatchDetailDto> {
  const row = await repository.findMatchDetail(matchId);
  if (
    !row ||
    (row.moderation_state !== 'visible' && row.creator_id !== viewerId)
  ) {
    throw new AppError(404, 'MATCH_NOT_FOUND', 'No existe el partido indicado');
  }

  const vacancies = await repository.listVacancies(matchId);
  const base = toMatchListItem(row, summarizeVacancies(vacancies), viewerId, null);
  const vacancyDtos: MatchVacancyDto[] = vacancies.map((vacancy) => ({
    id: vacancy.id,
    positionId: vacancy.position_id,
    position: vacancy.position,
    occupied: vacancy.occupied,
  }));

  return {
    ...base,
    vacancies: vacancyDtos,
    createdAt: row.created_at.toISOString(),
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    canCancel: base.isOwner && row.state !== 'cancelled',
  };
}

export async function cancelMatch(
  userId: number,
  matchId: number,
): Promise<MatchDetailDto> {
  await withTransaction(async (client) => {
    const match = await repository.lockMatch(matchId, client);

    if (!match) {
      throw new AppError(404, 'MATCH_NOT_FOUND', 'No existe el partido indicado');
    }

    if (match.creator_id !== userId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Solo el organizador puede cancelar el partido',
      );
    }

    if (match.state === 'cancelled') {
      throw new AppError(409, 'MATCH_ALREADY_CANCELLED', 'El partido ya está cancelado');
    }

    await repository.markMatchCancelled(matchId, client);
    await repository.releaseVacancies(matchId, client);

    const cancelledRequests = await repository.cancelActiveRequests(
      matchId,
      userId,
      client,
    );

    for (const request of cancelledRequests) {
      await notificationsRepository.insertNotification(
        {
          userId: request.sender_id,
          type: 'match_cancelled',
          requestId: request.id,
          matchId,
          actorId: userId,
        },
        client,
      );
    }
  });

  return getMatchDetail(userId, matchId);
}
