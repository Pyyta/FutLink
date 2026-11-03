import type { ModerationState } from '../../shared/moderation.js';

export type UserRole = 'user' | 'admin';
export type UserState = 'active' | 'suspended' | 'deleted';

/** Datos mínimos que viajan en la petición autenticada. */
export interface SessionUser {
  id: number;
  email: string;
  role: UserRole;
  state: UserState;
  profileCompletedAt: Date | null;
}

export interface PositionDto {
  id: number;
  title: string;
}

export interface RatingSummary {
  average: number | null;
  count: number;
}

export interface RatingAuthorDto {
  id: number;
  name: string | null;
  profilePic: string | null;
}

export interface RatingValueDto {
  id: number;
  score: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  moderationState: ModerationState;
}

export interface RatingCommentDto {
  id: number;
  author: RatingAuthorDto | null;
  score: number;
  comment: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileDto {
  id: number;
  email: string;
  name: string | null;
  phone: string | null;
  locality: string | null;
  profilePic: string | null;
  role: UserRole;
  state: UserState;
  matchsPlayed: number;
  positions: PositionDto[];
  rating: RatingSummary;
  profileCompleted: boolean;
  createdAt: string;
}

export interface PublicProfileDto {
  id: number;
  name: string | null;
  locality: string | null;
  profilePic: string | null;
  positions: PositionDto[];
  rating: RatingSummary;
  comments: RatingCommentDto[];
  myRating: RatingValueDto | null;
  phone: string | null;
  phoneVisible: boolean;
}

export interface AuthResult {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ProfileDto;
}

export interface RegisterInput {
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

export interface UpdateProfileInput {
  name: string;
  phone: string;
  locality: string;
  positionIds: number[];
}
