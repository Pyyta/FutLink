import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createJsonRateLimiter } from '../src/middleware/rateLimit.js';

describe('Rate limiting de endpoints sensibles', () => {
  it('responde 429 con el formato de error uniforme', async () => {
    const app = express();
    app.post(
      '/limitado',
      createJsonRateLimiter({ windowMinutes: 1, max: 2, skipInTests: false }),
      (_req, res) => {
        res.status(200).json({ ok: true });
      },
    );
    app.use(errorHandler);

    expect((await request(app).post('/limitado')).status).toBe(200);
    expect((await request(app).post('/limitado')).status).toBe(200);

    const blocked = await request(app).post('/limitado');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
