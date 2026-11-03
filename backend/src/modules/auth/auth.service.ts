import bcrypt from 'bcrypt';
import { withTransaction } from '../../config/db.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../shared/errors.js';
import { isUniqueViolation } from '../../shared/postgres.js';
import {
  findActiveResetCodeForUpdate,
  findRefreshTokenByHash,
  findRefreshTokenForUpdate,
  incrementResetAttempts,
  insertRefreshToken,
  insertResetCode,
  invalidateActiveResetCodes,
  markResetCodeUsed,
  revokeAllRefreshTokens,
  revokeRefreshToken,
  updateUserPassword,
} from './auth.repository.js';
import { getMailService } from './auth.mail.js';
import {
  generateRefreshToken,
  generateResetCode,
  hashResetCode,
  hashToken,
  refreshTokenExpiry,
  safeEqualHex,
  signAccessToken,
} from './auth.tokens.js';
import type {
  AuthResult,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UserRole,
} from './auth.types.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
} from '../users/users.repository.js';
import { loadProfile } from '../users/users.service.js';

const DUMMY_PASSWORD_HASH =
  '$2b$12$uE5DxNvg1XkYspVIRmybZ.J4y7qcbWXkIcg.48Ii28a2Q8XpzFYhm';

function invalidCredentials(): AppError {
  return new AppError(
    401,
    'INVALID_CREDENTIALS',
    'Correo o contraseña incorrectos',
  );
}

function invalidResetCode(): AppError {
  return new AppError(
    400,
    'INVALID_RESET_CODE',
    'El código no es válido o expiró. Solicita uno nuevo',
  );
}

function userAgentValue(userAgent: string | null): string | null {
  return userAgent ? userAgent.slice(0, 255) : null;
}

async function issueSession(
  user: { id: number; role: UserRole },
  userAgent: string | null,
): Promise<AuthResult> {
  const refreshToken = generateRefreshToken();
  await insertRefreshToken(
    user.id,
    hashToken(refreshToken),
    refreshTokenExpiry(),
    userAgentValue(userAgent),
  );

  return {
    tokenType: 'Bearer',
    accessToken: signAccessToken(user),
    refreshToken,
    expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    user: await loadProfile(user.id),
  };
}

export async function register(
  input: RegisterInput,
  userAgent: string | null,
): Promise<AuthResult> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AppError(
      409,
      'EMAIL_IN_USE',
      'Ya existe una cuenta con ese correo electrónico',
    );
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);

  try {
    const user = await createUser(input.email, passwordHash);
    return await issueSession(user, userAgent);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'EMAIL_IN_USE',
        'Ya existe una cuenta con ese correo electrónico',
      );
    }
    throw error;
  }
}

export async function login(
  input: LoginInput,
  userAgent: string | null,
): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);

  if (!user) {
    // Iguala el tiempo de respuesta para no revelar si el correo existe.
    await bcrypt.compare(input.password, DUMMY_PASSWORD_HASH);
    throw invalidCredentials();
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password);
  if (!passwordMatches) {
    throw invalidCredentials();
  }

  if (user.state === 'suspended') {
    throw new AppError(
      403,
      'ACCOUNT_SUSPENDED',
      'La cuenta está suspendida. Contacta al administrador',
    );
  }

  if (user.state !== 'active') {
    throw invalidCredentials();
  }

  return issueSession(user, userAgent);
}

type RotationResult =
  | { status: 'ok'; userId: number; role: UserRole; refreshToken: string }
  | { status: 'invalid' | 'expired' | 'reused' | 'inactive' };

export async function refresh(
  token: string,
  userAgent: string | null,
): Promise<AuthResult> {
  const tokenHash = hashToken(token);

  const rotation: RotationResult = await withTransaction(async (client) => {
    const stored = await findRefreshTokenForUpdate(tokenHash, client);

    if (!stored) {
      return { status: 'invalid' };
    }

    // Reutilizar un token ya rotado se interpreta como robo: se cierran todas
    // las sesiones del usuario.
    if (stored.revoked_at !== null) {
      await revokeAllRefreshTokens(stored.user_id, client);
      return { status: 'reused' };
    }

    if (stored.expires_at.getTime() <= Date.now()) {
      await revokeRefreshToken(stored.id, null, client);
      return { status: 'expired' };
    }

    const user = await findUserById(stored.user_id, client);
    if (!user || user.state !== 'active') {
      await revokeRefreshToken(stored.id, null, client);
      return { status: 'inactive' };
    }

    const newToken = generateRefreshToken();
    const newId = await insertRefreshToken(
      user.id,
      hashToken(newToken),
      refreshTokenExpiry(),
      userAgentValue(userAgent),
      client,
    );
    await revokeRefreshToken(stored.id, newId, client);

    return {
      status: 'ok',
      userId: user.id,
      role: user.role,
      refreshToken: newToken,
    };
  });

  switch (rotation.status) {
    case 'ok':
      return {
        tokenType: 'Bearer',
        accessToken: signAccessToken({
          id: rotation.userId,
          role: rotation.role,
        }),
        refreshToken: rotation.refreshToken,
        expiresIn: env.JWT_ACCESS_TTL_SECONDS,
        user: await loadProfile(rotation.userId),
      };
    case 'reused':
      throw new AppError(
        401,
        'REFRESH_REUSED',
        'La sesión fue reutilizada; por seguridad se cerraron todas las sesiones',
      );
    case 'inactive':
      throw new AppError(
        401,
        'ACCOUNT_INACTIVE',
        'La cuenta no está activa. Contacta al administrador',
      );
    case 'expired':
    case 'invalid':
      throw new AppError(
        401,
        'INVALID_REFRESH_TOKEN',
        'La sesión no es válida o expiró. Inicia sesión de nuevo',
      );
  }
}

export async function logout(token: string): Promise<void> {
  const stored = await findRefreshTokenByHash(hashToken(token));
  if (stored && stored.revoked_at === null) {
    await revokeRefreshToken(stored.id, null);
  }
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await findUserByEmail(email);

  // Respuesta genérica siempre; no se revela si el correo existe (ver README
  // de la fase sobre el conflicto con la excepción 6 de RF-01).
  if (!user || user.state !== 'active') {
    return;
  }

  const code = generateResetCode();
  const expiresAt = new Date(
    Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000,
  );

  await withTransaction(async (client) => {
    await invalidateActiveResetCodes(user.id, client);
    await insertResetCode(
      user.id,
      hashResetCode(user.id, code),
      expiresAt,
      env.PASSWORD_RESET_MAX_ATTEMPTS,
      client,
    );
  });

  try {
    await getMailService().send({
      to: user.email,
      subject: 'FutLink · Código para restablecer tu contraseña',
      text: [
        `Tu código de verificación es ${code}.`,
        `Vence en ${env.PASSWORD_RESET_TTL_MINUTES} minutos y solo puede usarse una vez.`,
        '',
        'Si no solicitaste este cambio, ignora este correo.',
      ].join('\n'),
    });
  } catch (error) {
    logger.error({ err: error }, 'No se pudo enviar el correo de recuperación');
  }
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const user = await findUserByEmail(input.email);
  if (!user || user.state !== 'active') {
    throw invalidResetCode();
  }

  const newPasswordHash = await bcrypt.hash(input.newPassword, env.BCRYPT_COST);

  const result = await withTransaction(async (client) => {
    const stored = await findActiveResetCodeForUpdate(user.id, client);

    if (!stored) {
      return 'invalid' as const;
    }

    if (stored.expires_at.getTime() <= Date.now()) {
      await markResetCodeUsed(stored.id, client);
      return 'expired' as const;
    }

    const expected = hashResetCode(user.id, input.code);
    if (!safeEqualHex(expected, stored.code_hash)) {
      const attempts = await incrementResetAttempts(stored.id, client);
      if (attempts >= stored.max_attempts) {
        await markResetCodeUsed(stored.id, client);
      }
      return 'invalid' as const;
    }

    await markResetCodeUsed(stored.id, client);
    await updateUserPassword(user.id, newPasswordHash, client);
    await revokeAllRefreshTokens(user.id, client);
    return 'ok' as const;
  });

  if (result !== 'ok') {
    throw invalidResetCode();
  }
}
