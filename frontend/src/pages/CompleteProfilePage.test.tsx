import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { catalogApi } from '../lib/api/endpoints';
import type { Profile, UpdateProfileInput } from '../lib/api/types';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import { CompleteProfilePage } from './CompleteProfilePage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    catalogApi: {
      ...actual.catalogApi,
      get: vi.fn(),
    },
  };
});

const getCatalog = vi.mocked(catalogApi.get);

const incompleteProfile = () =>
  makeProfile({
    name: null,
    phone: null,
    locality: null,
    positions: [],
    profileCompleted: false,
  });

function renderCompleteProfile(
  updateProfile: (input: UpdateProfileInput) => Promise<Profile>,
  user = incompleteProfile(),
) {
  return renderWithProviders(
    <Routes>
      <Route path="/perfil/completar" element={<CompleteProfilePage />} />
      <Route path="/" element={<div>Inicio destino</div>} />
    </Routes>,
    {
      route: '/perfil/completar',
      session: makeSession({ user, updateProfile }),
    },
  );
}

async function waitForCatalog(): Promise<void> {
  await screen.findByRole('option', { name: 'Chapinero' });
}

describe('CompleteProfilePage', () => {
  beforeEach(() => {
    getCatalog.mockResolvedValue({
      positions: [
        { id: 1, title: 'portero' },
        { id: 4, title: 'delantero' },
      ],
      localities: [{ name: 'Chapinero' }, { name: 'Suba' }],
    });
  });

  it('exige nombre, teléfono, localidad y al menos una posición', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn<(input: UpdateProfileInput) => Promise<Profile>>();
    renderCompleteProfile(updateProfile);
    await waitForCatalog();

    await user.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(
      await screen.findByText('El nombre debe tener al menos 2 caracteres.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('El teléfono debe tener al menos 7 caracteres.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Elige tu localidad.')).toBeInTheDocument();
    expect(
      screen.getByText('Elige al menos una posición.'),
    ).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('guarda el perfil inicial y entra al inicio', async () => {
    const user = userEvent.setup();
    const updateProfile = vi
      .fn<(input: UpdateProfileInput) => Promise<Profile>>()
      .mockResolvedValue(makeProfile());
    renderCompleteProfile(updateProfile);
    await waitForCatalog();

    await user.type(screen.getByLabelText(/^Nombre completo/), 'Ana Pérez');
    await user.type(screen.getByLabelText(/^Teléfono/), '300 555 0011');
    await user.selectOptions(screen.getByLabelText(/^Localidad/), 'Chapinero');
    await user.click(screen.getByRole('button', { name: 'portero' }));
    await user.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(await screen.findByText('Inicio destino')).toBeInTheDocument();
    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Ana Pérez',
      phone: '300 555 0011',
      locality: 'Chapinero',
      positionIds: [1],
    });
    expect(
      await screen.findByText('Tu perfil está listo.'),
    ).toBeInTheDocument();
  });

  it('muestra el error cuando el teléfono ya está registrado', async () => {
    const user = userEvent.setup();
    const updateProfile = vi
      .fn<(input: UpdateProfileInput) => Promise<Profile>>()
      .mockRejectedValue(
        new ApiError(409, 'PHONE_IN_USE', 'Teléfono en uso'),
      );
    renderCompleteProfile(updateProfile);
    await waitForCatalog();

    await user.type(screen.getByLabelText(/^Nombre completo/), 'Ana Pérez');
    await user.type(screen.getByLabelText(/^Teléfono/), '300 555 0011');
    await user.selectOptions(screen.getByLabelText(/^Localidad/), 'Chapinero');
    await user.click(screen.getByRole('button', { name: 'portero' }));
    await user.click(screen.getByRole('button', { name: 'Guardar perfil' }));

    expect(
      await screen.findByText(
        'Ese teléfono ya está registrado en otra cuenta.',
      ),
    ).toBeInTheDocument();
  });

  it('no deja completar un perfil que ya está listo', async () => {
    const updateProfile = vi.fn<(input: UpdateProfileInput) => Promise<Profile>>();
    renderCompleteProfile(updateProfile, makeProfile());

    expect(await screen.findByText('Inicio destino')).toBeInTheDocument();
  });
});
