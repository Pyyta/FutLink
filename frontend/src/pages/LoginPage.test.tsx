import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import type { SessionContextValue } from '../lib/auth/session-context';
import { LoginPage } from './LoginPage';

function renderLogin(session: SessionContextValue) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<div>Inicio destino</div>} />
      <Route path="/perfil/completar" element={<div>Perfil destino</div>} />
    </Routes>,
    { route: '/login', session },
  );
}

const anonymousSession = (overrides: Partial<SessionContextValue> = {}) =>
  makeSession({ status: 'anonymous', user: null, ...overrides });

describe('LoginPage', () => {
  it('muestra los errores de validación sin llamar al API', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(makeProfile());
    const session = anonymousSession({ signIn });
    renderLogin(session);

    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Escribe tu correo electrónico.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Escribe tu contraseña.'),
    ).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('inicia sesión y entra al inicio si el perfil está completo', async () => {
    const user = userEvent.setup();
    const signIn = vi.fn().mockResolvedValue(makeProfile());
    renderLogin(anonymousSession({ signIn }));

    await user.type(
      screen.getByLabelText(/^Correo electrónico/),
      ' ana@example.com ',
    );
    await user.type(screen.getByLabelText(/^Contraseña/), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Inicio destino')).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secreta123',
    });
  });

  it('lleva al perfil inicial cuando el perfil está incompleto', async () => {
    const user = userEvent.setup();
    const signIn = vi
      .fn()
      .mockResolvedValue(makeProfile({ profileCompleted: false }));
    renderLogin(anonymousSession({ signIn }));

    await user.type(
      screen.getByLabelText(/^Correo electrónico/),
      'ana@example.com',
    );
    await user.type(screen.getByLabelText(/^Contraseña/), 'secreta123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Perfil destino')).toBeInTheDocument();
  });

  it('muestra el error genérico de credenciales del backend', async () => {
    const user = userEvent.setup();
    const signIn = vi
      .fn()
      .mockRejectedValue(
        new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos'),
      );
    renderLogin(anonymousSession({ signIn }));

    await user.type(
      screen.getByLabelText(/^Correo electrónico/),
      'ana@example.com',
    );
    await user.type(screen.getByLabelText(/^Contraseña/), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Correo o contraseña incorrectos.'),
    ).toBeInTheDocument();
  });

  it('permite mostrar y ocultar la contraseña', async () => {
    const user = userEvent.setup();
    renderLogin(anonymousSession());

    const password = screen.getByLabelText(/^Contraseña/);
    expect(password).toHaveAttribute('type', 'password');

    await user.click(
      screen.getByRole('button', { name: 'Mostrar contraseña' }),
    );
    expect(password).toHaveAttribute('type', 'text');

    await user.click(
      screen.getByRole('button', { name: 'Ocultar contraseña' }),
    );
    expect(password).toHaveAttribute('type', 'password');
  });
});
