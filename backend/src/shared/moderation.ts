/**
 * Estado de moderación independiente del ciclo de vida del contenido.
 * `visible` aparece en las consultas públicas; `hidden` y `deleted` quedan
 * solo para administración y para el autor (cuando aplica).
 */
export type ModerationState = 'visible' | 'hidden' | 'deleted';

export const MODERATION_STATES: readonly ModerationState[] = [
  'visible',
  'hidden',
  'deleted',
];
