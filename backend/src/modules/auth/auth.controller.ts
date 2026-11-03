import type { RequestHandler } from 'express';
import * as authService from './auth.service.js';
import {
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
} from './auth.schemas.js';

export const registerHandler: RequestHandler = async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input, req.get('user-agent') ?? null);
  res.status(201).json(result);
};

export const loginHandler: RequestHandler = async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input, req.get('user-agent') ?? null);
  res.status(200).json(result);
};

export const refreshHandler: RequestHandler = async (req, res) => {
  const input = refreshSchema.parse(req.body);
  const result = await authService.refresh(
    input.refreshToken,
    req.get('user-agent') ?? null,
  );
  res.status(200).json(result);
};

export const logoutHandler: RequestHandler = async (req, res) => {
  const input = refreshSchema.parse(req.body);
  await authService.logout(input.refreshToken);
  res.status(204).end();
};

export const forgotPasswordHandler: RequestHandler = async (req, res) => {
  const input = forgotPasswordSchema.parse(req.body);
  await authService.forgotPassword(input.email);
  res.status(200).json({
    message:
      'Si el correo está registrado, enviamos un código para restablecer la contraseña',
  });
};

export const resetPasswordHandler: RequestHandler = async (req, res) => {
  const input = resetPasswordSchema.parse(req.body);
  await authService.resetPassword(input);
  res.status(200).json({
    message: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña',
  });
};
