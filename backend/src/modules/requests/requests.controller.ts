import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors.js';
import {
  createRequestSchema,
  listRequestsQuerySchema,
  requestIdParamSchema,
} from './requests.schemas.js';
import {
  acceptRequest,
  cancelRequest,
  createRequest,
  listRequests,
  rejectRequest,
} from './requests.service.js';

function currentUserId(req: Request): number {
  const user = req.sessionUser;
  if (!user) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
  }
  return user.id;
}

export const createRequestHandler: RequestHandler = async (req, res) => {
  const input = createRequestSchema.parse(req.body);
  const request = await createRequest(currentUserId(req), input);
  res.status(201).json({ request });
};

export const listRequestsHandler: RequestHandler = async (req, res) => {
  const query = listRequestsQuerySchema.parse(req.query);

  const result = await listRequests(currentUserId(req), {
    box: query.box,
    type: query.type ?? null,
    state: query.state ?? null,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.status(200).json({
    requests: result.items,
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  });
};

export const acceptRequestHandler: RequestHandler = async (req, res) => {
  const { id } = requestIdParamSchema.parse(req.params);
  const request = await acceptRequest(currentUserId(req), id);
  res.status(200).json({ request });
};

export const rejectRequestHandler: RequestHandler = async (req, res) => {
  const { id } = requestIdParamSchema.parse(req.params);
  const request = await rejectRequest(currentUserId(req), id);
  res.status(200).json({ request });
};

export const cancelRequestHandler: RequestHandler = async (req, res) => {
  const { id } = requestIdParamSchema.parse(req.params);
  const request = await cancelRequest(currentUserId(req), id);
  res.status(200).json({ request });
};
