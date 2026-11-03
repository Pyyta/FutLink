import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../i18n';
import { ApiError } from '../lib/api/client';
import { adminApi } from '../lib/api/endpoints';
import type {
  AdminCommentContent,
  AdminConfigResponse,
  AdminContentListResponse,
  AdminMatchContent,
  AdminReport,
  AdminUserDetail,
  AdminUserListResponse,
} from '../lib/api/types';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import { AdminPage } from './AdminPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getConfig: vi.fn(),
      listUsers: vi.fn(),
      getUser: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deleteUser: vi.fn(),
      listContents: vi.fn(),
      updateMatchContent: vi.fn(),
      updateCommentContent: vi.fn(),
      listReports: vi.fn(),
      generateReport: vi.fn(),
      exportReport: vi.fn(),
      updateRatings: vi.fn(),
      updateNotifications: vi.fn(),
      createPosition: vi.fn(),
      updatePosition: vi.fn(),
      deletePosition: vi.fn(),
      createLocality: vi.fn(),
      updateLocality: vi.fn(),
      deleteLocality: vi.fn(),
    },
  };
});

const createObjectURL = vi.fn(() => 'blob:futlink');
Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  writable: true,
  value: createObjectURL,
});
Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

const configResponse: AdminConfigResponse = {
  config: {
    ratings: { minScore: 1, maxScore: 5, requireAcceptedRequest: false },
    notifications: { enabled: true },
    positions: [
      { id: 1, title: 'arquera' },
      { id: 2, title: 'defensa' },
    ],
    localities: [
      { id: 1, name: 'Chapinero' },
      { id: 2, name: 'Suba' },
    ],
  },
};

const adminUser: AdminUserDetail = {
  id: 2,
  email: 'carlos@example.com',
  name: 'Carlos Ruiz',
  phone: '300 555 0011',
  locality: 'Suba',
  role: 'user',
  state: 'active',
  matchsPlayed: 4,
  profilePic: null,
  profileCompleted: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  positions: [{ id: 2, title: 'defensa' }],
  rating: { average: 4.5, count: 2 },
};

const userListResponse: AdminUserListResponse = {
  users: [adminUser],
  page: 1,
  pageSize: 10,
  total: 1,
  totalPages: 1,
};

const matchContent: AdminMatchContent = {
  type: 'match',
  id: 100,
  author: { id: 2, name: 'Carlos Ruiz' },
  createdAt: '2026-11-01T14:00:00.000Z',
  moderationState: 'visible',
  matchState: 'available',
  matchDate: '2026-11-20T20:00:00.000Z',
  locality: 'Chapinero',
  modality: 'fútbol 7',
  description: 'Partido amistoso entre vecinos.',
};

const commentContent: AdminCommentContent = {
  type: 'comment',
  id: 200,
  author: { id: 3, name: 'Diana Gómez' },
  player: { id: 2, name: 'Carlos Ruiz' },
  createdAt: '2026-10-30T14:00:00.000Z',
  moderationState: 'visible',
  score: 5,
  comment: 'Muy puntual y buen compañero.',
};

const contentListResponse: AdminContentListResponse = {
  items: [matchContent, commentContent],
  page: 1,
  pageSize: 10,
  total: 2,
  totalPages: 1,
};

const report: AdminReport = {
  id: 7,
  type: 'users',
  periodStart: '2026-10-01T05:00:00.000Z',
  periodEnd: '2026-11-02T05:00:00.000Z',
  rowCount: 12,
  generatedBy: { id: 1, name: 'Admin FutLink' },
  createdAt: '2026-11-01T18:00:00.000Z',
};

function renderAdmin(
  session = makeSession({
    user: makeProfile({
      id: 1,
      email: 'admin@example.com',
      name: 'Admin FutLink',
      role: 'admin',
    }),
  }),
) {
  return renderWithProviders(<AdminPage />, { session });
}

async function openTab(name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name }));
  return user;
}

describe('AdminPage', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    createObjectURL.mockReturnValue('blob:futlink');
    await i18n.changeLanguage('es-CO');

    vi.mocked(adminApi.getConfig).mockResolvedValue(configResponse);
    vi.mocked(adminApi.listUsers).mockResolvedValue(userListResponse);
    vi.mocked(adminApi.getUser).mockResolvedValue({ user: adminUser });
    vi.mocked(adminApi.createUser).mockResolvedValue({ user: adminUser });
    vi.mocked(adminApi.updateUser).mockImplementation(async (_id, input) => ({
      user: {
        ...adminUser,
        ...(input.state ? { state: input.state } : {}),
      },
    }));
    vi.mocked(adminApi.deleteUser).mockResolvedValue({
      userId: 2,
      state: 'deleted',
      cancelledRequests: 1,
      cancelledMatches: 1,
      notifiedUsers: 2,
    });
    vi.mocked(adminApi.listContents).mockResolvedValue(contentListResponse);
    vi.mocked(adminApi.updateMatchContent).mockResolvedValue({
      content: matchContent,
    });
    vi.mocked(adminApi.updateCommentContent).mockResolvedValue({
      content: commentContent,
    });
    vi.mocked(adminApi.listReports).mockResolvedValue({
      reports: [report],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    vi.mocked(adminApi.generateReport).mockResolvedValue({ report });
    vi.mocked(adminApi.exportReport).mockResolvedValue(
      '\ufeffnombre\nCarlos Ruiz\n',
    );
    vi.mocked(adminApi.updateRatings).mockResolvedValue({
      ratings: configResponse.config.ratings,
    });
    vi.mocked(adminApi.updateNotifications).mockResolvedValue({
      notifications: { enabled: false },
    });
    vi.mocked(adminApi.createPosition).mockResolvedValue({
      position: { id: 3, title: 'extremo' },
    });
    vi.mocked(adminApi.updatePosition).mockResolvedValue({
      position: { id: 1, title: 'lateral' },
    });
    vi.mocked(adminApi.deletePosition).mockResolvedValue({ deleted: true });
  });

  it('carga la configuración y muestra la lista de usuarios', async () => {
    renderAdmin();

    expect(await screen.findByText('Carlos Ruiz')).toBeInTheDocument();
    expect(screen.getByText('carlos@example.com')).toBeInTheDocument();
    expect(screen.getByText('300 555 0011')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Usuarios' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(adminApi.getConfig).toHaveBeenCalledTimes(1);
    expect(adminApi.listUsers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('filtra usuarios por búsqueda', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await screen.findByText('Carlos Ruiz');
    await user.type(screen.getByLabelText('Buscar'), 'Carlos');
    await user.click(screen.getByRole('button', { name: 'Filtrar' }));

    await waitFor(() => {
      expect(adminApi.listUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Carlos', page: 1 }),
      );
    });
  });

  it('crea un usuario desde el panel', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await screen.findByText('Carlos Ruiz');
    await user.click(screen.getByRole('button', { name: 'Nuevo usuario' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Correo electrónico/),
      'nuevo@example.com',
    );
    await user.type(within(dialog).getByLabelText(/Contraseña/), 'secreto123');
    await user.type(
      within(dialog).getByLabelText(/Nombre completo/),
      'Nuevo Jugador',
    );
    await user.type(
      within(dialog).getByLabelText(/Teléfono/),
      '300 555 0099',
    );
    await user.selectOptions(
      within(dialog).getByLabelText(/Localidad/),
      'Suba',
    );
    await user.click(within(dialog).getByRole('button', { name: 'defensa' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Crear usuario' }),
    );

    await waitFor(() => {
      expect(adminApi.createUser).toHaveBeenCalledWith({
        email: 'nuevo@example.com',
        password: 'secreto123',
        name: 'Nuevo Jugador',
        phone: '300 555 0099',
        locality: 'Suba',
        positionIds: [2],
        role: 'user',
      });
    });
    expect(await screen.findByText('Usuario creado.')).toBeInTheDocument();
  });

  it('suspende un usuario con confirmación', async () => {
    const user = userEvent.setup();
    renderAdmin();

    await screen.findByText('Carlos Ruiz');
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Suspender usuario' }),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );

    await waitFor(() => {
      expect(adminApi.updateUser).toHaveBeenCalledWith(2, {
        state: 'suspended',
      });
    });
    expect(await screen.findByText('Usuario suspendido.')).toBeInTheDocument();
  });

  it('protege la cuenta del administrador actual', async () => {
    vi.mocked(adminApi.listUsers).mockResolvedValue({
      ...userListResponse,
      users: [{ ...adminUser, id: 1, name: 'Admin FutLink' }],
    });
    renderAdmin();

    await screen.findByText('Admin FutLink');
    expect(screen.getByRole('button', { name: 'Suspender' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    expect(
      screen.getByText(
        'No puedes suspender ni eliminar tu propia cuenta.',
      ),
    ).toBeInTheDocument();
  });

  it('oculta un partido desde moderación de contenidos', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openTab('Contenidos');

    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(2);
    await user.click(within(items[0]!).getByRole('button', { name: 'Ocultar' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Ocultar contenido' }),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Confirmar' }),
    );

    await waitFor(() => {
      expect(adminApi.updateMatchContent).toHaveBeenCalledWith(100, {
        moderationState: 'hidden',
      });
    });
    expect(await screen.findByText('Contenido oculto.')).toBeInTheDocument();
  });

  it('edita la localidad de un partido moderado', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openTab('Contenidos');

    const items = await screen.findAllByRole('listitem');
    await user.click(within(items[0]!).getByRole('button', { name: 'Editar' }));

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Editar partido' }),
    ).toBeInTheDocument();
    const locality = within(dialog).getByLabelText(/Localidad/);
    await user.clear(locality);
    await user.type(locality, 'Usaquén');
    await user.click(
      within(dialog).getByRole('button', { name: 'Guardar cambios' }),
    );

    await waitFor(() => {
      expect(adminApi.updateMatchContent).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          locality: 'Usaquén',
          moderationState: 'visible',
        }),
      );
    });
  });

  it('genera un reporte y descarga su CSV', async () => {
    const user = userEvent.setup();
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderAdmin();
    await openTab('Reportes');

    await screen.findByRole('button', { name: 'Descargar CSV' });
    await user.click(screen.getByRole('button', { name: 'Generar reporte' }));

    await waitFor(() => {
      expect(adminApi.generateReport).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'users',
          from: expect.any(String),
          to: expect.any(String),
        }),
      );
    });
    expect(await screen.findByText('Reporte generado.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Descargar CSV' }));
    await waitFor(() => {
      expect(adminApi.exportReport).toHaveBeenCalledWith(7);
    });
    expect(createObjectURL).toHaveBeenCalled();

    anchorClick.mockRestore();
  });

  it('actualiza la escala de calificaciones y las notificaciones', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openTab('Configuración');

    await screen.findByRole('heading', { name: 'Calificaciones' });
    const maxScore = screen.getByLabelText(/Puntaje máximo/);
    await user.clear(maxScore);
    await user.type(maxScore, '6');
    await user.click(
      screen.getByRole('button', { name: 'Guardar calificaciones' }),
    );

    await waitFor(() => {
      expect(adminApi.updateRatings).toHaveBeenCalledWith({
        minScore: 1,
        maxScore: 6,
        requireAcceptedRequest: false,
      });
    });

    const notifications = screen.getByRole('checkbox', {
      name: /Notificaciones activas/,
    });
    await user.click(notifications);

    await waitFor(() => {
      expect(adminApi.updateNotifications).toHaveBeenCalledWith(false);
    });
  });

  it('muestra el error de escala en uso al reducir las calificaciones', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.updateRatings).mockRejectedValue(
      new ApiError(
        409,
        'RATING_SCALE_IN_USE',
        'Hay calificaciones fuera del rango',
      ),
    );
    renderAdmin();
    await openTab('Configuración');

    await screen.findByRole('heading', { name: 'Calificaciones' });
    const maxScore = screen.getByLabelText(/Puntaje máximo/);
    await user.clear(maxScore);
    await user.type(maxScore, '4');
    await user.click(
      screen.getByRole('button', { name: 'Guardar calificaciones' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No puedes reducir la escala porque hay calificaciones fuera del nuevo rango.',
    );
  });

  it('crea, renombra y elimina posiciones del catálogo', async () => {
    const user = userEvent.setup();
    renderAdmin();
    await openTab('Configuración');

    await screen.findByRole('heading', { name: 'Posiciones' });
    await user.click(screen.getByRole('button', { name: 'Nueva posición' }));

    let dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByLabelText(/Nombre de la posición/),
      'extremo',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(adminApi.createPosition).toHaveBeenCalledWith('extremo');
    });

    let positionsCard = screen
      .getByRole('heading', { name: 'Posiciones' })
      .closest('.relative') as HTMLElement;
    await user.click(
      within(positionsCard).getAllByRole('button', { name: 'Renombrar' })[0]!,
    );

    dialog = await screen.findByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/Nombre de la posición/);
    await user.clear(nameInput);
    await user.type(nameInput, 'lateral');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(adminApi.updatePosition).toHaveBeenCalledWith(1, 'lateral');
    });

    positionsCard = screen
      .getByRole('heading', { name: 'Posiciones' })
      .closest('.relative') as HTMLElement;
    await user.click(
      within(positionsCard).getAllByRole('button', { name: 'Eliminar' })[0]!,
    );

    dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('heading', { name: 'Eliminar posición' }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(adminApi.deletePosition).toHaveBeenCalledWith(1);
    });
  });
});
