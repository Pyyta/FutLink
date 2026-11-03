import type { TFunction } from 'i18next';
import { ApiError } from './client';

export function getErrorMessage(error: unknown, t: TFunction): string {
  if (!(error instanceof ApiError)) {
    return t('errors.generic');
  }

  const key = `errors.codes.${error.code}`;
  const translated = t(key, { defaultValue: '' });

  if (translated) return translated;

  if (error.code === 'NETWORK_ERROR') {
    return t('errors.network');
  }

  return error.message || t('errors.generic');
}
