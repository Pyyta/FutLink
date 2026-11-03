import { Router } from 'express';
import {
  authRateLimiter,
  passwordResetRateLimiter,
} from '../../middleware/rateLimit.js';
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from './auth.controller.js';

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

/**
 * POST /api/auth/register
 * Body: { email, password }
 * 201: sesión iniciada + perfil incompleto (RF-02 pendiente)
 * 400: VALIDATION_ERROR | 409: EMAIL_IN_USE | 429: RATE_LIMITED
 */
authRouter.post('/register', authRateLimiter, registerHandler);

/**
 * POST /api/auth/login
 * Body: { email, password }
 * 200: tokens + perfil
 * 401: INVALID_CREDENTIALS | 403: ACCOUNT_SUSPENDED | 429: RATE_LIMITED
 */
authRouter.post('/login', authRateLimiter, loginHandler);

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 * 200: tokens rotados | 401: INVALID_REFRESH_TOKEN | REFRESH_REUSED | ACCOUNT_INACTIVE
 */
authRouter.post('/refresh', authRateLimiter, refreshHandler);

/**
 * POST /api/auth/logout
 * Body: { refreshToken }
 * 204: token revocado (idempotente)
 */
authRouter.post('/logout', logoutHandler);

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * 200: mensaje genérico, exista o no la cuenta
 */
authRouter.post('/forgot-password', passwordResetRateLimiter, forgotPasswordHandler);

/**
 * POST /api/auth/reset-password
 * Body: { email, code, newPassword }
 * 200: contraseña actualizada | 400: INVALID_RESET_CODE | 429: RATE_LIMITED
 */
authRouter.post('/reset-password', passwordResetRateLimiter, resetPasswordHandler);
