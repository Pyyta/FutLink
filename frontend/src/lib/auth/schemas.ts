import { z } from 'zod';

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const emailField = z
  .string()
  .trim()
  .min(1, 'validation.emailRequired')
  .max(128, 'validation.emailMax')
  .pipe(z.email('validation.emailInvalid'));

const loginPasswordField = z
  .string()
  .min(1, 'validation.passwordRequired')
  .max(200, 'validation.passwordMax');

const newPasswordField = z
  .string()
  .min(1, 'validation.passwordRequired')
  .min(8, 'validation.passwordMin')
  .max(72, 'validation.passwordMax')
  .refine((value) => utf8Length(value) <= 72, 'validation.passwordBytes');

export const loginSchema = z.object({
  email: emailField,
  password: loginPasswordField,
});

export const registerSchema = z
  .object({
    email: emailField,
    password: newPasswordField,
    confirmPassword: z.string().min(1, 'validation.confirmPasswordRequired'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordsMismatch',
  });

export const recoverEmailSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, 'validation.codeRequired')
      .regex(/^\d{6}$/, 'validation.codeInvalid'),
    newPassword: newPasswordField,
    confirmPassword: z.string().min(1, 'validation.confirmPasswordRequired'),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'validation.passwordsMismatch',
  });

export const profileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'validation.nameMin')
    .max(120, 'validation.nameMax'),
  phone: z
    .string()
    .trim()
    .min(7, 'validation.phoneMin')
    .max(24, 'validation.phoneMax'),
  locality: z
    .string()
    .trim()
    .min(2, 'validation.localityRequired')
    .max(120, 'validation.localityMax'),
  positionIds: z
    .array(z.number().int().positive())
    .min(1, 'validation.positionsRequired')
    .max(10, 'validation.positionsMax')
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'validation.positionsUnique',
    ),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type RecoverEmailFormValues = z.infer<typeof recoverEmailSchema>;
export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
