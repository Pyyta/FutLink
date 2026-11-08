const API_URL_STORAGE_KEY = 'futlink.api-url';
const DEFAULT_API_URL = 'http://localhost:3000/api';

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export const BUILD_API_URL = stripTrailingSlashes(
  import.meta.env.VITE_API_URL ?? DEFAULT_API_URL,
);

export { API_URL_STORAGE_KEY };

export function normalizeApiUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  const pathname = stripTrailingSlashes(url.pathname) || '/api';
  url.pathname = pathname;
  url.search = '';
  url.hash = '';

  return stripTrailingSlashes(url.toString());
}

export function getStoredApiUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(API_URL_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getApiBaseUrl(): string {
  const stored = getStoredApiUrl();
  if (stored) return stored;

  // En producción la PWA suele servirse desde la misma API; en desarrollo
  // el frontend vive en otro puerto y usa VITE_API_URL.
  if (
    !import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    /^https?:$/.test(window.location.protocol)
  ) {
    return `${window.location.origin}/api`;
  }

  return BUILD_API_URL;
}

export function setApiUrl(value: string | null): void {
  if (typeof window === 'undefined') return;

  try {
    if (value === null) {
      window.localStorage.removeItem(API_URL_STORAGE_KEY);
    } else {
      window.localStorage.setItem(API_URL_STORAGE_KEY, value);
    }
  } catch {
    // La app sigue funcionando con la configuración de compilación.
  }
}

export function resetApiUrl(): void {
  setApiUrl(null);
}

export function getApiHost(): string {
  const baseUrl = getApiBaseUrl();

  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
