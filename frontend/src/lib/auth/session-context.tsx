import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { authApi, meApi } from '../api/endpoints';
import { ApiError, SESSION_EXPIRED_EVENT } from '../api/client';
import { useToast } from '../../components/ui/Toast';
import type {
  LoginInput,
  Profile,
  RegisterInput,
  UpdateProfileInput,
} from '../api/types';
import { clearSession, readSession, writeSession } from './storage';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionContextValue {
  status: SessionStatus;
  user: Profile | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  profileCompleted: boolean;
  signIn(input: LoginInput): Promise<Profile>;
  signUp(input: RegisterInput): Promise<Profile>;
  signOut(): Promise<void>;
  refreshUser(): Promise<Profile>;
  updateProfile(input: UpdateProfileInput): Promise<Profile>;
}

interface SessionState {
  status: SessionStatus;
  user: Profile | null;
}

export const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession debe usarse dentro de SessionProvider');
  }
  return context;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();
  const [state, setState] = useState<SessionState>(() =>
    readSession()
      ? { status: 'loading', user: null }
      : { status: 'anonymous', user: null },
  );

  useEffect(() => {
    const handleExpired = () => {
      setState({ status: 'anonymous', user: null });
      queryClient.clear();
      toast.error(t('session.expired'));
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, [queryClient, t, toast]);

  useEffect(() => {
    if (!readSession()) {
      setState({ status: 'anonymous', user: null });
      return;
    }

    let active = true;

    meApi
      .get()
      .then(({ user }) => {
        if (active) setState({ status: 'authenticated', user });
      })
      .catch((error: unknown) => {
        if (!active) return;

        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          clearSession();
        }

        setState({ status: 'anonymous', user: null });
      });

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const result = await authApi.login(input);
    writeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    setState({ status: 'authenticated', user: result.user });
    return result.user;
  }, []);

  const signUp = useCallback(async (input: RegisterInput) => {
    const result = await authApi.register(input);
    writeSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    setState({ status: 'authenticated', user: result.user });
    return result.user;
  }, []);

  const signOut = useCallback(async () => {
    const session = readSession();

    clearSession();
    setState({ status: 'anonymous', user: null });
    queryClient.clear();

    if (session) {
      try {
        await authApi.logout(session.refreshToken);
      } catch {
        // La sesión local ya quedó cerrada aunque el servidor no responda.
      }
    }
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    const { user } = await meApi.get();
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const updateProfile = useCallback(async (input: UpdateProfileInput) => {
    const { user } = await meApi.updateProfile(input);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      status: state.status,
      user: state.user,
      isAuthenticated: state.status === 'authenticated',
      isAdmin: state.user?.role === 'admin',
      profileCompleted: state.user?.profileCompleted === true,
      signIn,
      signUp,
      signOut,
      refreshUser,
      updateProfile,
    }),
    [
      refreshUser,
      signIn,
      signOut,
      signUp,
      state.status,
      state.user,
      updateProfile,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
