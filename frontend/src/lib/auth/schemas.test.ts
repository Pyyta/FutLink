import { describe, expect, it } from 'vitest';
import {
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from './schemas';

describe('esquemas de autenticación', () => {
  it('rechaza correos inválidos', () => {
    const result = registerSchema.safeParse({
      email: 'sin-arroba',
      password: 'secreta123',
      confirmPassword: 'secreta123',
    });

    expect(result.success).toBe(false);
  });

  it('rechaza contraseñas de menos de 8 caracteres', () => {
    const result = registerSchema.safeParse({
      email: 'ana@example.com',
      password: 'corta',
      confirmPassword: 'corta',
    });

    expect(result.success).toBe(false);
  });

  it('rechaza contraseñas que superan 72 bytes aunque tengan menos caracteres', () => {
    const password = 'á'.repeat(37);
    const result = registerSchema.safeParse({
      email: 'ana@example.com',
      password,
      confirmPassword: password,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.message === 'validation.passwordBytes'),
      ).toBe(true);
    }
  });

  it('exige exactamente seis dígitos en el código de recuperación', () => {
    const result = resetPasswordSchema.safeParse({
      code: '12345',
      newPassword: 'nueva1234',
      confirmPassword: 'nueva1234',
    });

    expect(result.success).toBe(false);
  });

  it('exige al menos una posición en el perfil', () => {
    const result = profileSchema.safeParse({
      name: 'Ana Pérez',
      phone: '300 555 0011',
      locality: 'Chapinero',
      positionIds: [],
    });

    expect(result.success).toBe(false);
  });
});
