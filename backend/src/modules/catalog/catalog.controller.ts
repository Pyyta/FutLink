import type { RequestHandler } from 'express';
import { getCatalog } from './catalog.service.js';

export const getCatalogHandler: RequestHandler = async (_req, res) => {
  const catalog = await getCatalog();
  res.set('Cache-Control', 'public, max-age=300').status(200).json(catalog);
};
