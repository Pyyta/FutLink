import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './routes';
import { makeProfile } from '../test/fixtures';
import { makeSession, renderWithProviders } from '../test/render';

describe('rutas protegidas', () => {
  it('redirige al login cuando no hay sesión', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/',
      session: makeSession({ status: 'anonymous', user: null }),
    });

    expect(
      screen.getByRole('heading', { name: 'Inicia sesión' }),
    ).toBeInTheDocument();
  });

  it('redirige a completar el perfil cuando falta el perfil', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/',
      session: makeSession({
        user: makeProfile({ profileCompleted: false }),
      }),
    });

    expect(
      screen.getByRole('heading', { name: 'Completa tu perfil' }),
    ).toBeInTheDocument();
  });

  it('muestra el inicio con sesión y perfil completos', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/',
      session: makeSession({ user: makeProfile() }),
    });

    expect(
      screen.getByRole('heading', { name: 'Hola, Ana' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument();
  });

  it('bloquea el panel de administración a un usuario normal', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/admin',
      session: makeSession({ user: makeProfile({ role: 'user' }) }),
    });

    expect(
      screen.getByRole('heading', { name: 'Acceso restringido' }),
    ).toBeInTheDocument();
  });

  it('permite el panel de administración a un administrador', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/admin',
      session: makeSession({ user: makeProfile({ role: 'admin' }) }),
    });

    expect(
      screen.getByRole('heading', { name: 'Administración' }),
    ).toBeInTheDocument();
  });

  it('saca de las pantallas de acceso a quien ya tiene sesión', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/login',
      session: makeSession({ user: makeProfile() }),
    });

    expect(
      screen.getByRole('heading', { name: 'Hola, Ana' }),
    ).toBeInTheDocument();
  });

  it('muestra la navegación principal en el layout móvil', () => {
    renderWithProviders(<AppRoutes />, {
      route: '/',
      session: makeSession({ user: makeProfile() }),
    });

    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buscar' })).toHaveAttribute(
      'href',
      '/buscar',
    );
  });
});
