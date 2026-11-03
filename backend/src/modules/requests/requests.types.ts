import type { RatingSummary } from '../auth/auth.types.js';
import type { MatchState } from '../matches/matches.types.js';

export type RequestType = 'match' | 'player';
export type RequestState = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type RequestBox = 'sent' | 'received';
export type RequestDirection = 'sent' | 'received';

export interface RequestPartyDto {
  id: number;
  name: string | null;
  profilePic: string | null;
  locality: string | null;
  rating: RatingSummary;
}

export interface RequestMatchDto {
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
  sender: RequestPartyDto;
  receiver: RequestPartyDto;
  match: RequestMatchDto | null;
  direction: RequestDirection;
  canRespond: boolean;
  canCancel: boolean;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  cancelledAt: string | null;
}

export interface RequestPageDto {
  items: RequestDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type CreateRequestInput =
  | { type: 'match'; vacancyId: number }
  | { type: 'player'; targetUserId: number };

export interface ListRequestsInput {
  box: RequestBox;
  type: RequestType | null;
  state: RequestState | null;
  page: number;
  pageSize: number;
}
