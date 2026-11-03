import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import esAR from './locales/es-AR';
import esCO from './locales/es-CO';
import esMX from './locales/es-MX';

export const SUPPORTED_LOCALES = ['es-CO', 'es-AR', 'es-MX'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = 'es-CO';
export const LOCALE_STORAGE_KEY = 'futlink.locale';

const resources = {
  'es-CO': { translation: esCO },
  'es-AR': { translation: esAR },
  'es-MX': { translation: esMX },
} as const;

export function isAppLocale(value: unknown): value is AppLocale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function getStoredLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isAppLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function createI18n(): I18nInstance {
  const instance = i18next.createInstance();

  void instance.use(initReactI18next).init({
    resources,
    lng: getStoredLocale(),
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });

  instance.on('languageChanged', (language) => {
    const locale = isAppLocale(language) ? language : DEFAULT_LOCALE;

    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // El idioma sigue activo en memoria aunque el almacenamiento no esté disponible.
    }

    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  });

  if (typeof document !== 'undefined') {
    document.documentElement.lang = instance.language;
  }

  return instance;
}

export const i18n = createI18n();

export async function changeAppLanguage(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale);
}
