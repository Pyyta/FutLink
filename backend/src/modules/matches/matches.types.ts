export type MatchState = 'available' | 'confirmed' | 'cancelled';

export interface MatchPositionDto {
  positionId: number;
  position: string;
  slots: number;
  freeSlots: number;
}

export interface MatchCreatorDto {
  id: number;
  name: string | null;
  profilePic: string | null;
}

export interface MatchListItemDto {
  id: number;
  locality: string;
  matchDate: string;
  modality: string | null;
  description: string | null;
  state: MatchState;
  totalSpots: number;
  freeSpots: number;
  positions: MatchPositionDto[];
  creator: MatchCreatorDto;
  isOwner: boolean;
  distanceMeters: number | null;
}

export interface MatchVacancyDto {
  id: number;
  positionId: number;
  position: string;
  occupied: boolean;
}

export interface MatchDetailDto extends MatchListItemDto {
  vacancies: MatchVacancyDto[];
  createdAt: string;
  cancelledAt: string | null;
  canCancel: boolean;
}

export interface MatchPageDto {
  items: MatchListItemDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CreateMatchInput {
  matchDate: Date;
  locality: string;
  modality: string | null;
  description: string | null;
  positions: { positionId: number; slots: number }[];
  latitude: number | null;
  longitude: number | null;
}

export interface MatchSearchInput {
  locality: string | null;
  date: string | null;
  positionId: number | null;
  page: number;
  pageSize: number;
  latitude: number | null;
  longitude: number | null;
}
