import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Carga backend/.env tanto en desarrollo (src/config) como en producción (dist/config).
dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  // 0.0.0.0 permite que el celular alcance la API desde la misma red WiFi.
  HOST: z.string().min(1).default('0.0.0.0'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().max(65535).default(5432),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  BODY_LIMIT: z
    .string()
    .regex(/^\d+(?:kb|mb)$/i, 'Usa un formato como 256kb o 1mb')
    .default('1mb'),
  // Sirve la PWA compilada (frontend/dist) desde la misma API y puerto.
  SERVE_WEB: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),

  // Autenticación (Fase 3)
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  BCRYPT_COST: z.coerce.number().int().min(10).max(15).default(12),
  RESET_CODE_PEPPER: z
    .string()
    .min(32, 'RESET_CODE_PEPPER debe tener al menos 32 caracteres'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  PASSWORD_RESET_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1_440).default(15),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(3).max(1_000).default(20),
  PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().int().min(2).max(100).default(5),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().max(65535).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.email().optional(),

  // Provisión inicial del administrador (RF-11..RF-14); opcionales.
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).max(72).optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  console.error(
    [
      '[FutLink] Configuración inválida. Revisa backend/.env (usa backend/.env.example como base):',
      details,
    ].join('\n'),
  );
  process.exit(1);
}

export const env = parsed.data;

if (
  env.NODE_ENV === 'production' &&
  (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM ||
    (!!env.SMTP_USER !== !!env.SMTP_PASSWORD))
) {
  console.error(
    '[FutLink] SMTP_HOST, SMTP_PORT y SMTP_FROM son obligatorios en producción; SMTP_USER y SMTP_PASSWORD deben configurarse juntos.',
  );
  process.exit(1);
}
