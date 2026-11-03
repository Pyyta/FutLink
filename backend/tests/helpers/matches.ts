import type { Express } from 'express';
import request from 'supertest';
import { bearer } from './auth.js';

export const DEFAULT_MATCH_DATE = '2032-01-15T19:00:00-05:00';

export interface PublishMatchOverrides {
  matchDate?: string;
  locality?: string;
  modality?: string | null;
  description?: string | null;
  positions?: { positionId: number; slots: number }[];
  latitude?: number;
  longitude?: number;
}

export function publishMatch(
  app: Express,
  accessToken: string,
  overrides: PublishMatchOverrides = {},
): request.Test {
  const body: Record<string, unknown> = {
    matchDate: overrides.matchDate ?? DEFAULT_MATCH_DATE,
    locality: overrides.locality ?? 'Suba',
    modality: overrides.modality === undefined ? 'F7' : overrides.modality,
    description:
      overrides.description === undefined ? 'Partido de prueba' : overrides.description,
    positions:
      overrides.positions === undefined
        ? [
            { positionId: 1, slots: 2 },
            { positionId: 2, slots: 1 },
          ]
        : overrides.positions,
  };

  if (overrides.latitude !== undefined && overrides.longitude !== undefined) {
    body.latitude = overrides.latitude;
    body.longitude = overrides.longitude;
  }

  return request(app).post('/api/matches').set(bearer(accessToken)).send(body);
}
