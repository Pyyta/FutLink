import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LoadingScreen } from '../components/layout/LoadingScreen';
import { useSession } from '../lib/auth/session-context';
import type { UserRole } from '../lib/api/types';

export function RequireAuth() {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'loading') return <LoadingScreen />;

  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <Outlet />;
}

export function RequireCompleteProfile() {
  const { status, user, profileCompleted } = useSession();

  if (status === 'loading') return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!profileCompleted) return <Navigate to="/perfil/completar" replace />;

  return <Outlet />;
}

export function RequireRole({ role }: { role: UserRole }) {
  const { status, user } = useSession();

  if (status === 'loading') return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/sin-acceso" replace />;

  return <Outlet />;
}

export function GuestOnly() {
  const { status, user, profileCompleted } = useSession();

  if (status === 'loading') return <LoadingScreen />;

  if (user) {
    return <Navigate to={profileCompleted ? '/' : '/perfil/completar'} replace />;
  }

  return <Outlet />;
}
