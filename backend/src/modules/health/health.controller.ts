import type { RequestHandler } from 'express';
import { getHealthStatus } from './health.service.js';

export const getHealth: RequestHandler = async (_req, res) => {
  const health = await getHealthStatus();
  res.set('Cache-Control', 'no-store').status(200).json(health);
};
