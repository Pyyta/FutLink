import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

interface RateLimiterOptions {
  windowMinutes: number;
  max: number;
  skipInTests?: boolean;
}

export function createJsonRateLimiter(options: RateLimiterOptions): RequestHandler {
  const skipInTests = options.skipInTests ?? true;

  return rateLimit({
    windowMs: options.windowMinutes * 60_000,
    limit: options.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: () => skipInTests && env.NODE_ENV === 'test',
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo',
        },
      });
    },
  });
}

export const authRateLimiter = createJsonRateLimiter({
  windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
  max: env.AUTH_RATE_LIMIT_MAX,
});

export const passwordResetRateLimiter = createJsonRateLimiter({
  windowMinutes: env.AUTH_RATE_LIMIT_WINDOW_MINUTES,
  max: env.PASSWORD_RESET_RATE_LIMIT_MAX,
});
