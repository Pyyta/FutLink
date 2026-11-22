import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { catalogApi, matchesApi } from '../lib/api/endpoints';
import { makeMatchDetail } from '../test/fixtures';
import { renderWithProviders } from '../test/render';
import { CreateMatchPage } from './CreateMatchPage';

vi.mock('../lib/api/endpoints', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/api/endpoints')>();

  return {
    ...actual,
    catalogApi: { ...actual.catalogApi, get: vi.fn() },
    matchesApi: { ...actual.matchesApi, create: vi.fn() },
  };
});

const getCatalog = vi.mocked(catalogApi.get);
const createMatch = vi.mocked(matchesApi.create);

function renderCreateMatch() {
  return renderWithProviders(
    <Routes>
      <Route path="/partidos/crear" element={<CreateMatchPage />} />
      <Route path="/partidos/:id" element={<div>Partido publicado</div>} />
      <Route path="/perfil" element={<div>Perfil destino</div>} />
    </Routes>,
    { route: '/partidos/crear' },
  );
}

describe('CreateMatchPage', () => {
  beforeEach(() => {
    getCatalog.mockResolvedValue({
      positions: [
        { id: 1, title: 'arquera' },
        { id: 2, title: 'defensa' },
      ],
      localities: [{ name: 'Chapinero' }, { name: 'Suba' }],
    });
    createMatch.mockResolvedValue({ match: makeMatchDetail({ id: 99 }) });
  });

  it('publica las vacantes por posición y abre el partido creado', async () => {
    const user = userEvent.setup();
    renderCreateMatch();
    await screen.findByRole('option', { name: 'Suba' });

    fireEvent.change(screen.getByLabelText(/^Fecha y hora \(Bogotá\)/), {
      target: { value: '2035-05-10T19:30' },
    });
    await user.selectOptions(screen.getByLabelText(/^Localidad/), 'Suba');
    await user.type(screen.getByLabelText('Modalidad'), 'fútbol 7');
    await user.type(
      screen.getByLabelText('Descripción'),
      'Partido amistoso para completar el equipo.',
    );
    fireEvent.change(screen.getByLabelText(/^Cupos/), {
      target: { value: '2' },
    });
    await user.click(screen.getByRole('button', { name: 'Agregar posición' }));
    await user.selectOptions(screen.getAllByLabelText(/^Posición/)[1]!, '2');

    await user.click(screen.getByRole('button', { name: 'Publicar partido' }));

    await waitFor(() => {
      expect(createMatch).toHaveBeenCalledWith({
        matchDate: '2035-05-10T19:30:00-05:00',
        locality: 'Suba',
        modality: 'fútbol 7',
        description: 'Partido amistoso para completar el equipo.',
        positions: [
          { positionId: 1, slots: 2 },
          { positionId: 2, slots: 1 },
        ],
      });
    });
    expect(await screen.findByText('Partido publicado')).toBeInTheDocument();
  });
});
