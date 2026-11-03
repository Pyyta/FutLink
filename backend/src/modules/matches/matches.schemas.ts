import { z } from 'zod';

const matchPositionSchema = z.object({
  positionId: z.number().int().positive('La posición no es válida'),
  slots: z
    .number()
    .int()
    .min(1, 'Cada posición debe tener al menos una plaza')
    .max(30, 'Una posición no puede tener más de 30 plazas'),
});

export const createMatchSchema = z
  .object({
    matchDate: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
    locality: z
      .string()
      .trim()
      .min(2, 'La localidad es obligatoria')
      .max(120, 'La localidad no puede superar 120 caracteres'),
    modality: z
      .string()
      .trim()
      .max(20, 'La modalidad no puede superar 20 caracteres')
      .nullable()
      .default(null)
      .transform((value) => (value === null || value.length === 0 ? null : value)),
    description: z
      .string()
      .trim()
      .max(500, 'La descripción no puede superar 500 caracteres')
      .nullable()
      .default(null)
      .transform((value) => (value === null || value.length === 0 ? null : value)),
    positions: z
      .array(matchPositionSchema)
      .min(1, 'Indica al menos una posición requerida')
      .max(30)
      .refine(
        (items) => new Set(items.map((item) => item.positionId)).size === items.length,
        'No repitas posiciones en el partido',
      )
      .refine(
        (items) => items.reduce((total, item) => total + item.slots, 0) <= 30,
        'El partido no puede tener más de 30 plazas',
      ),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
  })
  .refine(
    (data) => (data.latitude === null) === (data.longitude === null),
    'Indica latitud y longitud juntas, o ninguna de las dos',
  );

export const searchMatchesQuerySchema = z
  .object({
    locality: z.string().trim().min(2).max(120).optional(),
    date: z.iso.date().optional(),
    positionId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(10),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  })
  .refine(
    (query) => (query.latitude === undefined) === (query.longitude === undefined),
    'Indica latitud y longitud juntas, o ninguna de las dos',
  );

export const matchIdParamSchema = z.object({
  id: z.coerce.number().int().positive('El identificador del partido no es válido'),
});
