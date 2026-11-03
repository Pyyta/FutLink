import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import { isUniqueViolation } from '../../shared/postgres.js';
import * as matchesRepository from '../matches/matches.repository.js';
import * as notificationsRepository from '../notifications/notifications.repository.js';
import { findProfileById } from '../users/users.repository.js';
import * as repository from './requests.repository.js';
import type { RequestRow } from './requests.repository.js';
import type {
  CreateRequestInput,
  ListRequestsInput,
  RequestDirection,
  RequestDto,
  RequestMatchDto,
  RequestPageDto,
  RequestPartyDto,
} from './requests.types.js';

function requestNotFound(): AppError {
  return new AppError(404, 'REQUEST_NOT_FOUND', 'No existe la solicitud indicada');
}

function forbidden(): AppError {
  return new AppError(403, 'FORBIDDEN', 'No tienes permisos sobre esta solicitud');
}

function notPending(): AppError {
  return new AppError(
    409,
    'REQUEST_NOT_PENDING',
    'La solicitud ya no está pendiente de respuesta',
  );
}

function notCancellable(): AppError {
  return new AppError(
    409,
    'REQUEST_NOT_CANCELLABLE',
    'La solicitud ya fue rechazada o cancelada',
  );
}

function toParty(
  id: number,
  name: string | null,
  profilePic: string | null,
  locality: string | null,
  average: number | null,
  count: number,
): RequestPartyDto {
  return {
    id,
    name,
    profilePic,
    locality,
    rating: { average, count },
  };
}

function toRequestDto(row: RequestRow, viewerId: number): RequestDto {
  const direction: RequestDirection =
    row.sender_id === viewerId ? 'sent' : 'received';

  let match: RequestMatchDto | null = null;
  if (
    row.match_id !== null &&
    row.match_date !== null &&
    row.match_locality !== null &&
    row.match_state !== null
  ) {
    match = {
      id: row.match_id,
      matchDate: row.match_date.toISOString(),
      locality: row.match_locality,
      position: row.position,
      state: row.match_state,
    };
  }

  return {
    id: row.id,
    type: row.request_type,
    state: row.state,
    sender: toParty(
      row.sender_id,
      row.sender_name,
      row.sender_profile_pic,
      row.sender_locality,
      row.sender_rating_average,
      row.sender_rating_count,
    ),
    receiver: toParty(
      row.receiver_id,
      row.receiver_name,
      row.receiver_profile_pic,
      row.receiver_locality,
      row.receiver_rating_average,
      row.receiver_rating_count,
    ),
    match,
    direction,
    canRespond: direction === 'received' && row.state === 'pending',
    canCancel:
      direction === 'sent' &&
      (row.state === 'pending' || row.state === 'accepted'),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    respondedAt: row.responded_at ? row.responded_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
  };
}

async function loadRequest(
  viewerId: number,
  requestId: number,
): Promise<RequestDto> {
  const row = await repository.findRequestById(requestId);
  if (!row) {
    throw requestNotFound();
  }
  return toRequestDto(row, viewerId);
}

export async function createRequest(
  userId: number,
  input: CreateRequestInput,
): Promise<RequestDto> {
  if (input.type === 'player') {
    const target = await findProfileById(input.targetUserId);

    if (
      !target ||
      target.state !== 'active' ||
      target.profile_completed_at === null
    ) {
      throw new AppError(
        404,
        'USER_NOT_FOUND',
        'No existe un jugador activo con esa identificación',
      );
    }

    if (target.id === userId) {
      throw new AppError(
        409,
        'CANNOT_REQUEST_SELF',
        'No puedes enviarte una solicitud a ti mismo',
      );
    }

    let requestId: number;
    try {
      requestId = await withTransaction((client) =>
        repository.insertRequest(
          {
            type: 'player',
            senderId: userId,
            receiverId: target.id,
            matchId: null,
            matchVacantId: null,
            targetUserId: target.id,
          },
          client,
        ),
      );
    } catch (error) {
      if (isUniqueViolation(error, 'requests_active_player_ux')) {
        throw new AppError(
          409,
          'REQUEST_ALREADY_EXISTS',
          'Ya tienes una solicitud activa con este jugador',
        );
      }
      throw error;
    }

    return loadRequest(userId, requestId);
  }

  // Orden de bloqueo común con aceptar/cancelar: partido → vacante.
  const requestId = await withTransaction(async (client) => {
    const vacancy = await repository.findVacancy(input.vacancyId);
    if (!vacancy) {
      throw new AppError(404, 'VACANCY_NOT_FOUND', 'No existe la vacante indicada');
    }

    const match = await matchesRepository.lockMatch(vacancy.match_id, client);
    if (!match) {
      throw new AppError(404, 'VACANCY_NOT_FOUND', 'No existe la vacante indicada');
    }

    const lockedVacancy = await repository.lockVacancy(input.vacancyId, client);
    if (!lockedVacancy) {
      throw new AppError(404, 'VACANCY_NOT_FOUND', 'No existe la vacante indicada');
    }

    if (lockedVacancy.creator_id === userId) {
      throw new AppError(
        409,
        'CANNOT_REQUEST_OWN_MATCH',
        'No puedes solicitar una plaza en tu propio partido',
      );
    }

    if (
      lockedVacancy.match_state !== 'available' ||
      lockedVacancy.moderation_state !== 'visible'
    ) {
      throw new AppError(
        409,
        'MATCH_NOT_AVAILABLE',
        'El partido ya no está disponible para recibir solicitudes',
      );
    }

    if (lockedVacancy.match_date.getTime() <= Date.now()) {
      throw new AppError(
        409,
        'MATCH_ALREADY_STARTED',
        'El partido ya comenzó o su fecha pasó',
      );
    }

    if (lockedVacancy.occupied) {
      throw new AppError(
        409,
        'VACANCY_OCCUPIED',
        'La plaza ya está ocupada',
      );
    }

    try {
      return await repository.insertRequest(
        {
          type: 'match',
          senderId: userId,
          receiverId: lockedVacancy.creator_id,
          matchId: lockedVacancy.match_id,
          matchVacantId: lockedVacancy.id,
          targetUserId: null,
        },
        client,
      );
    } catch (error) {
      if (isUniqueViolation(error, 'requests_active_match_ux')) {
        throw new AppError(
          409,
          'REQUEST_ALREADY_EXISTS',
          'Ya tienes una solicitud activa para este partido',
        );
      }
      throw error;
    }
  });

  return loadRequest(userId, requestId);
}

export async function acceptRequest(
  userId: number,
  requestId: number,
): Promise<RequestDto> {
  const header = await repository.findRequestHeader(requestId);
  if (!header) {
    throw requestNotFound();
  }
  if (header.receiver_id !== userId) {
    throw forbidden();
  }

  await withTransaction(async (client) => {
    if (header.request_type === 'match') {
      if (header.match_id === null || header.matchvacant_id === null) {
        throw new Error('Solicitud de partido sin partido o vacante asociados');
      }

      const match = await matchesRepository.lockMatch(header.match_id, client);
      if (!match) {
        throw new AppError(404, 'MATCH_NOT_FOUND', 'No existe el partido indicado');
      }

      const vacancy = await repository.lockVacancy(header.matchvacant_id, client);
      if (!vacancy) {
        throw new AppError(404, 'VACANCY_NOT_FOUND', 'No existe la vacante indicada');
      }

      const locked = await repository.lockRequest(requestId, client);
      if (!locked) {
        throw requestNotFound();
      }
      if (locked.receiver_id !== userId) {
        throw forbidden();
      }
      if (locked.state !== 'pending') {
        throw notPending();
      }
      if (vacancy.occupied) {
        throw new AppError(409, 'VACANCY_OCCUPIED', 'La plaza ya está ocupada');
      }
      if (match.state !== 'available' || match.moderation_state !== 'visible') {
        throw new AppError(
          409,
          'MATCH_NOT_AVAILABLE',
          'El partido ya no está disponible para aceptar solicitudes',
        );
      }

      await repository.occupyVacancy(header.matchvacant_id, client);
      await repository.markRequestAccepted(requestId, client);
      await notificationsRepository.insertNotification(
        {
          userId: locked.sender_id,
          type: 'request_accepted',
          requestId: locked.id,
          matchId: locked.match_id,
          actorId: userId,
        },
        client,
      );

      const freeVacancies = await repository.countFreeVacancies(
        header.match_id,
        client,
      );
      if (freeVacancies === 0) {
        await repository.setMatchState(header.match_id, 'confirmed', client);
      }
      return;
    }

    const locked = await repository.lockRequest(requestId, client);
    if (!locked) {
      throw requestNotFound();
    }
    if (locked.receiver_id !== userId) {
      throw forbidden();
    }
    if (locked.state !== 'pending') {
      throw notPending();
    }

    await repository.markRequestAccepted(requestId, client);
    await notificationsRepository.insertNotification(
      {
        userId: locked.sender_id,
        type: 'request_accepted',
        requestId: locked.id,
        matchId: null,
        actorId: userId,
      },
      client,
    );
  });

  return loadRequest(userId, requestId);
}

export async function rejectRequest(
  userId: number,
  requestId: number,
): Promise<RequestDto> {
  const header = await repository.findRequestHeader(requestId);
  if (!header) {
    throw requestNotFound();
  }
  if (header.receiver_id !== userId) {
    throw forbidden();
  }

  await withTransaction(async (client) => {
    const locked = await repository.lockRequest(requestId, client);
    if (!locked) {
      throw requestNotFound();
    }
    if (locked.receiver_id !== userId) {
      throw forbidden();
    }
    if (locked.state !== 'pending') {
      throw notPending();
    }

    await repository.markRequestRejected(requestId, client);
  });

  return loadRequest(userId, requestId);
}

export async function cancelRequest(
  userId: number,
  requestId: number,
): Promise<RequestDto> {
  const header = await repository.findRequestHeader(requestId);
  if (!header) {
    throw requestNotFound();
  }
  if (header.sender_id !== userId) {
    throw forbidden();
  }

  await withTransaction(async (client) => {
    if (header.request_type === 'match') {
      if (header.match_id === null) {
        throw new Error('Solicitud de partido sin partido asociado');
      }

      const match = await matchesRepository.lockMatch(header.match_id, client);
      if (!match) {
        throw new AppError(404, 'MATCH_NOT_FOUND', 'No existe el partido indicado');
      }

      const vacancy =
        header.matchvacant_id === null
          ? null
          : await repository.lockVacancy(header.matchvacant_id, client);

      const locked = await repository.lockRequest(requestId, client);
      if (!locked) {
        throw requestNotFound();
      }
      if (locked.sender_id !== userId) {
        throw forbidden();
      }
      if (locked.state === 'rejected' || locked.state === 'cancelled') {
        throw notCancellable();
      }

      if (locked.state === 'accepted' && vacancy) {
        await repository.freeVacancy(vacancy.id, client);
        if (match.state === 'confirmed') {
          await repository.setMatchState(header.match_id, 'available', client);
        }
      }

      await repository.markRequestCancelled(requestId, userId, client);
      await notificationsRepository.insertNotification(
        {
          userId: locked.receiver_id,
          type: 'request_cancelled',
          requestId: locked.id,
          matchId: locked.match_id,
          actorId: userId,
        },
        client,
      );
      return;
    }

    const locked = await repository.lockRequest(requestId, client);
    if (!locked) {
      throw requestNotFound();
    }
    if (locked.sender_id !== userId) {
      throw forbidden();
    }
    if (locked.state === 'rejected' || locked.state === 'cancelled') {
      throw notCancellable();
    }

    await repository.markRequestCancelled(requestId, userId, client);
    await notificationsRepository.insertNotification(
      {
        userId: locked.receiver_id,
        type: 'request_cancelled',
        requestId: locked.id,
        matchId: null,
        actorId: userId,
      },
      client,
    );
  });

  return loadRequest(userId, requestId);
}

export async function listRequests(
  userId: number,
  input: ListRequestsInput,
): Promise<RequestPageDto> {
  const filters: repository.ListRequestsFilters = {
    viewerId: userId,
    box: input.box,
    type: input.type,
    state: input.state,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total] = await Promise.all([
    repository.listRequests(filters),
    repository.countRequests(filters),
  ]);

  return {
    items: rows.map((row) => toRequestDto(row, userId)),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}
