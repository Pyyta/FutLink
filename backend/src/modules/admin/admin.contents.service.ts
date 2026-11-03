import type { PoolClient } from 'pg';
import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import * as notificationsRepository from '../notifications/notifications.repository.js';
import * as settingsRepository from '../settings/settings.repository.js';
import { findLocalityByName as findCatalogLocality } from '../users/users.repository.js';
import * as repository from './admin.contents.repository.js';
import * as usersRepository from './admin.users.repository.js';
import type {
  AdminCommentContentDto,
  AdminContentDto,
  AdminContentPageDto,
  AdminMatchContentDto,
  ListAdminContentsInput,
  UpdateCommentContentInput,
  UpdateMatchContentInput,
} from './admin.types.js';

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function contentNotFound(): AppError {
  return new AppError(
    404,
    'CONTENT_NOT_FOUND',
    'No existe el contenido indicado',
  );
}

function toContentDto(row: repository.AdminContentUnionRow): AdminContentDto {
  if (row.content_type === 'match') {
    if (
      row.author_id === null ||
      row.match_date === null ||
      row.match_state === null
    ) {
      throw new Error('Fila de partido incompleta');
    }

    return {
      type: 'match',
      id: row.id,
      author: { id: row.author_id, name: row.author_name },
      createdAt: row.created_at.toISOString(),
      moderationState: row.moderation_state,
      matchState: row.match_state,
      matchDate: row.match_date.toISOString(),
      locality: row.locality ?? '',
      modality: row.modality,
      description: row.description,
    };
  }

  if (row.score === null || row.player_id === null) {
    throw new Error('Fila de calificación incompleta');
  }

  return {
    type: 'comment',
    id: row.id,
    author:
      row.author_id === null
        ? null
        : { id: row.author_id, name: row.author_name },
    player: { id: row.player_id, name: row.player_name },
    createdAt: row.created_at.toISOString(),
    moderationState: row.moderation_state,
    score: row.score,
    comment: row.comment,
  };
}

function toMatchContentDto(
  row: repository.AdminMatchContentRow,
): AdminMatchContentDto {
  return {
    type: 'match',
    id: row.id,
    author: { id: row.creator_id, name: row.creator_name },
    createdAt: row.created_at.toISOString(),
    moderationState: row.moderation_state,
    matchState: row.match_state,
    matchDate: row.match_date.toISOString(),
    locality: row.locality,
    modality: row.modality,
    description: row.description,
  };
}

function toCommentContentDto(
  row: repository.AdminCommentContentRow,
): AdminCommentContentDto {
  return {
    type: 'comment',
    id: row.id,
    author:
      row.author_id === null
        ? null
        : { id: row.author_id, name: row.author_name },
    player: { id: row.player_id, name: row.player_name },
    createdAt: row.created_at.toISOString(),
    moderationState: row.moderation_state,
    score: row.score,
    comment: row.comment,
  };
}

export async function listContents(
  input: ListAdminContentsInput,
): Promise<AdminContentPageDto> {
  const filters: repository.AdminContentFilters = {
    type: input.type,
    state: input.state,
    searchPattern:
      input.search === null ? null : `%${escapeLike(input.search)}%`,
    authorId: input.authorId,
    from: input.from,
    to: input.to,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  };

  const [rows, total] = await Promise.all([
    repository.listContents(filters),
    repository.countContents(filters),
  ]);

  return {
    items: rows.map(toContentDto),
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / input.pageSize),
  };
}

async function notifyContentAuthor(
  userId: number,
  adminId: number,
  type: 'content_hidden' | 'content_deleted',
  matchId: number | null,
  ratingId: number | null,
  client: PoolClient,
): Promise<void> {
  if (userId === adminId) {
    return;
  }

  await notificationsRepository.insertNotification(
    {
      userId,
      type,
      requestId: null,
      matchId,
      ratingId,
      actorId: adminId,
    },
    client,
  );
}

export async function updateMatchContent(
  id: number,
  input: UpdateMatchContentInput,
  adminId: number,
): Promise<AdminMatchContentDto> {
  let locality: string | undefined;
  if (input.locality !== undefined) {
    const row = await findCatalogLocality(input.locality);
    if (!row) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'La localidad indicada no es válida',
        { field: 'locality' },
      );
    }
    locality = row.name;
  }

  await withTransaction(async (client) => {
    const current = await repository.findMatchContentForUpdate(id, client);
    if (!current) {
      throw contentNotFound();
    }

    const targetState = input.moderationState;

    if (targetState !== undefined && targetState !== current.moderation_state) {
      await repository.moderateMatch(id, targetState, adminId, client);

      if (targetState === 'hidden' || targetState === 'deleted') {
        await notifyContentAuthor(
          current.creator_id,
          adminId,
          targetState === 'deleted' ? 'content_deleted' : 'content_hidden',
          id,
          null,
          client,
        );
      }

      // Un partido eliminado por moderación se cancela y libera a quienes
      // tenían solicitudes activas, igual que si lo cancelara el organizador.
      if (targetState === 'deleted') {
        await usersRepository.markMatchCancelled(id, client);
        await usersRepository.releaseMatchVacancies(id, client);
        const requests = await usersRepository.cancelActiveRequestsForMatch(
          id,
          adminId,
          client,
        );

        for (const request of requests) {
          await notificationsRepository.insertNotification(
            {
              userId: request.sender_id,
              type: 'match_cancelled',
              requestId: request.id,
              matchId: id,
              actorId: adminId,
            },
            client,
          );
        }
      }
    }

    await repository.updateMatchFields(
      id,
      {
        ...(input.matchDate !== undefined ? { matchDate: input.matchDate } : {}),
        ...(locality !== undefined ? { locality } : {}),
        ...(input.modality !== undefined ? { modality: input.modality } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
      },
      client,
    );
  });

  const updated = await repository.findMatchContent(id);
  if (!updated) {
    throw contentNotFound();
  }
  return toMatchContentDto(updated);
}

export async function updateCommentContent(
  id: number,
  input: UpdateCommentContentInput,
  adminId: number,
): Promise<AdminCommentContentDto> {
  if (input.score !== undefined) {
    const [minScore, maxScore] = await Promise.all([
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
  }

  await withTransaction(async (client) => {
    const current = await repository.findCommentContentForUpdate(id, client);
    if (!current) {
      throw contentNotFound();
    }

    const targetState = input.moderationState;

    if (targetState !== undefined && targetState !== current.moderation_state) {
      await repository.moderateComment(id, targetState, adminId, client);

      if (
        (targetState === 'hidden' || targetState === 'deleted') &&
        current.author_id !== null
      ) {
        await notifyContentAuthor(
          current.author_id,
          adminId,
          targetState === 'deleted' ? 'content_deleted' : 'content_hidden',
          null,
          id,
          client,
        );
      }
    }

    const comment =
      input.comment === undefined
        ? undefined
        : input.comment === null || input.comment.trim() === ''
          ? null
          : input.comment;

    await repository.updateCommentFields(
      id,
      {
        ...(input.score !== undefined ? { score: input.score } : {}),
        ...(comment !== undefined ? { comment } : {}),
      },
      client,
    );
  });

  const updated = await repository.findCommentContent(id);
  if (!updated) {
    throw contentNotFound();
  }
  return toCommentContentDto(updated);
}
