import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { matchesApi, requestsApi } from '../lib/api/endpoints';
import {
  makeMatchDetail,
  makeRequest,
} from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { MatchDetailPage } from './MatchDetailPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    matchesApi: { ...actual.matchesApi, get: vi.fn() },
    requestsApi: { ...actual.requestsApi, create: vi.fn() },
  };
});

const getMatch = vi.mocked(matchesApi.get);
const createRequest = vi.mocked(requestsApi.create);

function renderMatchDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/partidos/:id" element={<MatchDetailPage />} />
      <Route path="/buscar" element={<div>Buscar destino</div>} />
      <Route path="/solicitudes" element={<div>Solicitudes destino</div>} />
    </Routes>,
    { route: '/partidos/10' },
  );
}

describe('MatchDetailPage', () => {
  beforeEach(() => {
    getMatch.mockResolvedValue({ match: makeMatchDetail() });
    createRequest.mockResolvedValue({
      request: makeRequest({ type: 'match' }),
    });
  });

  it('muestra el detalle, el organizador y las vacantes', async () => {
    renderMatchDetail();

    expect(
      await screen.findByRole('heading', { name: 'Chapinero', level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Partido amistoso entre vecinos.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Organiza Fútbol' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Cupo libre')).toBeInTheDocument();
    expect(screen.getByText('fútbol 7')).toBeInTheDocument();
  });

  it('confirma y envía la solicitud de un cupo libre', async () => {
    const user = userEvent.setup();
    renderMatchDetail();

    await screen.findByRole('heading', { name: 'Chapinero', level: 1 });
    await user.click(screen.getByRole('button', { name: 'Solicitar' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('Confirmar solicitud'),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Enviar solicitud' }),
    );

    await waitFor(() => {
      expect(createRequest).toHaveBeenCalledWith({
        type: 'match',
        vacancyId: 101,
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

  it('muestra el error del backend si el cupo ya fue ocupado', async () => {
    const user = userEvent.setup();
    createRequest.mockRejectedValue(
      new ApiError(409, 'VACANCY_OCCUPIED', 'Cupo ocupado'),
    );
    renderMatchDetail();

    await screen.findByRole('heading', { name: 'Chapinero', level: 1 });
    await user.click(screen.getByRole('button', { name: 'Solicitar' }));
    await user.click(
      await screen.findByRole('button', { name: 'Enviar solicitud' }),
    );

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('Ese cupo ya fue ocupado. Elige otro.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('no permite solicitar cupos en un partido propio', async () => {
    getMatch.mockResolvedValue({
      match: makeMatchDetail({ isOwner: true }),
    });
    renderMatchDetail();

    expect(
      await screen.findByText('Este partido lo organizas tú'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Solicitar' }),
    ).not.toBeInTheDocument();
  });

  it('muestra el estado de partido no encontrado', async () => {
    getMatch.mockRejectedValue(
      new ApiError(404, 'MATCH_NOT_FOUND', 'No existe'),
    );
    renderMatchDetail();

    expect(
      await screen.findByRole('heading', { name: 'Partido no encontrado' }),
    ).toBeInTheDocument();
  });
});
