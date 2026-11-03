import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { authApi } from '../lib/api/endpoints';
import { makeSession, renderWithProviders } from '../test/render';
import { RecoverPage } from './RecoverPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
    },
  };
});

const forgotPassword = vi.mocked(authApi.forgotPassword);
const resetPassword = vi.mocked(authApi.resetPassword);

function renderRecover() {
  return renderWithProviders(
    <Routes>
      <Route path="/recuperar" element={<RecoverPage />} />
      <Route path="/login" element={<div>Login destino</div>} />
    </Routes>,
    {
      route: '/recuperar',
      session: makeSession({ status: 'anonymous', user: null }),
    },
  );
}

async function goToResetStep(): Promise<ReturnType<typeof userEvent.setup>> {
  const user = userEvent.setup();
  await user.type(
    screen.getByLabelText(/^Correo electrónico/),
    'ana@example.com',
  );
  await user.click(screen.getByRole('button', { name: 'Enviar código' }));
  await screen.findByRole('heading', { name: 'Ingresa el código' });
  return user;
}

async function fillResetForm(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
): Promise<void> {
  await user.type(screen.getByLabelText(/^Código de verificación/), code);
  await user.type(screen.getByLabelText(/^Nueva contraseña/), 'nueva1234');
  await user.type(screen.getByLabelText(/^Confirma tu contraseña/), 'nueva1234');
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
}

describe('RecoverPage', () => {
  beforeEach(() => {
    forgotPassword.mockResolvedValue({ message: 'ok' });
  });

  it('solicita el código y avanza al paso de restablecimiento', async () => {
    renderRecover();

    await goToResetStep();

    expect(forgotPassword).toHaveBeenCalledWith('ana@example.com');
    expect(
      screen.getByText('Enviamos un código de 6 dígitos a ana@example.com.'),
    ).toBeInTheDocument();
  });

  it('valida que el código tenga seis dígitos', async () => {
    renderRecover();
    const user = await goToResetStep();

    await fillResetForm(user, '123');

    expect(
      await screen.findByText('El código debe tener exactamente 6 dígitos.'),
    ).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('muestra el error del backend si el código expiró', async () => {
    resetPassword.mockRejectedValue(
      new ApiError(400, 'INVALID_RESET_CODE', 'Código inválido'),
    );
    renderRecover();
    const user = await goToResetStep();

    await fillResetForm(user, '123456');

    expect(
      await screen.findByText('El código no es válido o ya expiró.'),
    ).toBeInTheDocument();
  });

  it('restablece la contraseña y vuelve al login', async () => {
    resetPassword.mockResolvedValue({ message: 'ok' });
    renderRecover();
    const user = await goToResetStep();

    await fillResetForm(user, '123456');

    expect(await screen.findByText('Login destino')).toBeInTheDocument();
    expect(resetPassword).toHaveBeenCalledWith({
      email: 'ana@example.com',
      code: '123456',
      newPassword: 'nueva1234',
    });
    expect(
      await screen.findByText(
        'Contraseña actualizada. Inicia sesión con tu nueva contraseña.',
      ),
    ).toBeInTheDocument();
  });

  it('permite reenviar el código sin revelar si el correo existe', async () => {
    renderRecover();
    const user = await goToResetStep();

    await user.click(screen.getByRole('button', { name: 'Reenviar código' }));

    expect(
      await screen.findByText(
        'Si el correo está registrado, enviamos otro código.',
      ),
    ).toBeInTheDocument();
    expect(forgotPassword).toHaveBeenCalledTimes(2);
  });
});
