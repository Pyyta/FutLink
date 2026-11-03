import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api/client';
import { requestsApi } from '../lib/api/endpoints';
import { makeRequest } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { RequestsPage } from './RequestsPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    requestsApi: {
      ...actual.requestsApi,
      list: vi.fn(),
      accept: vi.fn(),
      reject: vi.fn(),
      cancel: vi.fn(),
    },
  };
});

const listRequests = vi.mocked(requestsApi.list);
const acceptRequest = vi.mocked(requestsApi.accept);
const rejectRequest = vi.mocked(requestsApi.reject);
const cancelRequest = vi.mocked(requestsApi.cancel);

function receivedRequest() {
  return makeRequest({
    direction: 'received',
    canRespond: true,
    canCancel: false,
    sender: {
      id: 2,
      name: 'Carlos Ruiz',
      profilePic: null,
      locality: 'Suba',
      rating: { average: 4.3, count: 3 },
    },
    receiver: {
      id: 1,
      name: 'Ana Pérez',
      profilePic: null,
      locality: 'Chapinero',
      rating: { average: null, count: 0 },
    },
  });
}

function sentRequest() {
  return makeRequest({
    direction: 'sent',
    canRespond: false,
    canCancel: true,
  });
}

function renderRequests(route = '/solicitudes') {
  return renderWithProviders(
    <Routes>
      <Route path="/solicitudes" element={<RequestsPage />} />
      <Route path="/partidos/:id" element={<div>Partido destino</div>} />
      <Route path="/jugadores/:id" element={<div>Perfil destino</div>} />
    </Routes>,
    { route },
  );
}

describe('RequestsPage', () => {
  beforeEach(() => {
    listRequests.mockImplementation(async (input = {}) => ({
      requests: input.box === 'sent' ? [sentRequest()] : [receivedRequest()],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    }));
    acceptRequest.mockResolvedValue({
      request: makeRequest({ state: 'accepted' }),
    });
    rejectRequest.mockResolvedValue({
      request: makeRequest({ state: 'rejected' }),
    });
    cancelRequest.mockResolvedValue({
      request: makeRequest({ state: 'cancelled' }),
    });
  });

  it('muestra las solicitudes recibidas con sus acciones', async () => {
    renderRequests();

    expect(await screen.findByText('De Carlos Ruiz')).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getByText('Pendiente')).toBeInTheDocument();
    expect(within(list).getByText('Solicitud de jugador')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aceptar' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Rechazar' }),
    ).toBeInTheDocument();
  });

  it('cambia a la bandeja de enviadas', async () => {
    const user = userEvent.setup();
    renderRequests();

    await screen.findByText('De Carlos Ruiz');
    await user.click(screen.getByRole('tab', { name: 'Enviadas' }));

    expect(await screen.findByText('Para Carlos Ruiz')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Cancelar solicitud' }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ box: 'sent' }),
      );
    });
  });

  it('confirma y acepta una solicitud recibida', async () => {
    const user = userEvent.setup();
    renderRequests();

    await screen.findByText('De Carlos Ruiz');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Aceptar solicitud' }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText('¿Aceptar la solicitud de Carlos Ruiz?'),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );

    await waitFor(() => {
      expect(acceptRequest).toHaveBeenCalledWith(20);
    });
    expect(await screen.findByText('Solicitud aceptada.')).toBeInTheDocument();
  });

  it('cancela una solicitud enviada', async () => {
    const user = userEvent.setup();
    renderRequests('/solicitudes?box=sent');

    await screen.findByText('Para Carlos Ruiz');
    await user.click(
      screen.getByRole('button', { name: 'Cancelar solicitud' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Cancelar solicitud' }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );

    await waitFor(() => {
      expect(cancelRequest).toHaveBeenCalledWith(20);
    });
    expect(await screen.findByText('Solicitud cancelada.')).toBeInTheDocument();
  });

  it('muestra el error del backend si la vacante ya está ocupada', async () => {
    const user = userEvent.setup();
    acceptRequest.mockRejectedValue(
      new ApiError(409, 'VACANCY_OCCUPIED', 'Cupo ocupado'),
    );
    renderRequests();

    await screen.findByText('De Carlos Ruiz');
    await user.click(screen.getByRole('button', { name: 'Aceptar' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ese cupo ya fue ocupado. Elige otro.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('aplica los filtros de tipo y estado', async () => {
    const user = userEvent.setup();
    renderRequests();

    await screen.findByText('De Carlos Ruiz');
    await user.selectOptions(screen.getByLabelText('Tipo'), 'match');
    await user.selectOptions(screen.getByLabelText('Estado'), 'accepted');

    await waitFor(() => {
      expect(listRequests).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'match', state: 'accepted' }),
      );
    });
  });

  it('muestra el estado vacío cuando no hay solicitudes', async () => {
    listRequests.mockResolvedValue({
      requests: [],
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    renderRequests();

    expect(
      await screen.findByText('No hay solicitudes en esta bandeja.'),
    ).toBeInTheDocument();
  });
});
