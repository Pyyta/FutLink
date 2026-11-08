import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL_STORAGE_KEY } from '../lib/api/server-config';
import type { SessionContextValue } from '../lib/auth/session-context';
import { makeSession, renderWithProviders } from '../test/render';
import { ServerSettingsPage } from './ServerSettingsPage';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(session: SessionContextValue = makeSession()) {
  return renderWithProviders(
    <Routes>
      <Route path="/servidor" element={<ServerSettingsPage />} />
      <Route path="/login" element={<div>Pantalla de login</div>} />
      <Route path="/" element={<div>Pantalla de inicio</div>} />
    </Routes>,
    { route: '/servidor', session },
  );
}

async function setUrl(value: string) {
  const user = userEvent.setup();
  const input = screen.getByLabelText(/^URL de la API/);

  await user.clear(input);
  await user.type(input, value);

  return user;
}

describe('ServerSettingsPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prueba la conexión contra /health', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 'ok', db: 'up' }));
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    const user = await setUrl('https://demo.example.com');
    await user.click(screen.getByRole('button', { name: 'Probar conexión' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'Conexión correcta',
    );

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('No se registró la petición');

    expect(call[0]).toBe('https://demo.example.com/api/health');
  });

  it('guarda la URL normalizada y cierra la sesión', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);

    renderPage(makeSession({ signOut }));
    const user = await setUrl('https://demo.example.com');
    await user.click(screen.getByRole('button', { name: 'Guardar servidor' }));

    expect(await screen.findByText('Pantalla de login')).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(API_URL_STORAGE_KEY)).toBe(
      'https://demo.example.com/api',
    );
  });

  it('no guarda una URL inválida', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage(makeSession({ signOut }));
    const input = screen.getByLabelText(/^URL de la API/);
    await user.clear(input);
    await user.type(input, 'ftp://servidor');
    await user.click(screen.getByRole('button', { name: 'Guardar servidor' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('URL válida');
    expect(signOut).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(API_URL_STORAGE_KEY)).toBeNull();
  });
});
