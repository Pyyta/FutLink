import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';
import { HomePage } from './HomePage';

function renderHome(
  user = makeProfile({
    matchsPlayed: 12,
    positions: [
      { id: 1, title: 'arquera' },
      { id: 2, title: 'defensa' },
    ],
    rating: { average: 4.5, count: 2 },
  }),
) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/buscar" element={<div>Buscar destino</div>} />
      <Route path="/perfil/editar" element={<div>Editar destino</div>} />
      <Route path="/jugadores/:id" element={<div>Perfil público destino</div>} />
      <Route path="/solicitudes" element={<div>Solicitudes destino</div>} />
      <Route path="/admin" element={<div>Admin destino</div>} />
    </Routes>,
    { route: '/', session: makeSession({ user }) },
  );
}

describe('HomePage', () => {
  it('saluda y muestra el resumen del perfil', () => {
    renderHome();

    expect(
      screen.getByRole('heading', { name: 'Hola, Ana' }),
    ).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Chapinero')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('abre la búsqueda desde el botón principal', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Explorar' }));

    expect(await screen.findByText('Buscar destino')).toBeInTheDocument();
  });

  it('lleva a editar el perfil', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: 'Editar perfil' }));

    expect(await screen.findByText('Editar destino')).toBeInTheDocument();
  });

  it('lleva al perfil público propio', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(
      screen.getByRole('button', { name: 'Ver perfil público' }),
    );

    expect(
      await screen.findByText('Perfil público destino'),
    ).toBeInTheDocument();
  });

  it('abre las solicitudes desde el acceso rápido', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('link', { name: /Solicitudes/ }));

    expect(await screen.findByText('Solicitudes destino')).toBeInTheDocument();
  });

  it('muestra el acceso de administración solo a administradores', () => {
    renderHome(makeProfile({ role: 'admin' }));

    expect(
      screen.getByText('Panel de administración'),
    ).toBeInTheDocument();
  });

  it('oculta el acceso de administración a jugadores', () => {
    renderHome(makeProfile({ role: 'user' }));

    expect(
      screen.queryByText('Panel de administración'),
    ).not.toBeInTheDocument();
  });
});
