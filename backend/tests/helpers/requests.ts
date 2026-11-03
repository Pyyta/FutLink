import type { Express } from 'express';
import request from 'supertest';
import { bearer } from './auth.js';
import { publishMatch } from './matches.js';

export interface TestMatch {
  matchId: number;
  vacancies: { id: number; position: string }[];
}

export async function createMatchWithVacancies(
  app: Express,
  accessToken: string,
  slots = 1,
  matchDate = '2034-03-20T19:00:00-05:00',
): Promise<TestMatch> {
  const published = await publishMatch(app, accessToken, {
    matchDate,
    positions: [{ positionId: 1, slots }],
  });

  if (published.status !== 201) {
    throw new Error(
      `No se pudo publicar el partido: ${JSON.stringify(published.body)}`,
    );
  }

  return {
    matchId: published.body.match.id as number,
    vacancies: (
      published.body.match.vacancies as { id: number; position: string }[]
    ).map((vacancy) => ({ id: vacancy.id, position: vacancy.position })),
  };
}

export function sendMatchRequest(
  app: Express,
  accessToken: string,
  vacancyId: number,
): request.Test {
  return request(app)
    .post('/api/requests')
    .set(bearer(accessToken))
    .send({ type: 'match', vacancyId });
}

export function sendPlayerRequest(
  app: Express,
  accessToken: string,
  targetUserId: number,
): request.Test {
  return request(app)
    .post('/api/requests')
    .set(bearer(accessToken))
    .send({ type: 'player', targetUserId });
}

export function listRequests(
  app: Express,
  accessToken: string,
  query = '',
): request.Test {
  return request(app)
    .get(`/api/requests${query}`)
    .set(bearer(accessToken));
}

export type RequestAction = 'accept' | 'reject' | 'cancel';

export function actOnRequest(
  app: Express,
  accessToken: string,
  requestId: number | string,
  action: RequestAction,
): request.Test {
  return request(app)
    .patch(`/api/requests/${requestId}/${action}`)
    .set(bearer(accessToken));
}
