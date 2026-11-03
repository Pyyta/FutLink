import type {
  AuthResult,
  MatchDetail,
  MatchListItem,
  NotificationDto,
  PlayerListItem,
  Profile,
  PublicProfile,
  RequestDto,
} from '../lib/api/types';

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 1,
    email: 'ana@example.com',
    name: 'Ana Pérez',
    phone: '300 123 4567',
    locality: 'Chapinero',
    profilePic: null,
    role: 'user',
    state: 'active',
    matchsPlayed: 0,
    positions: [{ id: 1, title: 'arquera' }],
    rating: { average: null, count: 0 },
    profileCompleted: true,
    createdAt: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

export function makeAuthResult(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    tokenType: 'Bearer',
    accessToken: 'access-new',
    refreshToken: 'refresh-new',
    expiresIn: 900,
    user: makeProfile(),
    ...overrides,
  };
}

export function makePublicProfile(
  overrides: Partial<PublicProfile> = {},
): PublicProfile {
  return {
    id: 2,
    name: 'Carlos Ruiz',
    locality: 'Suba',
    profilePic: null,
    positions: [{ id: 2, title: 'defensa' }],
    rating: { average: 4.3, count: 3 },
    comments: [
      {
        id: 10,
        author: { id: 3, name: 'Diana Gómez', profilePic: null },
        score: 5,
        comment: 'Gran jugador y muy puntual.',
        createdAt: '2026-10-01T12:00:00.000Z',
        updatedAt: '2026-10-01T12:00:00.000Z',
      },
    ],
    myRating: null,
    phone: null,
    phoneVisible: false,
    ...overrides,
  };
}

export function makeMatchListItem(
  overrides: Partial<MatchListItem> = {},
): MatchListItem {
  return {
    id: 10,
    locality: 'Chapinero',
    matchDate: '2026-11-20T20:00:00.000Z',
    modality: 'fútbol 7',
    description: 'Partido amistoso entre vecinos.',
    state: 'available',
    totalSpots: 2,
    freeSpots: 1,
    positions: [
      { positionId: 2, position: 'defensa', slots: 2, freeSlots: 1 },
    ],
    creator: { id: 5, name: 'Organiza Fútbol', profilePic: null },
    isOwner: false,
    distanceMeters: null,
    ...overrides,
  };
}

export function makeMatchDetail(
  overrides: Partial<MatchDetail> = {},
): MatchDetail {
  return {
    ...makeMatchListItem(),
    vacancies: [
      { id: 101, positionId: 2, position: 'defensa', occupied: false },
      { id: 102, positionId: 2, position: 'defensa', occupied: true },
    ],
    createdAt: '2026-11-01T12:00:00.000Z',
    cancelledAt: null,
    canCancel: false,
    ...overrides,
  };
}

export function makePlayerListItem(
  overrides: Partial<PlayerListItem> = {},
): PlayerListItem {
  return {
    id: 3,
    name: 'Diana Gómez',
    locality: 'Usaquén',
    profilePic: null,
    positions: [{ id: 3, title: 'mediocampista' }],
    rating: { average: 4.7, count: 6 },
    ...overrides,
  };
}

export function makeRequest(overrides: Partial<RequestDto> = {}): RequestDto {
  const sender = {
    id: 1,
    name: 'Ana Pérez',
    profilePic: null,
    locality: 'Chapinero',
    rating: { average: null, count: 0 },
  };
  const receiver = {
    id: 2,
    name: 'Carlos Ruiz',
    profilePic: null,
    locality: 'Suba',
    rating: { average: 4.3, count: 3 },
  };

  return {
    id: 20,
    type: 'player',
    state: 'pending',
    sender,
    receiver,
    match: null,
    direction: 'sent',
    canRespond: false,
    canCancel: true,
    createdAt: '2026-11-02T12:00:00.000Z',
    updatedAt: '2026-11-02T12:00:00.000Z',
    respondedAt: null,
    cancelledAt: null,
    ...overrides,
  };
}

export function makeNotification(
  overrides: Partial<NotificationDto> = {},
): NotificationDto {
  return {
    id: 30,
    type: 'request_accepted',
    readAt: null,
    createdAt: '2026-11-02T15:30:00.000Z',
    actor: { id: 2, name: 'Carlos Ruiz', profilePic: null },
    request: { id: 20, type: 'player' },
    match: null,
    content: null,
    ...overrides,
  };
}
