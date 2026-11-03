import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/authenticate.js';
import {
  createAdminUserHandler,
  createLocalityHandler,
  createPositionHandler,
  deleteAdminUserHandler,
  deleteLocalityHandler,
  deletePositionHandler,
  exportReportHandler,
  generateReportHandler,
  getAdminUserHandler,
  getConfigHandler,
  listAdminUsersHandler,
  listContentsHandler,
  listReportsHandler,
  updateAdminUserHandler,
  updateCommentContentHandler,
  updateLocalityHandler,
  updateMatchContentHandler,
  updateNotificationsConfigHandler,
  updatePositionHandler,
  updateRatingsConfigHandler,
} from './admin.controller.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('admin'));

adminRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * RF-11 · Gestión de usuarios.
 * GET    /api/admin/users?search=&state=&role=&page=&pageSize=
 * GET    /api/admin/users/:id
 * POST   /api/admin/users
 * PATCH  /api/admin/users/:id  (incluye suspender y reactivar con state)
 * DELETE /api/admin/users/:id  (borrado lógico + cancelación y aviso)
 */
adminRouter.get('/users', listAdminUsersHandler);
adminRouter.get('/users/:id', getAdminUserHandler);
adminRouter.post('/users', createAdminUserHandler);
adminRouter.patch('/users/:id', updateAdminUserHandler);
adminRouter.delete('/users/:id', deleteAdminUserHandler);

/**
 * RF-12 · Contenidos publicados.
 * GET   /api/admin/contents?type=all|match|comment&state=&search=&authorId=
 *       &from=&to=&page=&pageSize=
 * PATCH /api/admin/contents/matches/:id   (editar u ocultar/eliminar)
 * PATCH /api/admin/contents/comments/:id  (editar u ocultar/eliminar)
 * Las acciones de ocultar/eliminar notifican al autor.
 */
adminRouter.get('/contents', listContentsHandler);
adminRouter.patch('/contents/matches/:id', updateMatchContentHandler);
adminRouter.patch('/contents/comments/:id', updateCommentContentHandler);

/**
 * RF-13 · Reportes generales con histórico y exportación CSV.
 * GET  /api/admin/reports?type=&page=&pageSize=
 * POST /api/admin/reports   { type, from, to }
 * GET  /api/admin/reports/:id/export
 * El periodo es [from, to): incluye desde `from` y excluye `to`.
 */
adminRouter.get('/reports', listReportsHandler);
adminRouter.post('/reports', generateReportHandler);
adminRouter.get('/reports/:id/export', exportReportHandler);

/**
 * RF-14 · Configuración global.
 * GET   /api/admin/config
 * PUT   /api/admin/config/ratings        { minScore?, maxScore?, requireAcceptedRequest? }
 * PUT   /api/admin/config/notifications  { enabled }
 * POST  /api/admin/config/positions      { title }
 * PATCH /api/admin/config/positions/:id  { title }
 * DELETE/api/admin/config/positions/:id
 * POST  /api/admin/config/localities     { name }
 * PATCH /api/admin/config/localities/:id { name }
 * DELETE/api/admin/config/localities/:id
 */
adminRouter.get('/config', getConfigHandler);
adminRouter.put('/config/ratings', updateRatingsConfigHandler);
adminRouter.put('/config/notifications', updateNotificationsConfigHandler);
adminRouter.post('/config/positions', createPositionHandler);
adminRouter.patch('/config/positions/:id', updatePositionHandler);
adminRouter.delete('/config/positions/:id', deletePositionHandler);
adminRouter.post('/config/localities', createLocalityHandler);
adminRouter.patch('/config/localities/:id', updateLocalityHandler);
adminRouter.delete('/config/localities/:id', deleteLocalityHandler);
