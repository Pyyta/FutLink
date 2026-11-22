import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { AdminPage } from '../pages/AdminPage';
import { CompleteProfilePage } from '../pages/CompleteProfilePage';
import { CreateMatchPage } from '../pages/CreateMatchPage';
import { EditProfilePage } from '../pages/EditProfilePage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MatchDetailPage } from '../pages/MatchDetailPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PublicProfilePage } from '../pages/PublicProfilePage';
import { RecoverPage } from '../pages/RecoverPage';
import { RegisterPage } from '../pages/RegisterPage';
import { RequestsPage } from '../pages/RequestsPage';
import { SearchPage } from '../pages/SearchPage';
import { ServerSettingsPage } from '../pages/ServerSettingsPage';
import { isApiServerConfigured } from '../lib/api/server-config';
import {
  GuestOnly,
  RequireAuth,
  RequireCompleteProfile,
  RequireRole,
} from './guards';

export function AppRoutes() {
  if (!isApiServerConfigured()) {
    return (
      <Routes>
        <Route path="/servidor" element={<ServerSettingsPage />} />
        <Route path="*" element={<Navigate to="/servidor" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registro" element={<RegisterPage />} />
        <Route path="/recuperar" element={<RecoverPage />} />
      </Route>

      <Route path="/servidor" element={<ServerSettingsPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/perfil/completar" element={<CompleteProfilePage />} />

        <Route element={<RequireCompleteProfile />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="buscar" element={<SearchPage />} />
            <Route path="solicitudes" element={<RequestsPage />} />
            <Route path="notificaciones" element={<NotificationsPage />} />
            <Route path="perfil" element={<ProfilePage />} />
            <Route path="perfil/editar" element={<EditProfilePage />} />
            <Route path="partidos/crear" element={<CreateMatchPage />} />
            <Route path="jugadores/:id" element={<PublicProfilePage />} />
            <Route path="partidos/:id" element={<MatchDetailPage />} />
            <Route path="sin-acceso" element={<ForbiddenPage />} />

            <Route element={<RequireRole role="admin" />}>
              <Route path="admin" element={<AdminPage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
