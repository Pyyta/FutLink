import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { requestsApi, usersApi } from '../lib/api/endpoints';
import {
  makeProfile,
  makePublicProfile,
  makeRequest,
} from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import { PublicProfilePage } from './PublicProfilePage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    usersApi: {
      ...actual.usersApi,
      get: vi.fn(),
      rate: vi.fn(),
    },
    requestsApi: {
      ...actual.requestsApi,
      create: vi.fn(),
    },
  };
});

const getUser = vi.mocked(usersApi.get);
const rateUser = vi.mocked(usersApi.rate);
const createRequest = vi.mocked(requestsApi.create);

function renderPublicProfile(sessionUser = makeProfile()) {
  return renderWithProviders(
    <Routes>
      <Route path="/jugadores/:id" element={<PublicProfilePage />} />
      <Route path="/perfil/editar" element={<div>Editar destino</div>} />
      <Route path="/solicitudes" element={<div>Solicitudes destino</div>} />
      <Route path="/" element={<div>Inicio destino</div>} />
    </Routes>,
    {
      route: '/jugadores/2',
      session: makeSession({ user: sessionUser }),
    },
  );
}

describe('PublicProfilePage', () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ profile: makePublicProfile() });
    rateUser.mockResolvedValue({
      rating: {
        id: 11,
        score: 5,
        comment: null,
        createdAt: '2026-11-02T16:00:00.000Z',
        updatedAt: '2026-11-02T16:00:00.000Z',
        moderationState: 'visible',
      },
      summary: { average: 5, count: 4 },
    });
    createRequest.mockResolvedValue({
      request: makeRequest({ type: 'player' }),
    });
  });

  it('muestra la información pública, la calificación y los comentarios', async () => {
    renderPublicProfile();

    expect(
      await screen.findByRole('heading', { name: 'Carlos Ruiz' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Suba')).toBeInTheDocument();
    expect(screen.getByText('4.3')).toBeInTheDocument();
    expect(screen.getByText('(3)')).toBeInTheDocument();
    expect(screen.getByText('defensa')).toBeInTheDocument();
    expect(
      screen.getByText('Gran jugador y muy puntual.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Diana Gómez' }),
    ).toBeInTheDocument();
  });

  it('oculta el teléfono cuando no hay solicitud aceptada', async () => {
    renderPublicProfile();

    expect(
      await screen.findByText('Teléfono privado'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Solo se muestra cuando hay una solicitud aceptada entre ambos.',
      ),
    ).toBeInTheDocument();
  });

  it('muestra el teléfono cuando es visible para el visitante', async () => {
    getUser.mockResolvedValue({
      profile: makePublicProfile({
        phone: '300 987 6543',
        phoneVisible: true,
      }),
    });
    renderPublicProfile();

    expect(await screen.findByText('300 987 6543')).toBeInTheDocument();
    expect(
      screen.getByText('Visible porque tienen una solicitud aceptada.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Teléfono privado')).not.toBeInTheDocument();
  });

  it('ofrece editar el perfil cuando es el propio jugador', async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue({
      profile: makePublicProfile({
        id: 1,
        name: 'Ana Pérez',
        phone: '300 123 4567',
        phoneVisible: true,
      }),
    });
    renderPublicProfile(makeProfile({ id: 1 }));

    const editButton = await screen.findByRole('button', {
      name: 'Editar perfil',
    });
    expect(
      screen.queryByText(
        'Visible porque tienen una solicitud aceptada.',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Calificar jugador' }),
    ).not.toBeInTheDocument();

    await user.click(editButton);

    expect(await screen.findByText('Editar destino')).toBeInTheDocument();
  });

  it('informa cuando el jugador no existe o no está activo', async () => {
    getUser.mockRejectedValue(
      new ApiError(404, 'USER_NOT_FOUND', 'No existe'),
    );
    renderPublicProfile();

    expect(
      await screen.findByRole('heading', { name: 'Jugador no encontrado' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('El perfil no existe o la cuenta no está activa.'),
    ).toBeInTheDocument();
  });

  it('muestra un estado vacío cuando no hay comentarios', async () => {
    getUser.mockResolvedValue({
      profile: makePublicProfile({ comments: [] }),
    });
    renderPublicProfile();

    expect(
      await screen.findByText('Todavía no hay comentarios.'),
    ).toBeInTheDocument();
  });

  it('confirma y envía una solicitud de jugador', async () => {
    const user = userEvent.setup();
    renderPublicProfile();

    await screen.findByRole('heading', { name: 'Carlos Ruiz' });
    await user.click(
      screen.getByRole('button', { name: 'Enviar solicitud' }),
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Enviar solicitud' }),
    );

    await waitFor(() => {
      expect(createRequest).toHaveBeenCalledWith({
        type: 'player',
        targetUserId: 2,
      });
    });
    expect(
      await screen.findByRole('heading', { name: 'Solicitud enviada' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Ver solicitudes' }),
    );
    expect(await screen.findByText('Solicitudes destino')).toBeInTheDocument();
  });

  it('muestra el error si ya existe una solicitud activa', async () => {
    const user = userEvent.setup();
    createRequest.mockRejectedValue(
      new ApiError(409, 'REQUEST_ALREADY_EXISTS', 'Solicitud existente'),
    );
    renderPublicProfile();

    await screen.findByRole('heading', { name: 'Carlos Ruiz' });
    await user.click(
      screen.getByRole('button', { name: 'Enviar solicitud' }),
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Enviar solicitud' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ya tienes una solicitud activa con este jugador.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('permite calificar a otro jugador con estrellas y comentario', async () => {
    const user = userEvent.setup();
    renderPublicProfile();

    await screen.findByRole('heading', { name: 'Carlos Ruiz' });
    await user.click(
      screen.getByRole('button', { name: 'Calificar jugador' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Calificar a Carlos Ruiz' }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Calificar con 5 estrellas',
      }),
    );
    await user.type(
      within(dialog).getByLabelText('Comentario (opcional)'),
      'Muy buen partido.',
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Guardar calificación',
      }),
    );

    await waitFor(() => {
      expect(rateUser).toHaveBeenCalledWith(2, {
        score: 5,
        comment: 'Muy buen partido.',
      });
    });
    expect(
      await screen.findByText('Tu calificación se guardó.'),
    ).toBeInTheDocument();
  });

  it('permite editar una calificación existente', async () => {
    const user = userEvent.setup();
    getUser.mockResolvedValue({
      profile: makePublicProfile({
        myRating: {
          id: 11,
          score: 4,
          comment: 'Buen juego',
          createdAt: '2026-11-01T16:00:00.000Z',
          updatedAt: '2026-11-01T16:00:00.000Z',
          moderationState: 'visible',
        },
      }),
    });
    renderPublicProfile();

    expect(await screen.findByText('Tu calificación')).toBeInTheDocument();
    expect(screen.getByText('4/5')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Editar calificación' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByLabelText('Comentario (opcional)'),
    ).toHaveValue('Buen juego');

    await user.click(
      within(dialog).getByRole('button', {
        name: 'Calificar con 3 estrellas',
      }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Guardar calificación',
      }),
    );

    await waitFor(() => {
      expect(rateUser).toHaveBeenCalledWith(2, {
        score: 3,
        comment: 'Buen juego',
      });
    });
  });

  it('muestra el error si la calificación exige una solicitud aceptada', async () => {
    const user = userEvent.setup();
    rateUser.mockRejectedValue(
      new ApiError(
        403,
        'RATING_REQUIRES_ACCEPTED_REQUEST',
        'Solicitud requerida',
      ),
    );
    renderPublicProfile();

    await screen.findByRole('heading', { name: 'Carlos Ruiz' });
    await user.click(
      screen.getByRole('button', { name: 'Calificar jugador' }),
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Calificar con 5 estrellas',
      }),
    );
    await user.click(
      within(dialog).getByRole('button', {
        name: 'Guardar calificación',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Para calificar a este jugador debe existir una solicitud aceptada entre ambos.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
