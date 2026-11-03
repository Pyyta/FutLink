import type { Request, RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../../shared/errors.js';
import {
  rateUserSchema,
  updateProfileSchema,
  searchPlayersQuerySchema,
} from './users.schemas.js';
import {
  getMyProfile,
  getPublicProfile,
  rateUser,
  searchPlayers,
  updateMyProfile,
} from './users.service.js';

const userIdParamSchema = z.object({
  id: z.coerce.number().int().positive('El identificador debe ser un entero positivo'),
});

function currentUserId(req: Request): number {
  const user = req.sessionUser;
  if (!user) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
  }
  return user.id;
}

export const getMeHandler: RequestHandler = async (req, res) => {
  const user = await getMyProfile(currentUserId(req));
  res.status(200).json({ user });
};

export const updateMyProfileHandler: RequestHandler = async (req, res) => {
  const input = updateProfileSchema.parse(req.body);
  const user = await updateMyProfile(currentUserId(req), input);
  res.status(200).json({ user });
};

export const getPublicProfileHandler: RequestHandler = async (req, res) => {
  const viewerId = currentUserId(req);
  const { id } = userIdParamSchema.parse(req.params);
  const profile = await getPublicProfile(viewerId, id);
  res.status(200).json({ profile });
};

export const rateUserHandler: RequestHandler = async (req, res) => {
  const authorId = currentUserId(req);
  const { id } = userIdParamSchema.parse(req.params);
  const input = rateUserSchema.parse(req.body);

  const result = await rateUser(authorId, id, {
    score: input.score,
    comment: input.comment && input.comment.length > 0 ? input.comment : null,
  });

  res.status(200).json(result);
};

export const searchPlayersHandler: RequestHandler = async (req, res) => {
  const query = searchPlayersQuerySchema.parse(req.query);
  const result = await searchPlayers(currentUserId(req), {
    name: query.name ?? null,
    locality: query.locality ?? null,
    positionId: query.positionId ?? null,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.status(200).json({
    players: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
};
