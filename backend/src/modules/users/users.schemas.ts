import { z } from 'zod';

export const searchPlayersQuerySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'El nombre a buscar no puede estar vacío')
    .max(120, 'El nombre a buscar no puede superar 120 caracteres')
    .optional(),
  locality: z
    .string()
    .trim()
    .min(2, 'La localidad es demasiado corta')
    .max(120, 'La localidad no puede superar 120 caracteres')
    .optional(),
  positionId: z.coerce
    .number()
    .int()
    .positive('La posición no es válida')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const rateUserSchema = z.object({
  score: z
    .number()
    .int('La calificación debe ser un número entero')
    .min(1, 'La calificación mínima es 1')
    .max(10, 'La calificación máxima es 10'),
  comment: z
    .string()
    .trim()
    .max(240, 'El comentario no puede superar 240 caracteres')
    .optional(),
});

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(120, 'El nombre no puede superar 120 caracteres'),
  phone: z
    .string()
    .trim()
    .min(7, 'El teléfono es obligatorio')
    .max(24, 'El teléfono no puede superar 24 caracteres'),
  locality: z
    .string()
    .trim()
    .min(2, 'La localidad es obligatoria')
    .max(120, 'La localidad no puede superar 120 caracteres'),
  positionIds: z
    .array(z.number().int().positive())
    .min(1, 'Selecciona al menos una posición')
    .max(10)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'No repitas posiciones de juego',
    ),
});
