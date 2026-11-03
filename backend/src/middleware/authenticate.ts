import type { RequestHandler } from 'express';
import { AppError } from '../shared/errors.js';
import { verifyAccessToken } from '../modules/auth/auth.tokens.js';
import { findSessionUserById } from '../modules/users/users.repository.js';
import type { UserRole } from '../modules/auth/auth.types.js';

/**
 * Valida el access token y vuelve a consultar el estado de la cuenta en cada
 * petición: una suspensión o borrado surte efecto de inmediato.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  try {
    const header = req.get('authorization');
    if (!header) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
    }

    const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
    const token = match?.[1];
    if (!token) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión');
    }

    const { userId } = verifyAccessToken(token);
    const user = await findSessionUserById(userId);

    if (!user) {
      throw new AppError(401, 'INVALID_TOKEN', 'El token de acceso no es válido');
    }

    if (user.state !== 'active') {
      throw new AppError(
        401,
        'ACCOUNT_INACTIVE',
        'La cuenta no está activa. Contacta al administrador',
      );
    }

    req.sessionUser = user;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Regla RF-02: sin nombre, teléfono, localidad y al menos una posición no se
 * accede al resto de funcionalidades. Se monta en los routers de producto.
 */
export const requireCompleteProfile: RequestHandler = (req, _res, next) => {
  const user = req.sessionUser;
  if (!user) {
    next(new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión'));
    return;
  }

  if (user.profileCompletedAt === null) {
    next(
      new AppError(
        403,
        'PROFILE_INCOMPLETE',
        'Completa tu perfil (nombre, teléfono, localidad y posiciones) para continuar',
        { required: ['name', 'phone', 'locality', 'positions'] },
      ),
    );
    return;
  }

  next();
};

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.sessionUser;
    if (!user) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión'));
      return;
    }

    if (!roles.includes(user.role)) {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          'No tienes permisos para realizar esta acción',
        ),
      );
      return;
    }

    next();
  };
}
