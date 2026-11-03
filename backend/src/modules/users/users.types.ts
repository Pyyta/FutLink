import type {
  PositionDto,
  RatingSummary,
  RatingValueDto,
} from '../auth/auth.types.js';

export interface PlayerListItemDto {
  id: number;
  name: string | null;
  locality: string | null;
  profilePic: string | null;
  positions: PositionDto[];
  rating: RatingSummary;
}

export interface PlayerPageDto {
  items: PlayerListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SearchPlayersInput {
  name: string | null;
  locality: string | null;
  positionId: number | null;
  page: number;
  pageSize: number;
}

export interface RateUserInput {
  score: number;
  comment: string | null;
}

export interface RateUserResultDto {
  rating: RatingValueDto;
  summary: RatingSummary;
}
