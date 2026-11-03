import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsApi } from '../lib/api/endpoints';
import { makeNotification } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { NotificationsPage } from './NotificationsPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    notificationsApi: {
      ...actual.notificationsApi,
      list: vi.fn(),
      markRead: vi.fn(),
    },
  };
});

const listNotifications = vi.mocked(notificationsApi.list);
const markRead = vi.mocked(notificationsApi.markRead);

function renderNotifications() {
  return renderWithProviders(<NotificationsPage />, {
    route: '/notificaciones',
  });
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    listNotifications.mockResolvedValue({
      notifications: [makeNotification()],
      unreadCount: 1,
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    markRead.mockResolvedValue({
      notification: makeNotification({
        readAt: '2026-11-02T16:00:00.000Z',
      }),
      unreadCount: 0,
    });
  });

  it('muestra las notificaciones sin leer y las marca como leídas', async () => {
    const user = userEvent.setup();
    renderNotifications();

    expect(
      await screen.findByText(
        'Carlos Ruiz aceptó tu solicitud de jugador.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('1 sin leer')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Marcar como leída' }),
    );

    await waitFor(() => {
      expect(markRead).toHaveBeenCalledWith(30);
    });
    expect(
      await screen.findByText('Notificación marcada como leída.'),
    ).toBeInTheDocument();
  });

  it('consulta todas las notificaciones al cambiar de pestaña', async () => {
    const user = userEvent.setup();
    renderNotifications();

    await screen.findByText('Carlos Ruiz aceptó tu solicitud de jugador.');
    await user.click(screen.getByRole('tab', { name: 'Todas' }));

    await waitFor(() => {
      expect(listNotifications).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'all' }),
      );
    });
  });

  it('muestra el estado vacío de notificaciones sin leer', async () => {
    listNotifications.mockResolvedValue({
      notifications: [],
      unreadCount: 0,
      page: 1,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    renderNotifications();

    expect(
      await screen.findByText('No tienes notificaciones sin leer.'),
    ).toBeInTheDocument();
  });

  it('enlaza la cancelación de un partido con su detalle', async () => {
    listNotifications.mockResolvedValue({
      notifications: [
        makeNotification({
          type: 'match_cancelled',
          actor: { id: 5, name: 'Organizador Fase Catorce', profilePic: null },
          request: null,
          match: {
            id: 541,
            matchDate: '2026-11-20T20:00:00.000Z',
            locality: 'Teusaquillo',
          },
        }),
      ],
      unreadCount: 1,
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    renderNotifications();

    expect(
      await screen.findByText(
        /Organizador Fase Catorce canceló el partido del .* en Teusaquillo\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Ver partido' }),
    ).toHaveAttribute('href', '/partidos/541');
  });
});
