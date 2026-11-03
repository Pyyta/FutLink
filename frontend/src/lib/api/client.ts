import { clearSession, readSession, writeSession } from '../auth/storage';
import type { AuthResult } from './types';

const DEFAULT_API_URL = 'http://localhost:3000/api';

export const API_BASE_URL = (
  import.meta.env.VITE_API_URL ?? DEFAULT_API_URL
).replace(/\/+$/, '');

export const SESSION_EXPIRED_EVENT = 'futlink:session-expired';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function defaultMessage(status: number): string {
  if (status === 400) return 'La solicitud no es válida.';
  if (status === 401) return 'Debes iniciar sesión.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'No encontramos lo que buscas.';
  if (status === 409) return 'La acción no se pudo completar en este momento.';
  if (status === 429) return 'Demasiados intentos. Espera un momento.';
  if (status >= 500) return 'Tuvimos un problema. Intenta de nuevo más tarde.';
  return 'No pudimos completar la solicitud.';
}

function extractError(
  payload: unknown,
  status: number,
): { code: string; message: string; details: unknown } {
  if (isRecord(payload) && isRecord(payload.error)) {
    return {
      code:
        typeof payload.error.code === 'string'
          ? payload.error.code
          : `HTTP_${status}`,
      message:
        typeof payload.error.message === 'string'
          ? payload.error.message
          : defaultMessage(status),
      details: payload.error.details,
    };
  }

  return {
    code: `HTTP_${status}`,
    message: defaultMessage(status),
    details: payload,
  };
}

async function parsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  return response.text();
}

async function perform<T>(path: string, options: RequestOptions): Promise<T> {
  const method = options.method ?? 'GET';
  const useAuth = options.auth ?? true;
  const headers = new Headers({ Accept: 'application/json' });

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }

  if (useAuth) {
    const session = readSession();
    if (session) {
      headers.set('Authorization', `Bearer ${session.accessToken}`);
    }
  }

  const init: RequestInit = { method, headers };
  if (options.body !== undefined) init.body = JSON.stringify(options.body);
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'No pudimos conectar con el servidor. Revisa tu conexión.',
    );
  }

  const payload = await parsePayload(response);

  if (!response.ok) {
    const error = extractError(payload, response.status);
    throw new ApiError(
      response.status,
      error.code,
      error.message,
      error.details,
    );
  }

  return payload as T;
}

type RefreshOutcome =
  | { status: 'refreshed' }
  | { status: 'invalid' }
  | { status: 'unavailable'; httpStatus: number };

let refreshPromise: Promise<RefreshOutcome> | null = null;

async function performRefresh(): Promise<RefreshOutcome> {
  const current = readSession();
  if (!current) return { status: 'invalid' };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken: current.refreshToken }),
    });
  } catch {
    return { status: 'unavailable', httpStatus: 0 };
  }

  if (!response.ok) {
    if (
      response.status === 400 ||
      response.status === 401 ||
      response.status === 403
    ) {
      clearSession();
      return { status: 'invalid' };
    }
    return { status: 'unavailable', httpStatus: response.status };
  }

  try {
    const result = (await response.json()) as AuthResult;
    if (
      typeof result.accessToken !== 'string' ||
      typeof result.refreshToken !== 'string'
    ) {
      clearSession();
      return { status: 'invalid' };
    }

    writeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return { status: 'refreshed' };
  } catch {
    return { status: 'unavailable', httpStatus: 502 };
  }
}

async function refreshSession(): Promise<RefreshOutcome> {
  if (refreshPromise) return refreshPromise;

  const attempt = performRefresh();
  refreshPromise = attempt;
  try {
    return await attempt;
  } finally {
    if (refreshPromise === attempt) refreshPromise = null;
  }
}

function notifySessionExpired(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  try {
    return await perform<T>(path, options);
  } catch (error) {
    const useAuth = options.auth ?? true;
    const isAuthRequest = path.startsWith('/auth/');

    if (
      !(error instanceof ApiError) ||
      error.status !== 401 ||
      !useAuth ||
      isAuthRequest
    ) {
      throw error;
    }

    const outcome = await refreshSession();

    if (outcome.status === 'refreshed') {
      try {
        return await perform<T>(path, options);
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401) {
          clearSession();
          notifySessionExpired();
          throw new ApiError(
            401,
            'SESSION_EXPIRED',
            'Tu sesión expiró. Inicia sesión de nuevo.',
            retryError.details,
          );
        }
        throw retryError;
      }
    }

    if (outcome.status === 'invalid') {
      notifySessionExpired();
      throw new ApiError(
        401,
        'SESSION_EXPIRED',
        'Tu sesión expiró. Inicia sesión de nuevo.',
        error.details,
      );
    }

    if (outcome.httpStatus === 0) {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        'No pudimos conectar con el servidor. Revisa tu conexión.',
      );
    }

    if (outcome.httpStatus === 429) {
      throw new ApiError(
        429,
        'RATE_LIMITED',
        'Demasiados intentos. Espera un momento.',
      );
    }

    throw new ApiError(
      outcome.httpStatus,
      'REFRESH_UNAVAILABLE',
      'No pudimos renovar tu sesión. Intenta de nuevo.',
    );
  }
}
