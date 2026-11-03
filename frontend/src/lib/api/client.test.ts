import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_URL,
  ApiError,
  SESSION_EXPIRED_EVENT,
  authApi,
  meApi,
} from '@/lib/api';
import { readSession, writeSession } from '@/lib/auth/storage';
import { makeAuthResult, makeProfile } from '@/test/fixtures';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

describe('cliente HTTP', () => {
  beforeEach(() => {
    writeSession({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('adjunta el token y devuelve el DTO tipado', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ user: makeProfile() }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await meApi.get();

    expect(response.user.email).toBe('ana@example.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('No se registró la petición');
    const [url, init] = call;

    expect(url).toBe(`${API_BASE_URL}/me`);
    expect(init?.method).toBe('GET');

    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-1');
    expect(headers.get('Accept')).toBe('application/json');
  });

  it('no envía token en el login y serializa el cuerpo', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(makeAuthResult()));
    vi.stubGlobal('fetch', fetchMock);

    const result = await authApi.login({
      email: 'ana@example.com',
      password: 'secreta',
    });

    expect(result.accessToken).toBe('access-new');

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('No se registró la petición');
    const [url, init] = call;

    expect(url).toBe(`${API_BASE_URL}/auth/login`);
    expect(init?.method).toBe('POST');

    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBeNull();
    expect(headers.get('Content-Type')).toBe('application/json');

    if (typeof init?.body !== 'string') {
      throw new Error('El cuerpo no se serializó como JSON');
    }
    expect(JSON.parse(init.body)).toEqual({
      email: 'ana@example.com',
      password: 'secreta',
    });
  });

  it('renueva el token una sola vez para peticiones concurrentes', async () => {
    let meCalls = 0;
    let refreshCalls = 0;
    let releaseRefresh: (response: Response) => void = () => undefined;
    const refreshGate = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = requestUrl(input);

      if (url === `${API_BASE_URL}/auth/refresh`) {
        refreshCalls += 1;
        return refreshGate;
      }

      if (url === `${API_BASE_URL}/me`) {
        meCalls += 1;
        const authorization = new Headers(init?.headers).get('Authorization');
        if (authorization === 'Bearer access-1') {
          return jsonResponse(
            {
              error: { code: 'INVALID_TOKEN', message: 'El token venció' },
            },
            401,
          );
        }
        return jsonResponse({ user: makeProfile() });
      }

      throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const pending = Promise.all([meApi.get(), meApi.get()]);

    await vi.waitFor(() => {
      expect(meCalls).toBe(2);
      expect(refreshCalls).toBe(1);
    });

    releaseRefresh(jsonResponse(makeAuthResult()));

    const [first, second] = await pending;

    expect(first.user.id).toBe(1);
    expect(second.user.id).toBe(1);
    expect(refreshCalls).toBe(1);
    expect(meCalls).toBe(4);
    expect(readSession()?.accessToken).toBe('access-new');
    expect(readSession()?.refreshToken).toBe('refresh-new');
  });

  it('cierra la sesión y avisa cuando el refresh es rechazado', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = requestUrl(input);

      if (url === `${API_BASE_URL}/me`) {
        return jsonResponse(
          { error: { code: 'INVALID_TOKEN', message: 'El token venció' } },
          401,
        );
      }

      if (url === `${API_BASE_URL}/auth/refresh`) {
        return jsonResponse(
          {
            error: {
              code: 'INVALID_REFRESH_TOKEN',
              message: 'El refresh no es válido',
            },
          },
          401,
        );
      }

      throw new Error(`URL inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const listener = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, listener);

    await expect(meApi.get()).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
      status: 401,
    });

    expect(readSession()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
  });

  it('no cierra la sesión si el refresh falla por red', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = requestUrl(input);

      if (url === `${API_BASE_URL}/me`) {
        return jsonResponse(
          { error: { code: 'INVALID_TOKEN', message: 'El token venció' } },
          401,
        );
      }

      throw new TypeError('sin conexión');
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(meApi.get()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      status: 0,
    });

    expect(readSession()).not.toBeNull();
  });

  it('normaliza errores de red y respuestas de error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new TypeError('sin red')),
    );

    await expect(meApi.get()).rejects.toBeInstanceOf(ApiError);

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse(
          { error: { code: 'FORBIDDEN', message: 'Sin permiso' } },
          403,
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(meApi.get()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      message: 'Sin permiso',
    });
  });
});
