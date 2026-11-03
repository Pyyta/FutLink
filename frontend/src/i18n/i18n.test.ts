import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  createI18n,
} from './index';

describe('i18n', () => {
  it('inicia en es-CO por defecto', () => {
    window.localStorage.clear();
    const instance = createI18n();

    expect(instance.language).toBe(DEFAULT_LOCALE);
    expect(instance.t('nav.home')).toBe('Inicio');
    expect(SUPPORTED_LOCALES).toHaveLength(3);
  });

  it('cambia a es-AR y usa es-CO como respaldo', async () => {
    const instance = createI18n();

    await instance.changeLanguage('es-AR');

    expect(instance.t('auth.loginSubtitle')).toContain('Volvé');
    expect(instance.t('nav.home')).toBe('Inicio');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('es-AR');
  });

  it('restaura el idioma guardado', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'es-MX');

    const instance = createI18n();

    expect(instance.language).toBe('es-MX');
    expect(instance.t('search.subtitle')).toBe(
      'Encuentra jugadores y partidos cerca de ti.',
    );
  });
});
