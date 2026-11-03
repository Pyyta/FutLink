import { Router } from 'express';
import { getCatalogHandler } from './catalog.controller.js';

export const catalogRouter = Router();

/**
 * GET /api/catalog
 * Auth: pública (lo necesita el registro y el perfil)
 * 200: { positions: [{ id, title }], localities: [{ name }] }
 */
catalogRouter.get('/', getCatalogHandler);
