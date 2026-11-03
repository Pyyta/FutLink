import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  catalogApi,
  matchesApi,
  usersApi,
} from '../lib/api/endpoints';
import {
  makeMatchListItem,
  makePlayerListItem,
} from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { SearchPage } from './SearchPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    catalogApi: { ...actual.catalogApi, get: vi.fn() },
    matchesApi: { ...actual.matchesApi, search: vi.fn() },
    usersApi: { ...actual.usersApi, search: vi.fn() },
  };
});

const getCatalog = vi.mocked(catalogApi.get);
const searchMatches = vi.mocked(matchesApi.search);
const searchPlayers = vi.mocked(usersApi.search);

function renderSearch() {
  return renderWithProviders(
    <Routes>
      <Route path="/buscar" element={<SearchPage />} />
      <Route path="/partidos/:id" element={<div>Detalle destino</div>} />
      <Route path="/jugadores/:id" element={<div>Perfil destino</div>} />
    </Routes>,
    { route: '/buscar' },
  );
}

describe('SearchPage', () => {
  beforeEach(() => {
    getCatalog.mockResolvedValue({
      positions: [
        { id: 2, title: 'defensa' },
        { id: 3, title: 'mediocampista' },
      ],
      localities: [{ name: 'Chapinero' }, { name: 'Suba' }],
    });
    searchMatches.mockResolvedValue({
      matches: [makeMatchListItem()],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    searchPlayers.mockResolvedValue({
      players: [makePlayerListItem()],
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('carga partidos al entrar y muestra sus datos principales', async () => {
    renderSearch();

    expect(
      await screen.findByRole('heading', { name: 'Chapinero' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 cupo libre')).toBeInTheDocument();
    expect(screen.getByText('defensa · 1/2')).toBeInTheDocument();
    expect(
      screen.getByText('Organiza: Organiza Fútbol'),
    ).toBeInTheDocument();
    expect(searchMatches).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('abre el detalle del partido al tocar un resultado', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.click(
      await screen.findByRole('link', { name: /Chapinero/ }),
    );

    expect(await screen.findByText('Detalle destino')).toBeInTheDocument();
  });

  it('cambia a jugadores y muestra los resultados', async () => {
    const user = userEvent.setup();
    renderSearch();

    await user.click(screen.getByRole('tab', { name: 'Jugadores' }));

    expect(await screen.findByText('Diana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Usaquén')).toBeInTheDocument();
    expect(screen.getByText('4.7 (6)')).toBeInTheDocument();
    expect(searchPlayers).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 10 }),
    );
  });

  it('aplica los filtros de partido al enviar el formulario', async () => {
    const user = userEvent.setup();
    renderSearch();

    await screen.findByRole('heading', { name: 'Chapinero' });

    await user.selectOptions(screen.getByLabelText('Localidad'), 'Suba');
    fireEvent.change(screen.getByLabelText('Fecha'), {
      target: { value: '2026-11-20' },
    });
    await user.selectOptions(screen.getByLabelText('Posición'), '2');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => {
      expect(searchMatches).toHaveBeenLastCalledWith({
        locality: 'Suba',
        date: '2026-11-20',
        positionId: 2,
        page: 1,
        pageSize: 10,
      });
    });
  });

  it('pagina los resultados de partidos', async () => {
    const user = userEvent.setup();
    searchMatches.mockImplementation(async (input) => ({
      matches: [makeMatchListItem()],
      page: input?.page ?? 1,
      pageSize: 10,
      total: 12,
      totalPages: 2,
    }));
    renderSearch();

    await screen.findByRole('heading', { name: 'Chapinero' });
    await user.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => {
      expect(searchMatches).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
      );
    });
    expect(await screen.findByText('Página 2 de 2')).toBeInTheDocument();
  });
});
