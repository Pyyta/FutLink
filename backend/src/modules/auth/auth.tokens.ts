import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';
import type { UserRole } from './auth.types.js';

const ISSUER = 'futlink';
const AUDIENCE = 'futlink-app';

export function signAccessToken(user: { id: number; role: UserRole }): string {
  return jwt.sign({ role: user.role, type: 'access' }, env.JWT_ACCESS_SECRET, {
    subject: String(user.id),
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export function verifyAccessToken(token: string): { userId: number; role: UserRole } {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (typeof payload === 'string') {
      throw new Error('Payload inesperado');
    }

    const { sub, role, type } = payload as JwtPayload & {
      role?: unknown;
      type?: unknown;
    };
    const userId = Number(sub);

    if (
      !Number.isInteger(userId) ||
      userId <= 0 ||
      type !== 'access' ||
      (role !== 'user' && role !== 'admin')
    ) {
      throw new Error('Payload inválido');
    }

    return { userId, role };
  } catch {
    throw new AppError(
      401,
      'INVALID_TOKEN',
      'El token de acceso no es válido o expiró',
    );
  }
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function refreshTokenExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
}

export function generateResetCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashResetCode(userId: number, code: string): string {
  return createHmac('sha256', env.RESET_CODE_PEPPER)
    .update(`${userId}:${code}`)
    .digest('hex');
}

export function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
