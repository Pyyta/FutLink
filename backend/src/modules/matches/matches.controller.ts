import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors.js';
import {
  createMatchSchema,
  matchIdParamSchema,
  searchMatchesQuerySchema,
} from './matches.schemas.js';
import {
  cancelMatch,
  createMatch,
  getMatchDetail,
  searchMatches,
} from './matches.service.js';
import type { MatchSearchInput } from './matches.types.js';

function currentUserId(req: Request): number {
  const user = req.sessionUser;
  if (!user) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
  }
  return user.id;
}

export const searchMatchesHandler: RequestHandler = async (req, res) => {
  const query = searchMatchesQuerySchema.parse(req.query);
  const input: MatchSearchInput = {
    locality: query.locality ?? null,
    date: query.date ?? null,
    positionId: query.positionId ?? null,
    page: query.page,
    pageSize: query.pageSize,
    latitude: query.latitude ?? null,
    longitude: query.longitude ?? null,
  };

  const result = await searchMatches(currentUserId(req), input);

  res.status(200).json({
    matches: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
};

export const createMatchHandler: RequestHandler = async (req, res) => {
  const input = createMatchSchema.parse(req.body);
  const match = await createMatch(currentUserId(req), input);
  res.status(201).json({ match });
};

export const getMatchHandler: RequestHandler = async (req, res) => {
  const { id } = matchIdParamSchema.parse(req.params);
  const match = await getMatchDetail(currentUserId(req), id);
  res.status(200).json({ match });
};

export const cancelMatchHandler: RequestHandler = async (req, res) => {
  const { id } = matchIdParamSchema.parse(req.params);
  const match = await cancelMatch(currentUserId(req), id);
  res.status(200).json({ match });
};
