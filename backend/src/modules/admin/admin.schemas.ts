import { z } from 'zod';
import { emailSchema, passwordSchema } from '../auth/auth.schemas.js';

const userStateSchema = z.enum(['active', 'suspended', 'deleted']);
const userRoleSchema = z.enum(['user', 'admin']);
const moderationStateSchema = z.enum(['visible', 'hidden', 'deleted']);

export const adminUserIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive('El identificador del usuario no es válido'),
});

export const adminContentIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive('El identificador del contenido no es válido'),
});

export const adminReportIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive('El identificador del reporte no es válido'),
});

export const adminCatalogIdParamSchema = z.object({
  id: z.coerce
    .number()
    .int()
    .positive('El identificador del catálogo no es válido'),
});

export const listAdminUsersQuerySchema = z.object({
  search: z
    .string()
    .trim()
    .min(1, 'La búsqueda no puede estar vacía')
    .max(120, 'La búsqueda no puede superar 120 caracteres')
    .optional(),
  state: userStateSchema.optional(),
  role: userRoleSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const adminProfileFields = {
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  phone: z
    .string()
    .trim()
    .min(7, 'El teléfono debe tener al menos 7 caracteres')
    .max(24, 'El teléfono no puede superar 24 caracteres'),
  locality: z
    .string()
    .trim()
    .min(2, 'La localidad es demasiado corta')
    .max(120, 'La localidad no puede superar 120 caracteres'),
  positionIds: z
    .array(z.number().int().positive())
    .min(1, 'Selecciona al menos una posición')
    .max(10)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'No repitas posiciones de juego',
    ),
};

export const createAdminUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  ...adminProfileFields,
  role: userRoleSchema.default('user'),
});

export const updateAdminUserSchema = z
  .object({
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    ...adminProfileFields,
    role: userRoleSchema.optional(),
    state: z.enum(['active', 'suspended']).optional(),
  })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    'Indica al menos un campo para actualizar',
  );

export const listAdminContentsQuerySchema = z
  .object({
    type: z.enum(['all', 'match', 'comment']).default('all'),
    state: z.enum(['all', 'visible', 'hidden', 'deleted']).default('all'),
    search: z
      .string()
      .trim()
      .min(1, 'La búsqueda no puede estar vacía')
      .max(120, 'La búsqueda no puede superar 120 caracteres')
      .optional(),
    authorId: z.coerce.number().int().positive().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine(
    (query) =>
      query.from === undefined ||
      query.to === undefined ||
      query.from.getTime() < query.to.getTime(),
    'La fecha inicial debe ser anterior a la fecha final',
  );

export const updateMatchContentSchema = z
  .object({
    moderationState: moderationStateSchema.optional(),
    matchDate: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value))
      .optional(),
    locality: z
      .string()
      .trim()
      .min(2, 'La localidad es demasiado corta')
      .max(120, 'La localidad no puede superar 120 caracteres')
      .optional(),
    modality: z
      .string()
      .trim()
      .max(20, 'La modalidad no puede superar 20 caracteres')
      .nullable()
      .optional(),
    description: z
      .string()
      .trim()
      .max(500, 'La descripción no puede superar 500 caracteres')
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'Indica al menos un cambio para el partido',
  );

export const updateCommentContentSchema = z
  .object({
    moderationState: moderationStateSchema.optional(),
    score: z
      .number()
      .int('La calificación debe ser un número entero')
      .min(1)
      .max(10)
      .optional(),
    comment: z
      .string()
      .trim()
      .max(240, 'El comentario no puede superar 240 caracteres')
      .nullable()
      .optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'Indica al menos un cambio para la calificación',
  );

export const listAdminReportsQuerySchema = z.object({
  type: z.enum(['users', 'matches', 'requests']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const MAX_REPORT_RANGE_MS = 366 * 86_400_000;

export const generateReportSchema = z
  .object({
    type: z.enum(['users', 'matches', 'requests']),
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine(
    (data) => data.from.getTime() < data.to.getTime(),
    'La fecha inicial debe ser anterior a la fecha final',
  )
  .refine(
    (data) => data.to.getTime() - data.from.getTime() <= MAX_REPORT_RANGE_MS,
    'El periodo no puede superar 366 días',
  );

export const updateRatingsConfigSchema = z
  .object({
    minScore: z.number().int().min(1).max(10).optional(),
    maxScore: z.number().int().min(1).max(10).optional(),
    requireAcceptedRequest: z.boolean().optional(),
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'Indica al menos un parámetro de calificación',
  );

export const updateNotificationsConfigSchema = z.object({
  enabled: z.boolean(),
});

export const positionTitleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, 'El nombre de la posición es demasiado corto')
    .max(64, 'El nombre de la posición no puede superar 64 caracteres')
    .transform((value) => value.toLowerCase()),
});

export const localityNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre de la localidad es demasiado corto')
    .max(120, 'El nombre de la localidad no puede superar 120 caracteres'),
});
