export type UserRole = 'user' | 'admin';
export type UserState = 'active' | 'suspended' | 'deleted';
export type ModerationState = 'visible' | 'hidden' | 'deleted';

export interface Position {
  id: number;
  title: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface RatingAuthor {
  id: number;
  name: string | null;
  profilePic: string | null;
}

export interface RatingValue {
  id: number;
  score: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  moderationState: ModerationState;
}

export interface RatingComment {
  id: number;
  author: RatingAuthor | null;
  score: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  locality: string | null;
  profilePic: string | null;
  role: UserRole;
  state: UserState;
  matchsPlayed: number;
  positions: Position[];
  rating: RatingSummary;
  profileCompleted: boolean;
  createdAt: string;
}

export interface PublicProfile {
  id: number;
  name: string | null;
  locality: string | null;
  profilePic: string | null;
  positions: Position[];
  rating: RatingSummary;
  comments: RatingComment[];
  myRating: RatingValue | null;
  phone: string | null;
  phoneVisible: boolean;
}

export interface AuthResult {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: Profile;
}

export interface Catalog {
  positions: Position[];
  localities: { name: string }[];
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface UpdateProfileInput {
  name: string;
  phone: string;
  locality: string;
  positionIds: number[];
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string;
}

export interface MeResponse {
  user: Profile;
}

export interface PublicProfileResponse {
  profile: PublicProfile;
}

export type MatchState = 'available' | 'confirmed' | 'cancelled';

export interface MatchPosition {
  positionId: number;
  position: string;
  slots: number;
  freeSlots: number;
}

export interface MatchCreator {
  id: number;
  name: string | null;
  profilePic: string | null;
}

export interface MatchListItem {
  id: number;
  locality: string;
  matchDate: string;
  modality: string | null;
  description: string | null;
  state: MatchState;
  totalSpots: number;
  freeSpots: number;
  positions: MatchPosition[];
  creator: MatchCreator;
  isOwner: boolean;
  distanceMeters: number | null;
}

export interface MatchVacancy {
  id: number;
  positionId: number;
  position: string;
  occupied: boolean;
}

export interface MatchDetail extends MatchListItem {
  vacancies: MatchVacancy[];
  createdAt: string;
  cancelledAt: string | null;
  canCancel: boolean;
}

export interface MatchSearchInput {
  locality?: string | undefined;
  date?: string | undefined;
  positionId?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
}

export interface MatchSearchResponse {
  matches: MatchListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MatchDetailResponse {
  match: MatchDetail;
}

export interface PlayerListItem {
  id: number;
  name: string | null;
  locality: string | null;
  profilePic: string | null;
  positions: Position[];
  rating: RatingSummary;
}

export interface PlayerSearchInput {
  name?: string | undefined;
  locality?: string | undefined;
  positionId?: number | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface PlayerSearchResponse {
  players: PlayerListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type RequestType = 'match' | 'player';
export type RequestState = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type RequestBox = 'sent' | 'received';
export type RequestAction = 'accept' | 'reject' | 'cancel';

export interface RequestParty {
  id: number;
  name: string | null;
  profilePic: string | null;
  locality: string | null;
  rating: RatingSummary;
}

export interface RequestMatch {
  id: number;
  matchDate: string;
  locality: string;
  position: string | null;
  state: MatchState;
}

export interface RequestDto {
  id: number;
  type: RequestType;
  state: RequestState;
  sender: RequestParty;
  receiver: RequestParty;
  match: RequestMatch | null;
  direction: 'sent' | 'received';
  canRespond: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
}

export type CreateRequestInput =
  | { type: 'match'; vacancyId: number }
  | { type: 'player'; targetUserId: number };

export interface RequestResponse {
  request: RequestDto;
}

export interface RequestListInput {
  box?: RequestBox | undefined;
  type?: RequestType | undefined;
  state?: RequestState | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface RequestListResponse {
  requests: RequestDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface RateUserInput {
  score: number;
  comment?: string | undefined;
}

export interface RateUserResponse {
  rating: RatingValue;
  summary: RatingSummary;
}

export type NotificationType =
  | 'request_accepted'
  | 'request_cancelled'
  | 'match_cancelled'
  | 'content_hidden'
  | 'content_deleted';

export type NotificationStatus = 'unread' | 'all';

export interface NotificationActor {
  id: number;
  name: string | null;
  profilePic: string | null;
}

export interface NotificationRequest {
  id: number;
  type: RequestType;
}

export interface NotificationMatch {
  id: number;
  matchDate: string;
  locality: string;
}

export interface NotificationContent {
  type: 'match' | 'comment';
  id: number;
}

export interface NotificationDto {
  id: number;
  type: NotificationType;
  readAt: string | null;
  createdAt: string;
  actor: NotificationActor | null;
  request: NotificationRequest | null;
  match: NotificationMatch | null;
  content: NotificationContent | null;
}

export interface NotificationListInput {
  status?: NotificationStatus | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface NotificationListResponse {
  notifications: NotificationDto[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MarkNotificationReadResponse {
  notification: NotificationDto;
  unreadCount: number;
}

export interface AdminUserListItem {
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

export interface AdminUserDetail extends AdminUserListItem {
  positions: Position[];
  rating: RatingSummary;
}

export interface AdminUserListInput {
  search?: string | undefined;
  state?: UserState | undefined;
  role?: UserRole | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface AdminUserListResponse {
  users: AdminUserListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserResponse {
  user: AdminUserDetail;
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

export interface DeleteAdminUserResponse {
  userId: number;
  state: 'deleted';
  cancelledRequests: number;
  cancelledMatches: number;
  notifiedUsers: number;
}

export type AdminContentTypeFilter = 'all' | 'match' | 'comment';
export type AdminModerationFilter = 'all' | ModerationState;

export interface AdminContentAuthor {
  id: number;
  name: string | null;
}

export interface AdminMatchContent {
  type: 'match';
  id: number;
  author: AdminContentAuthor;
  createdAt: string;
  moderationState: ModerationState;
  matchState: MatchState;
  matchDate: string;
  locality: string;
  modality: string | null;
  description: string | null;
}

export interface AdminCommentContent {
  type: 'comment';
  id: number;
  author: AdminContentAuthor | null;
  player: AdminContentAuthor;
  createdAt: string;
  moderationState: ModerationState;
  score: number;
  comment: string | null;
}

export type AdminContent = AdminMatchContent | AdminCommentContent;

export interface AdminContentListInput {
  type?: AdminContentTypeFilter | undefined;
  state?: AdminModerationFilter | undefined;
  search?: string | undefined;
  authorId?: number | undefined;
  from?: string | undefined;
  to?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface AdminContentListResponse {
  items: AdminContent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UpdateAdminMatchInput {
  moderationState?: ModerationState | undefined;
  matchDate?: string | undefined;
  locality?: string | undefined;
  modality?: string | null | undefined;
  description?: string | null | undefined;
}

export interface UpdateAdminCommentInput {
  moderationState?: ModerationState | undefined;
  score?: number | undefined;
  comment?: string | null | undefined;
}

export interface AdminContentResponse<T extends AdminContent = AdminContent> {
  content: T;
}

export type ReportType = 'users' | 'matches' | 'requests';

export interface AdminReport {
  id: number;
  type: ReportType;
  periodStart: string;
  periodEnd: string;
  rowCount: number;
  generatedBy: { id: number; name: string | null } | null;
  createdAt: string;
}

export interface AdminReportListInput {
  type?: ReportType | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

export interface AdminReportListResponse {
  reports: AdminReport[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface GenerateAdminReportInput {
  type: ReportType;
  from: string;
  to: string;
}

export interface AdminReportResponse {
  report: AdminReport;
}

export interface AdminRatingsConfig {
  minScore: number;
  maxScore: number;
  requireAcceptedRequest: boolean;
}

export interface AdminConfig {
  ratings: AdminRatingsConfig;
  notifications: { enabled: boolean };
  positions: Position[];
  localities: { id: number; name: string }[];
}

export interface AdminConfigResponse {
  config: AdminConfig;
}

export interface UpdateAdminRatingsInput {
  minScore?: number | undefined;
  maxScore?: number | undefined;
  requireAcceptedRequest?: boolean | undefined;
}

export interface AdminRatingsResponse {
  ratings: AdminRatingsConfig;
}

export interface AdminNotificationsResponse {
  notifications: { enabled: boolean };
}

export interface AdminPositionResponse {
  position: Position;
}

export interface AdminLocalityResponse {
  locality: { id: number; name: string };
}
