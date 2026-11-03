import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { withTransaction } from '../../config/db.js';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import { isUniqueViolation } from '../../shared/postgres.js';
import * as notificationsRepository from '../notifications/notifications.repository.js';
import * as settingsRepository from '../settings/settings.repository.js';
import {
  findLocalityByName as findCatalogLocality,
  findPositionsByIds,
  getRatingSummary,
  listUserPositions,
} from '../users/users.repository.js';
import { normalizePhone } from '../users/users.service.js';
import type {
  AdminUserDetailDto,
  AdminUserListItemDto,
  AdminUserPageDto,
  CreateAdminUserInput,
  DeleteAdminUserResultDto,
  ListAdminUsersInput,
  UpdateAdminUserInput,
} from './admin.types.js';
import * as repository from './admin.users.repository.js';
import type { AdminUserRow } from './admin.users.repository.js';

const NOTIFICATIONS_ENABLED_SETTING = 'notifications.enabled';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function toAdminUserDto(row: AdminUserRow): AdminUserListItemDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    locality: row.locality,
    role: row.role,
    state: row.state,
    matchsPlayed: row.matchs_played,
    profilePic: row.profile_pic,
    profileCompleted: row.profile_completed_at !== null,
    createdAt: row.register_date.toISOString(),
  };
}

async function loadAdminUser(id: number): Promise<AdminUserDetailDto> {
  const row = await repository.findAdminUserById(id);
  if (!row) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
  }

  const [positions, rating] = await Promise.all([
    listUserPositions(id),
    getRatingSummary(id),
  ]);

  return {
    ...toAdminUserDto(row),
    positions,
    rating,
  };
}

export async function listAdminUsers(
  input: ListAdminUsersInput,
): Promise<AdminUserPageDto> {
  const filters: repository.AdminUserFilters = {
    searchPattern:
      input.search === null ? null : `%${escapeLike(input.search)}%`,
    state: input.state,
    role: input.role,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total] = await Promise.all([
    repository.listAdminUsers(filters),
    repository.countAdminUsers(filters),
  ]);

  return {
    users: rows.map(toAdminUserDto),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

export function getAdminUser(id: number): Promise<AdminUserDetailDto> {
  return loadAdminUser(id);
}

async function resolveLocality(name: string): Promise<string> {
  const locality = await findCatalogLocality(name);
  if (!locality) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'La localidad indicada no es válida',
      { field: 'locality' },
    );
  }
  return locality.name;
}

async function resolvePositions(ids: number[]): Promise<number[]> {
  const uniqueIds = [...new Set(ids)];
  const positions = await findPositionsByIds(uniqueIds);

  if (positions.length !== uniqueIds.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Una o más posiciones indicadas no son válidas',
      { field: 'positionIds' },
    );
  }

  return uniqueIds;
}

export async function createAdminUser(
  input: CreateAdminUserInput,
): Promise<AdminUserDetailDto> {
  const locality = await resolveLocality(input.locality);
  const positionIds = await resolvePositions(input.positionIds);
  const phone = normalizePhone(input.phone);

  if (await repository.findEmailOwner(input.email, null)) {
    throw new AppError(
      409,
      'EMAIL_IN_USE',
      'Ya existe una cuenta con ese correo electrónico',
    );
  }

  if (await repository.findPhoneOwner(phone, null)) {
    throw new AppError(
      409,
      'PHONE_IN_USE',
      'Ese número de teléfono ya está registrado',
    );
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);

  let userId: number;
  try {
    userId = await withTransaction(async (client) => {
      const id = await repository.insertAdminUser(
        {
          email: input.email,
          password: passwordHash,
          name: input.name,
          phone,
          locality,
          role: input.role,
        },
        client,
      );

      await repository.replaceUserPositions(id, positionIds, client);
      await repository.refreshProfileCompletion(id, client);
      return id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'EMAIL_IN_USE',
        'Ya existe una cuenta con ese correo o teléfono',
      );
    }
    throw error;
  }

  return loadAdminUser(userId);
}

export async function updateAdminUser(
  id: number,
  input: UpdateAdminUserInput,
  adminId: number,
): Promise<AdminUserDetailDto> {
  const current = await repository.findAdminUserById(id);
  if (!current) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
  }

  if (
    id === adminId &&
    ((input.state !== undefined && input.state !== 'active') ||
      (input.role !== undefined && input.role !== 'admin'))
  ) {
    throw new AppError(
      409,
      'CANNOT_MODIFY_SELF',
      'No puedes suspender ni quitarte el rol de administrador',
    );
  }

  const fields: repository.AdminUserUpdateFields = {};

  if (input.email !== undefined) {
    if (await repository.findEmailOwner(input.email, id)) {
      throw new AppError(
        409,
        'EMAIL_IN_USE',
        'Ya existe una cuenta con ese correo electrónico',
      );
    }
    fields.email = input.email;
  }

  if (input.phone !== undefined) {
    const phone = normalizePhone(input.phone);
    if (await repository.findPhoneOwner(phone, id)) {
      throw new AppError(
        409,
        'PHONE_IN_USE',
        'Ese número de teléfono ya está registrado',
      );
    }
    fields.phone = phone;
  }

  if (input.name !== undefined) fields.name = input.name;
  if (input.locality !== undefined) {
    fields.locality = await resolveLocality(input.locality);
  }
  if (input.role !== undefined) fields.role = input.role;
  if (input.state !== undefined) fields.state = input.state;
  if (input.password !== undefined) {
    fields.password = await bcrypt.hash(input.password, env.BCRYPT_COST);
  }

  const positionIds =
    input.positionIds === undefined
      ? null
      : await resolvePositions(input.positionIds);

  try {
    await withTransaction(async (client) => {
      const locked = await repository.findAdminUserForUpdate(id, client);
      if (!locked) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
      }

      await repository.updateAdminUser(id, fields, client);

      if (positionIds !== null) {
        await repository.replaceUserPositions(id, positionIds, client);
      }

      await repository.refreshProfileCompletion(id, client);

      if (fields.password !== undefined || fields.state === 'suspended') {
        await repository.revokeUserSessions(id, client);
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'EMAIL_IN_USE',
        'El correo o el teléfono ya pertenecen a otra cuenta',
      );
    }
    throw error;
  }

  return loadAdminUser(id);
}

/**
 * RF-11: el borrado es lógico para conservar el historial, pero la cuenta queda
 * anonimizada e inutilizable. Antes de borrar se cancelan los partidos del
 * organizador y todas las solicitudes activas, se liberan plazas y se avisa a
 * las contrapartes.
 */
export async function deleteAdminUser(
  id: number,
  adminId: number,
): Promise<DeleteAdminUserResultDto> {
  if (id === adminId) {
    throw new AppError(
      409,
      'CANNOT_DELETE_SELF',
      'No puedes eliminar tu propia cuenta',
    );
  }

  const current = await repository.findAdminUserById(id);
  if (!current || current.state === 'deleted') {
    throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
  }

  const notificationsEnabled = await settingsRepository.getBooleanSetting(
    NOTIFICATIONS_ENABLED_SETTING,
    true,
  );
  const anonymizedEmail = `deleted+${id}@futlink.invalid`;
  const unusablePassword = await bcrypt.hash(
    randomBytes(32).toString('hex'),
    env.BCRYPT_COST,
  );

  const result = await withTransaction(async (client) => {
    const locked = await repository.findAdminUserForUpdate(id, client);
    if (!locked || locked.state === 'deleted') {
      throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
    }

    const notified = new Set<number>();
    let cancelledRequests = 0;

    const ownedMatches = await repository.lockOwnedMatches(id, client);
    for (const match of ownedMatches) {
      await repository.markMatchCancelled(match.id, client);
      await repository.releaseMatchVacancies(match.id, client);

      const requests = await repository.cancelActiveRequestsForMatch(
        match.id,
        adminId,
        client,
      );
      cancelledRequests += requests.length;

      for (const request of requests) {
        notified.add(request.sender_id);
        if (notificationsEnabled) {
          await notificationsRepository.insertNotification(
            {
              userId: request.sender_id,
              type: 'match_cancelled',
              requestId: request.id,
              matchId: match.id,
              actorId: id,
            },
            client,
          );
        }
      }
    }

    const activeRequests = await repository.findActiveRequestsInvolvingUser(
      id,
      client,
    );
    for (const request of activeRequests) {
      if (
        request.state === 'accepted' &&
        request.request_type === 'match' &&
        request.matchvacant_id !== null
      ) {
        await repository.freeVacancy(request.matchvacant_id, client);
        if (request.match_id !== null) {
          await repository.reopenMatchIfVacant(request.match_id, client);
        }
      }

      await repository.cancelRequestByAdmin(request.id, adminId, client);
      cancelledRequests += 1;

      const counterpart =
        request.sender_id === id ? request.receiver_id : request.sender_id;
      notified.add(counterpart);

      if (notificationsEnabled) {
        await notificationsRepository.insertNotification(
          {
            userId: counterpart,
            type: 'request_cancelled',
            requestId: request.id,
            matchId: request.match_id,
            actorId: id,
          },
          client,
        );
      }
    }

    await repository.softDeleteUser(
      id,
      anonymizedEmail,
      unusablePassword,
      client,
    );
    await repository.deleteUserPositions(id, client);
    await repository.revokeUserSessions(id, client);

    return {
      cancelledRequests,
      cancelledMatches: ownedMatches.length,
      notifiedUsers: notified.size,
    };
  });

  return {
    userId: id,
    state: 'deleted',
    ...result,
  };
}
