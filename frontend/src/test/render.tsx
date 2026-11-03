import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { i18n } from '../i18n';
import {
  SessionContext,
  type SessionContextValue,
} from '../lib/auth/session-context';
import { makeProfile } from './fixtures';

export interface RenderOptions {
  route?: string;
  session?: SessionContextValue;
}

export function makeSession(
  overrides: Partial<SessionContextValue> = {},
): SessionContextValue {
  const hasUser = Object.prototype.hasOwnProperty.call(overrides, 'user');
  const user = hasUser ? (overrides.user ?? null) : makeProfile();
  const status =
    overrides.status ?? (user ? 'authenticated' : 'anonymous');

  return {
    status,
    user,
    isAuthenticated: status === 'authenticated',
    isAdmin: user?.role === 'admin',
    profileCompleted: user?.profileCompleted === true,
    signIn: async () => user ?? makeProfile(),
    signUp: async () => user ?? makeProfile(),
    signOut: async () => undefined,
    refreshUser: async () => user ?? makeProfile(),
    updateProfile: async () => user ?? makeProfile(),
    ...overrides,
  };
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', session = makeSession() }: RenderOptions = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastProvider>
          <SessionContext.Provider value={session}>
            <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
          </SessionContext.Provider>
        </ToastProvider>
      </I18nextProvider>
    </QueryClientProvider>,
  );
}
