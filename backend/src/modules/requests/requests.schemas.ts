import { z } from 'zod';

export const createRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('match'),
    vacancyId: z
      .number()
      .int()
      .positive('La vacante indicada no es válida'),
  }),
  z.object({
    type: z.literal('player'),
    targetUserId: z
      .number()
      .int()
      .positive('El jugador indicado no es válido'),
  }),
]);

export const listRequestsQuerySchema = z.object({
  box: z.enum(['sent', 'received']).default('received'),
  type: z.enum(['match', 'player']).optional(),
  state: z.enum(['pending', 'accepted', 'rejected', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const requestIdParamSchema = z.object({
  id: z.coerce.number().int().positive('El identificador de la solicitud no es válido'),
});
