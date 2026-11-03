import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import type { SessionContextValue } from '../lib/auth/session-context';
import { RegisterPage } from './RegisterPage';

function renderRegister(session: SessionContextValue) {
  return renderWithProviders(
    <Routes>
      <Route path="/registro" element={<RegisterPage />} />
      <Route path="/login" element={<div>Login destino</div>} />
      <Route path="/perfil/completar" element={<div>Perfil destino</div>} />
    </Routes>,
    { route: '/registro', session },
  );
}

const anonymousSession = (overrides: Partial<SessionContextValue> = {}) =>
  makeSession({ status: 'anonymous', user: null, ...overrides });

async function fillRegisterForm(
  password: string,
  confirmation: string,
): Promise<void> {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText(/^Correo electrónico/),
    'ana@example.com',
  );
  await user.type(screen.getByLabelText(/^Contraseña/), password);
  await user.type(screen.getByLabelText(/^Confirma tu contraseña/), confirmation);
  await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

describe('RegisterPage', () => {
  it('no envía el formulario si las contraseñas no coinciden', async () => {
    const signUp = vi.fn();
    const session = anonymousSession({ signUp });
    renderRegister(session);

    await fillRegisterForm('secreta123', 'secreta124');

    expect(
      await screen.findByText('Las contraseñas no coinciden.'),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it('crea la cuenta y lleva al perfil inicial', async () => {
    const signUp = vi
      .fn()
      .mockResolvedValue(makeProfile({ profileCompleted: false }));
    renderRegister(anonymousSession({ signUp }));

    await fillRegisterForm('secreta123', 'secreta123');

    expect(await screen.findByText('Perfil destino')).toBeInTheDocument();
    expect(signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secreta123',
    });
    expect(
      await screen.findByText('Cuenta creada. Ahora completa tu perfil.'),
    ).toBeInTheDocument();
  });

  it('señala el correo cuando ya está registrado', async () => {
    const signUp = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese correo'),
      );
    renderRegister(anonymousSession({ signUp }));

    await fillRegisterForm('secreta123', 'secreta123');

    expect(
      await screen.findByText('Ese correo ya está registrado.'),
    ).toBeInTheDocument();
  });
});
