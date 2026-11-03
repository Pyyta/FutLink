import type { Request, RequestHandler } from 'express';
import { AppError } from '../../shared/errors.js';
import * as configService from './admin.config.service.js';
import * as contentsService from './admin.contents.service.js';
import * as reportsService from './admin.reports.service.js';
import * as usersService from './admin.users.service.js';
import {
  adminCatalogIdParamSchema,
  adminContentIdParamSchema,
  adminReportIdParamSchema,
  adminUserIdParamSchema,
  createAdminUserSchema,
  generateReportSchema,
  listAdminContentsQuerySchema,
  listAdminReportsQuerySchema,
  listAdminUsersQuerySchema,
  localityNameSchema,
  positionTitleSchema,
  updateAdminUserSchema,
  updateCommentContentSchema,
  updateMatchContentSchema,
  updateNotificationsConfigSchema,
  updateRatingsConfigSchema,
} from './admin.schemas.js';

function currentAdminId(req: Request): number {
  const user = req.sessionUser;
  if (!user) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
  }
  return user.id;
}

export const listAdminUsersHandler: RequestHandler = async (req, res) => {
  const query = listAdminUsersQuerySchema.parse(req.query);
  const result = await usersService.listAdminUsers({
    search: query.search ?? null,
    state: query.state ?? null,
    role: query.role ?? null,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.status(200).json(result);
};

export const getAdminUserHandler: RequestHandler = async (req, res) => {
  const { id } = adminUserIdParamSchema.parse(req.params);
  const user = await usersService.getAdminUser(id);
  res.status(200).json({ user });
};

export const createAdminUserHandler: RequestHandler = async (req, res) => {
  const input = createAdminUserSchema.parse(req.body);
  const user = await usersService.createAdminUser(input);
  res.status(201).json({ user });
};

export const updateAdminUserHandler: RequestHandler = async (req, res) => {
  const { id } = adminUserIdParamSchema.parse(req.params);
  const input = updateAdminUserSchema.parse(req.body);
  const user = await usersService.updateAdminUser(
    id,
    input,
    currentAdminId(req),
  );
  res.status(200).json({ user });
};

export const deleteAdminUserHandler: RequestHandler = async (req, res) => {
  const { id } = adminUserIdParamSchema.parse(req.params);
  const result = await usersService.deleteAdminUser(id, currentAdminId(req));
  res.status(200).json(result);
};

export const listContentsHandler: RequestHandler = async (req, res) => {
  const query = listAdminContentsQuerySchema.parse(req.query);
  const result = await contentsService.listContents({
    type: query.type === 'all' ? null : query.type,
    state: query.state === 'all' ? null : query.state,
    search: query.search ?? null,
    authorId: query.authorId ?? null,
    from: query.from ?? null,
    to: query.to ?? null,
    page: query.page,
    pageSize: query.pageSize,
  });

  res.status(200).json(result);
};

export const updateMatchContentHandler: RequestHandler = async (req, res) => {
  const { id } = adminContentIdParamSchema.parse(req.params);
  const input = updateMatchContentSchema.parse(req.body);
  const content = await contentsService.updateMatchContent(
    id,
    input,
    currentAdminId(req),
  );
  res.status(200).json({ content });
};

export const updateCommentContentHandler: RequestHandler = async (req, res) => {
  const { id } = adminContentIdParamSchema.parse(req.params);
  const input = updateCommentContentSchema.parse(req.body);
  const content = await contentsService.updateCommentContent(
    id,
    input,
    currentAdminId(req),
  );
  res.status(200).json({ content });
};

export const listReportsHandler: RequestHandler = async (req, res) => {
  const query = listAdminReportsQuerySchema.parse(req.query);
  const result = await reportsService.listReports({
    type: query.type ?? null,
    page: query.page,
    pageSize: query.pageSize,
  });
  res.status(200).json(result);
};

export const generateReportHandler: RequestHandler = async (req, res) => {
  const input = generateReportSchema.parse(req.body);
  const report = await reportsService.generateReport(
    input,
    currentAdminId(req),
  );
  res.status(201).json({ report });
};

export const exportReportHandler: RequestHandler = async (req, res) => {
  const { id } = adminReportIdParamSchema.parse(req.params);
  const result = await reportsService.exportReport(id);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${result.filename}"`,
  );
  res.status(200).send(result.csv);
};

export const getConfigHandler: RequestHandler = async (_req, res) => {
  const config = await configService.getConfig();
  res.status(200).json({ config });
};

export const updateRatingsConfigHandler: RequestHandler = async (req, res) => {
  const input = updateRatingsConfigSchema.parse(req.body);
  const ratings = await configService.updateRatingsConfig(input);
  res.status(200).json({ ratings });
};

export const updateNotificationsConfigHandler: RequestHandler = async (
  req,
  res,
) => {
  const input = updateNotificationsConfigSchema.parse(req.body);
  const notifications = await configService.updateNotificationsConfig(
    input.enabled,
  );
  res.status(200).json({ notifications });
};

export const createPositionHandler: RequestHandler = async (req, res) => {
  const input = positionTitleSchema.parse(req.body);
  const position = await configService.createPosition(input.title);
  res.status(201).json({ position });
};

export const updatePositionHandler: RequestHandler = async (req, res) => {
  const { id } = adminCatalogIdParamSchema.parse(req.params);
  const input = positionTitleSchema.parse(req.body);
  const position = await configService.updatePosition(id, input.title);
  res.status(200).json({ position });
};

export const deletePositionHandler: RequestHandler = async (req, res) => {
  const { id } = adminCatalogIdParamSchema.parse(req.params);
  await configService.deletePosition(id);
  res.status(200).json({ deleted: true });
};

export const createLocalityHandler: RequestHandler = async (req, res) => {
  const input = localityNameSchema.parse(req.body);
  const locality = await configService.createLocality(input.name);
  res.status(201).json({ locality });
};

export const updateLocalityHandler: RequestHandler = async (req, res) => {
  const { id } = adminCatalogIdParamSchema.parse(req.params);
  const input = localityNameSchema.parse(req.body);
  const locality = await configService.updateLocality(id, input.name);
  res.status(200).json({ locality });
};

export const deleteLocalityHandler: RequestHandler = async (req, res) => {
  const { id } = adminCatalogIdParamSchema.parse(req.params);
  await configService.deleteLocality(id);
  res.status(200).json({ deleted: true });
};
