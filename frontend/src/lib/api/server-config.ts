import { Capacitor } from '@capacitor/core';

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
  if (
    Capacitor.isNativePlatform() &&
    url.protocol === 'http:' &&
    !isPrivateNetworkHost(url.hostname)
  ) {
    return null;
  }

  const pathname = stripTrailingSlashes(url.pathname) || '/api';
  url.pathname = pathname;
  url.search = '';
  url.hash = '';

  return stripTrailingSlashes(url.toString());
}

export function getStoredApiUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(API_URL_STORAGE_KEY);
    return stored ? normalizeApiUrl(stored) : null;
  } catch {
    return null;
  }
}

export function getApiBaseUrl(): string {
  const stored = getStoredApiUrl();
  if (stored) return stored;

  // In a native WebView, localhost belongs to the phone, not the PC server.
  // Leave the URL unset until the user scans the server's QR code or enters it.
  if (Capacitor.isNativePlatform()) {
    const configured = import.meta.env.VITE_API_URL;
    return configured ? normalizeApiUrl(configured) ?? '' : '';
  }

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

export function isApiServerConfigured(): boolean {
  return (
    !Capacitor.isNativePlatform() ||
    Boolean(
      getStoredApiUrl() ||
        normalizeApiUrl(import.meta.env.VITE_API_URL ?? ''),
    )
  );
}

function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  // localhost/::1 inside a phone's WebView always points back to the phone,
  // so the server must have a reachable LAN address instead.
  if (host.endsWith('.local')) return true;

  const parts = host.split('.').map(Number);
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [first, second] = parts;
    return (
      first === 10 ||
      (first === 192 && second === 168) ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31)
    );
  }

  return (
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^fe[89ab][0-9a-f]:/i.test(host)
  );
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
