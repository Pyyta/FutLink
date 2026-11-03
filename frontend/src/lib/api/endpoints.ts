import { apiRequest } from './client';
import type {
  AdminCommentContent,
  AdminConfigResponse,
  AdminContentListInput,
  AdminContentListResponse,
  AdminContentResponse,
  AdminLocalityResponse,
  AdminMatchContent,
  AdminNotificationsResponse,
  AdminPositionResponse,
  AdminRatingsResponse,
  AdminReportListInput,
  AdminReportListResponse,
  AdminReportResponse,
  AdminUserListInput,
  AdminUserListResponse,
  AdminUserResponse,
  AuthResult,
  Catalog,
  CreateAdminUserInput,
  CreateRequestInput,
  DeleteAdminUserResponse,
  GenerateAdminReportInput,
  LoginInput,
  MatchDetailResponse,
  MatchSearchInput,
  MatchSearchResponse,
  MeResponse,
  MarkNotificationReadResponse,
  MessageResponse,
  NotificationListInput,
  NotificationListResponse,
  PlayerSearchInput,
  PlayerSearchResponse,
  PublicProfileResponse,
  RateUserInput,
  RateUserResponse,
  RegisterInput,
  RequestListInput,
  RequestListResponse,
  RequestResponse,
  ResetPasswordInput,
  UpdateAdminCommentInput,
  UpdateAdminMatchInput,
  UpdateAdminRatingsInput,
  UpdateAdminUserInput,
  UpdateProfileInput,
} from './types';

function buildQuery(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

export const authApi = {
  login(input: LoginInput): Promise<AuthResult> {
    return apiRequest<AuthResult>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
    });
  },

  register(input: RegisterInput): Promise<AuthResult> {
    return apiRequest<AuthResult>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
  },

  logout(refreshToken: string): Promise<void> {
    return apiRequest<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      auth: false,
    });
  },

  forgotPassword(email: string): Promise<MessageResponse> {
    return apiRequest<MessageResponse>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
      auth: false,
    });
  },

  resetPassword(input: ResetPasswordInput): Promise<MessageResponse> {
    return apiRequest<MessageResponse>('/auth/reset-password', {
      method: 'POST',
      body: input,
      auth: false,
    });
  },
};

export const meApi = {
  get(): Promise<MeResponse> {
    return apiRequest<MeResponse>('/me');
  },

  updateProfile(input: UpdateProfileInput): Promise<MeResponse> {
    return apiRequest<MeResponse>('/me/profile', {
      method: 'PUT',
      body: input,
    });
  },
};

export const catalogApi = {
  get(): Promise<Catalog> {
    return apiRequest<Catalog>('/catalog', { auth: false });
  },
};

export const usersApi = {
  get(id: number): Promise<PublicProfileResponse> {
    return apiRequest<PublicProfileResponse>(`/users/${id}`);
  },

  search(input: PlayerSearchInput = {}): Promise<PlayerSearchResponse> {
    return apiRequest<PlayerSearchResponse>(
      `/users${buildQuery({
        name: input.name,
        locality: input.locality,
        positionId: input.positionId,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    );
  },

  rate(id: number, input: RateUserInput): Promise<RateUserResponse> {
    return apiRequest<RateUserResponse>(`/users/${id}/rating`, {
      method: 'PUT',
      body: input,
    });
  },
};

export const matchesApi = {
  search(input: MatchSearchInput = {}): Promise<MatchSearchResponse> {
    return apiRequest<MatchSearchResponse>(
      `/matches${buildQuery({
        locality: input.locality,
        date: input.date,
        positionId: input.positionId,
        page: input.page,
        pageSize: input.pageSize,
        latitude: input.latitude,
        longitude: input.longitude,
      })}`,
    );
  },

  get(id: number): Promise<MatchDetailResponse> {
    return apiRequest<MatchDetailResponse>(`/matches/${id}`);
  },
};

export const requestsApi = {
  create(input: CreateRequestInput): Promise<RequestResponse> {
    return apiRequest<RequestResponse>('/requests', {
      method: 'POST',
      body: input,
    });
  },

  list(input: RequestListInput = {}): Promise<RequestListResponse> {
    return apiRequest<RequestListResponse>(
      `/requests${buildQuery({
        box: input.box,
        type: input.type,
        state: input.state,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    );
  },

  accept(id: number): Promise<RequestResponse> {
    return apiRequest<RequestResponse>(`/requests/${id}/accept`, {
      method: 'PATCH',
    });
  },

  reject(id: number): Promise<RequestResponse> {
    return apiRequest<RequestResponse>(`/requests/${id}/reject`, {
      method: 'PATCH',
    });
  },

  cancel(id: number): Promise<RequestResponse> {
    return apiRequest<RequestResponse>(`/requests/${id}/cancel`, {
      method: 'PATCH',
    });
  },
};

export const notificationsApi = {
  list(input: NotificationListInput = {}): Promise<NotificationListResponse> {
    return apiRequest<NotificationListResponse>(
      `/notifications${buildQuery({
        status: input.status,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    );
  },

  markRead(id: number): Promise<MarkNotificationReadResponse> {
    return apiRequest<MarkNotificationReadResponse>(
      `/notifications/${id}/read`,
      { method: 'PATCH' },
    );
  },
};

export const adminApi = {
  listUsers(input: AdminUserListInput = {}): Promise<AdminUserListResponse> {
    return apiRequest<AdminUserListResponse>(
      `/admin/users${buildQuery({
        search: input.search,
        state: input.state,
        role: input.role,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    );
  },

  getUser(id: number): Promise<AdminUserResponse> {
    return apiRequest<AdminUserResponse>(`/admin/users/${id}`);
  },

  createUser(input: CreateAdminUserInput): Promise<AdminUserResponse> {
    return apiRequest<AdminUserResponse>('/admin/users', {
      method: 'POST',
      body: input,
    });
  },

  updateUser(
    id: number,
    input: UpdateAdminUserInput,
  ): Promise<AdminUserResponse> {
    return apiRequest<AdminUserResponse>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: input,
    });
  },

  deleteUser(id: number): Promise<DeleteAdminUserResponse> {
    return apiRequest<DeleteAdminUserResponse>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  },

  listContents(
    input: AdminContentListInput = {},
  ): Promise<AdminContentListResponse> {
    return apiRequest<AdminContentListResponse>(
      `/admin/contents${buildQuery({
        type: input.type,
        state: input.state,
        search: input.search,
        authorId: input.authorId,
        from: input.from,
        to: input.to,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    );
  },

  updateMatchContent(
    id: number,
    input: UpdateAdminMatchInput,
  ): Promise<AdminContentResponse<AdminMatchContent>> {
    return apiRequest<AdminContentResponse<AdminMatchContent>>(
      `/admin/contents/matches/${id}`,
      { method: 'PATCH', body: input },
    );
  },

  updateCommentContent(
    id: number,
    input: UpdateAdminCommentInput,
  ): Promise<AdminContentResponse<AdminCommentContent>> {
    return apiRequest<AdminContentResponse<AdminCommentContent>>(
      `/admin/contents/comments/${id}`,
      { method: 'PATCH', body: input },
    );
  },

  listReports(
    input: AdminReportListInput = {},
  ): Promise<AdminReportListResponse> {
    return apiRequest<AdminReportListResponse>(
      `/admin/reports${buildQuery({
        type: input.type,
        page: input.page,
        pageSize: input.pageSize,
      })}`,
    );
  },

  generateReport(input: GenerateAdminReportInput): Promise<AdminReportResponse> {
    return apiRequest<AdminReportResponse>('/admin/reports', {
      method: 'POST',
      body: input,
    });
  },

  exportReport(id: number): Promise<string> {
    return apiRequest<string>(`/admin/reports/${id}/export`);
  },

  getConfig(): Promise<AdminConfigResponse> {
    return apiRequest<AdminConfigResponse>('/admin/config');
  },

  updateRatings(
    input: UpdateAdminRatingsInput,
  ): Promise<AdminRatingsResponse> {
    return apiRequest<AdminRatingsResponse>('/admin/config/ratings', {
      method: 'PUT',
      body: input,
    });
  },

  updateNotifications(enabled: boolean): Promise<AdminNotificationsResponse> {
    return apiRequest<AdminNotificationsResponse>(
      '/admin/config/notifications',
      { method: 'PUT', body: { enabled } },
    );
  },

  createPosition(title: string): Promise<AdminPositionResponse> {
    return apiRequest<AdminPositionResponse>('/admin/config/positions', {
      method: 'POST',
      body: { title },
    });
  },

  updatePosition(id: number, title: string): Promise<AdminPositionResponse> {
    return apiRequest<AdminPositionResponse>(`/admin/config/positions/${id}`, {
      method: 'PATCH',
      body: { title },
    });
  },

  deletePosition(id: number): Promise<{ deleted: true }> {
    return apiRequest<{ deleted: true }>(`/admin/config/positions/${id}`, {
      method: 'DELETE',
    });
  },

  createLocality(name: string): Promise<AdminLocalityResponse> {
    return apiRequest<AdminLocalityResponse>('/admin/config/localities', {
      method: 'POST',
      body: { name },
    });
  },

  updateLocality(id: number, name: string): Promise<AdminLocalityResponse> {
    return apiRequest<AdminLocalityResponse>(`/admin/config/localities/${id}`, {
      method: 'PATCH',
      body: { name },
    });
  },

  deleteLocality(id: number): Promise<{ deleted: true }> {
    return apiRequest<{ deleted: true }>(`/admin/config/localities/${id}`, {
      method: 'DELETE',
    });
  },
};
