import type {
  PositionDto,
  RatingSummary,
  UserRole,
  UserState,
} from '../auth/auth.types.js';
import type { ModerationState } from '../../shared/moderation.js';

export type AdminContentTypeFilter = 'all' | 'match' | 'comment';
export type AdminModerationFilter = ModerationState | 'all';
export type ReportType = 'users' | 'matches' | 'requests';

export interface AdminUserListItemDto {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  locality: string | null;
  role: UserRole;
  state: UserState;
  matchsPlayed: number;
  profilePic: string | null;
  profileCompleted: boolean;
  createdAt: string;
}

export interface AdminUserDetailDto extends AdminUserListItemDto {
  positions: PositionDto[];
  rating: RatingSummary;
}

export interface AdminUserPageDto {
  users: AdminUserListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListAdminUsersInput {
  search: string | null;
  state: UserState | null;
  role: UserRole | null;
  page: number;
  pageSize: number;
}

export interface CreateAdminUserInput {
  email: string;
  password: string;
  name: string;
  phone: string;
  locality: string;
  positionIds: number[];
  role: UserRole;
}

export interface UpdateAdminUserInput {
  email?: string | undefined;
  password?: string | undefined;
  name?: string | undefined;
  phone?: string | undefined;
  locality?: string | undefined;
  positionIds?: number[] | undefined;
  role?: UserRole | undefined;
  state?: 'active' | 'suspended' | undefined;
}

export interface DeleteAdminUserResultDto {
  userId: number;
  state: 'deleted';
  cancelledRequests: number;
  cancelledMatches: number;
  notifiedUsers: number;
}

export interface AdminContentAuthorDto {
  id: number;
  name: string | null;
}

export interface AdminContentPlayerDto {
  id: number;
  name: string | null;
}

export interface AdminMatchContentDto {
  type: 'match';
  id: number;
  author: AdminContentAuthorDto;
  createdAt: string;
  moderationState: ModerationState;
  matchState: 'available' | 'confirmed' | 'cancelled';
  matchDate: string;
  locality: string;
  modality: string | null;
  description: string | null;
}

export interface AdminCommentContentDto {
  type: 'comment';
  id: number;
  author: AdminContentAuthorDto | null;
  player: AdminContentPlayerDto;
  createdAt: string;
  moderationState: ModerationState;
  score: number;
  comment: string | null;
}

export type AdminContentDto = AdminMatchContentDto | AdminCommentContentDto;

export interface AdminContentPageDto {
  items: AdminContentDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListAdminContentsInput {
  type: 'match' | 'comment' | null;
  state: ModerationState | null;
  search: string | null;
  authorId: number | null;
  from: Date | null;
  to: Date | null;
  page: number;
  pageSize: number;
}

export interface UpdateMatchContentInput {
  moderationState?: ModerationState | undefined;
  matchDate?: Date | undefined;
  locality?: string | undefined;
  modality?: string | null | undefined;
  description?: string | null | undefined;
}

export interface UpdateCommentContentInput {
  moderationState?: ModerationState | undefined;
  score?: number | undefined;
  comment?: string | null | undefined;
}

export interface ReportGeneratedByDto {
  id: number;
  name: string | null;
}

export interface ReportDto {
  id: number;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  rowCount: number;
  generatedBy: ReportGeneratedByDto | null;
  createdAt: string;
}

export interface ReportPageDto {
  reports: ReportDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GenerateReportInput {
  type: ReportType;
  from: Date;
  to: Date;
}

export interface ListReportsInput {
  type: ReportType | null;
  page: number;
  pageSize: number;
}

export interface ReportExportDto {
  report: ReportDto;
  csv: string;
  filename: string;
}

export interface RatingsConfigDto {
  minScore: number;
  maxScore: number;
  requireAcceptedRequest: boolean;
}

export interface NotificationsConfigDto {
  enabled: boolean;
}

export interface AdminConfigDto {
  ratings: RatingsConfigDto;
  notifications: NotificationsConfigDto;
  positions: PositionDto[];
  localities: { id: number; name: string }[];
}

export interface UpdateRatingsConfigInput {
  minScore?: number | undefined;
  maxScore?: number | undefined;
  requireAcceptedRequest?: boolean | undefined;
}

export interface CatalogPositionDto {
  id: number;
  title: string;
}

export interface CatalogLocalityDto {
  id: number;
  name: string;
}
