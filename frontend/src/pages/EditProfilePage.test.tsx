import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { catalogApi } from '../lib/api/endpoints';
import type { Profile, UpdateProfileInput } from '../lib/api/types';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import { EditProfilePage } from './EditProfilePage';

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

function renderEditProfile(
  updateProfile: (input: UpdateProfileInput) => Promise<Profile>,
) {
  return renderWithProviders(
    <Routes>
      <Route path="/perfil/editar" element={<EditProfilePage />} />
      <Route path="/perfil" element={<div>Perfil destino</div>} />
    </Routes>,
    {
      route: '/perfil/editar',
      session: makeSession({ updateProfile }),
    },
  );
}

async function waitForCatalog(): Promise<void> {
  await screen.findByRole('option', { name: 'Chapinero' });
}

describe('EditProfilePage', () => {
  beforeEach(() => {
    getCatalog.mockResolvedValue({
      positions: [
        { id: 1, title: 'arquera' },
        { id: 4, title: 'delantera' },
      ],
      localities: [{ name: 'Chapinero' }, { name: 'Suba' }],
    });
  });

  it('muestra los datos actuales del perfil', async () => {
    renderEditProfile(vi.fn());

    expect(await screen.findByLabelText(/^Nombre completo/)).toHaveValue(
      'Ana Pérez',
    );
    expect(screen.getByLabelText(/^Teléfono/)).toHaveValue('300 123 4567');
    expect(screen.getByLabelText(/^Localidad/)).toHaveValue('Chapinero');
    expect(
      screen.getByRole('button', { name: 'arquera' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('valida los campos obligatorios antes de guardar', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn<(input: UpdateProfileInput) => Promise<Profile>>();
    renderEditProfile(updateProfile);
    await waitForCatalog();

    await user.clear(screen.getByLabelText(/^Nombre completo/));
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('El nombre debe tener al menos 2 caracteres.'),
    ).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('guarda los cambios y vuelve al perfil', async () => {
    const user = userEvent.setup();
    const updateProfile = vi
      .fn<(input: UpdateProfileInput) => Promise<Profile>>()
      .mockResolvedValue(makeProfile({ name: 'Ana Actualizada' }));
    renderEditProfile(updateProfile);
    await waitForCatalog();
    await screen.findByLabelText(/^Nombre completo/);

    const nameInput = screen.getByLabelText(/^Nombre completo/);
    await user.clear(nameInput);
    await user.type(nameInput, 'Ana Actualizada');
    await user.selectOptions(screen.getByLabelText(/^Localidad/), 'Suba');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Perfil destino')).toBeInTheDocument();
    expect(updateProfile).toHaveBeenCalledWith({
      name: 'Ana Actualizada',
      phone: '300 123 4567',
      locality: 'Suba',
      positionIds: [1],
    });
    expect(
      await screen.findByText('Tu perfil se actualizó.'),
    ).toBeInTheDocument();
  });

  it('muestra el error cuando el teléfono ya está registrado', async () => {
    const user = userEvent.setup();
    const updateProfile = vi
      .fn<(input: UpdateProfileInput) => Promise<Profile>>()
      .mockRejectedValue(new ApiError(409, 'PHONE_IN_USE', 'Teléfono en uso'));
    renderEditProfile(updateProfile);
    await waitForCatalog();
    await screen.findByLabelText(/^Nombre completo/);

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText(
        'Ese teléfono ya está registrado en otra cuenta.',
      ),
    ).toBeInTheDocument();
  });

  it('cancela sin guardar y vuelve al perfil', async () => {
    const user = userEvent.setup();
    const updateProfile = vi.fn<(input: UpdateProfileInput) => Promise<Profile>>();
    renderEditProfile(updateProfile);

    await waitForCatalog();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(await screen.findByText('Perfil destino')).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
