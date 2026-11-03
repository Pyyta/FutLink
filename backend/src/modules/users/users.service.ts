import { AppError } from '../../shared/errors.js';
import { isUniqueViolation } from '../../shared/postgres.js';
import type {
  ProfileDto,
  PublicProfileDto,
  RatingCommentDto,
  RatingValueDto,
  UpdateProfileInput,
} from '../auth/auth.types.js';
import * as settingsRepository from '../settings/settings.repository.js';
import * as repository from './users.repository.js';
import type {
  MyRatingRow,
  PositionRow,
  ProfileRow,
  RatingCommentRow,
  RatingSummaryRow,
} from './users.repository.js';
import type {
  PlayerPageDto,
  RateUserInput,
  RateUserResultDto,
  SearchPlayersInput,
} from './users.types.js';

const REQUIRE_ACCEPTED_REQUEST_SETTING = 'ratings.require_accepted_request';

export function toProfileDto(
  row: ProfileRow,
  positions: PositionRow[],
  rating: RatingSummaryRow,
): ProfileDto {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    phone: row.phone,
    locality: row.locality,
    profilePic: row.profile_pic,
    role: row.role,
    state: row.state,
    matchsPlayed: row.matchs_played,
    positions,
    rating,
    profileCompleted: row.profile_completed_at !== null,
    createdAt: row.register_date.toISOString(),
  };
}

function toRatingValueDto(row: MyRatingRow): RatingValueDto {
  return {
    id: row.id,
    score: row.score,
    comment: row.comment,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    moderationState: row.moderation_state,
  };
}

function toRatingCommentDto(row: RatingCommentRow): RatingCommentDto {
  return {
    id: row.id,
    author:
      row.author_id === null
        ? null
        : {
            id: row.author_id,
            name: row.author_name,
            profilePic: row.author_profile_pic,
          },
    score: row.score,
    comment: row.comment,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function loadProfile(userId: number): Promise<ProfileDto> {
  const row = await repository.findProfileById(userId);
  if (!row) {
    throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado');
  }

  const [positions, rating] = await Promise.all([
    repository.listUserPositions(userId),
    repository.getRatingSummary(userId),
  ]);

  return toProfileDto(row, positions, rating);
}

export const getMyProfile = loadProfile;

export async function getPublicProfile(
  viewerId: number,
  targetId: number,
): Promise<PublicProfileDto> {
  const target = await repository.findProfileById(targetId);

  if (!target || target.state !== 'active') {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      'No existe un usuario activo con esa identificación',
    );
  }

  const isSelf = viewerId === target.id;
  const [positions, rating, comments, hasAcceptedRequest, myRating] =
    await Promise.all([
      repository.listUserPositions(target.id),
      repository.getRatingSummary(target.id),
      repository.listRecentComments(target.id),
      isSelf
        ? Promise.resolve(true)
        : repository.hasAcceptedRequestBetween(viewerId, target.id),
      isSelf
        ? Promise.resolve(null)
        : repository.findRatingByAuthor(viewerId, target.id),
    ]);

  const phoneVisible = isSelf || hasAcceptedRequest;

  return {
    id: target.id,
    name: target.name,
    locality: target.locality,
    profilePic: target.profile_pic,
    positions,
    rating,
    comments: comments.map(toRatingCommentDto),
    myRating: myRating === null ? null : toRatingValueDto(myRating),
    phone: phoneVisible ? target.phone : null,
    phoneVisible,
  };
}

/**
 * RF-10: califica o actualiza la calificación del visitante sobre otro perfil.
 * La decisión de Fase 0 deja el requisito de solicitud aceptada desactivado
 * por defecto; si se activa en configuración, se exige una solicitud aceptada
 * en cualquier dirección (la misma regla de privacidad del teléfono).
 */
export async function rateUser(
  authorId: number,
  targetId: number,
  input: RateUserInput,
): Promise<RateUserResultDto> {
  if (authorId === targetId) {
    throw new AppError(
      403,
      'SELF_RATING_NOT_ALLOWED',
      'No puedes calificarte a ti mismo',
    );
  }

  const target = await repository.findProfileById(targetId);
  if (!target || target.state !== 'active') {
    throw new AppError(
      404,
      'USER_NOT_FOUND',
      'No existe un usuario activo con esa identificación',
    );
  }

  const [requiresAcceptedRequest, minScore, maxScore] = await Promise.all([
    settingsRepository.getBooleanSetting(
      REQUIRE_ACCEPTED_REQUEST_SETTING,
      false,
    ),
    settingsRepository.getNumberSetting('ratings.min_score', 1),
    settingsRepository.getNumberSetting('ratings.max_score', 5),
  ]);

  if (input.score < minScore || input.score > maxScore) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `La calificación debe estar entre ${minScore} y ${maxScore}`,
      { field: 'score', min: minScore, max: maxScore },
    );
  }

  const existing = await repository.findRatingByAuthor(authorId, targetId);
  if (existing && existing.moderation_state !== 'visible') {
    throw new AppError(
      403,
      'RATING_MODERATED',
      'Tu calificación fue ocultada o eliminada por moderación',
    );
  }

  if (
    requiresAcceptedRequest &&
    !(await repository.hasAcceptedRequestBetween(authorId, targetId))
  ) {
    throw new AppError(
      403,
      'RATING_REQUIRES_ACCEPTED_REQUEST',
      'Debes tener una solicitud aceptada con este jugador para calificarlo',
    );
  }

  const { rating, summary } = await repository.upsertRating(
    authorId,
    targetId,
    input.score,
    input.comment,
  );

  return {
    rating: toRatingValueDto(rating),
    summary,
  };
}

export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  const normalized = hasPlus ? `+${digits}` : digits;

  if (!/^\+?\d{7,15}$/.test(normalized)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'El teléfono debe contener entre 7 y 15 dígitos',
      { field: 'phone' },
    );
  }

  return normalized;
}

export async function updateMyProfile(
  userId: number,
  input: UpdateProfileInput,
): Promise<ProfileDto> {
  const locality = await repository.findLocalityByName(input.locality);
  if (!locality) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La localidad indicada no es válida', {
      field: 'locality',
    });
  }

  const positionIds = [...new Set(input.positionIds)];
  const positions = await repository.findPositionsByIds(positionIds);
  if (positions.length !== positionIds.length) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Una o más posiciones indicadas no son válidas',
      { field: 'positionIds' },
    );
  }

  const phone = normalizePhone(input.phone);
  if (await repository.phoneBelongsToAnotherUser(phone, userId)) {
    throw new AppError(409, 'PHONE_IN_USE', 'Ese número de teléfono ya está registrado');
  }

  try {
    await repository.updateUserProfile(userId, {
      name: input.name,
      phone,
      locality: locality.name,
      positionIds,
    });
  } catch (error) {
    if (isUniqueViolation(error, 'users_phone_key')) {
      throw new AppError(409, 'PHONE_IN_USE', 'Ese número de teléfono ya está registrado');
    }
    throw error;
  }

  return loadProfile(userId);
}

/**
 * Convierte % y _ en literales: el usuario busca texto, no comodines de ILIKE.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

export async function searchPlayers(
  viewerId: number,
  input: SearchPlayersInput,
): Promise<PlayerPageDto> {
  const [localityRow, positionRows] = await Promise.all([
    input.locality === null
      ? Promise.resolve(null)
      : repository.findLocalityByName(input.locality),
    input.positionId === null
      ? Promise.resolve([])
      : repository.findPositionsByIds([input.positionId]),
  ]);

  if (input.locality !== null && !localityRow) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La localidad indicada no es válida', {
      field: 'locality',
    });
  }

  if (input.positionId !== null && positionRows.length === 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'La posición indicada no es válida', {
      field: 'positionId',
    });
  }

  const filters: repository.PlayerSearchFilters = {
    viewerId,
    name: input.name === null ? null : escapeLike(input.name),
    locality: localityRow?.name ?? null,
    positionId: input.positionId,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total] = await Promise.all([
    repository.searchPlayers(filters),
    repository.countPlayers(filters),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      locality: row.locality,
      profilePic: row.profile_pic,
      positions: row.positions,
      rating: { average: row.rating_average, count: row.rating_count },
    })),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}
