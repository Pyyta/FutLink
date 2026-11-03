import { withTransaction } from '../../config/db.js';
import { AppError } from '../../shared/errors.js';
import { isUniqueViolation } from '../../shared/postgres.js';
import * as settingsRepository from '../settings/settings.repository.js';
import * as repository from './admin.config.repository.js';
import type {
  AdminConfigDto,
  CatalogLocalityDto,
  CatalogPositionDto,
  NotificationsConfigDto,
  RatingsConfigDto,
  UpdateRatingsConfigInput,
} from './admin.types.js';

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function loadSettingsMap(): Promise<Map<string, unknown>> {
  const rows = await settingsRepository.listSettings();
  return new Map(rows.map((row) => [row.key, row.value]));
}

function readRatingsConfig(settings: Map<string, unknown>): RatingsConfigDto {
  return {
    minScore: numberValue(settings.get('ratings.min_score'), 1),
    maxScore: numberValue(settings.get('ratings.max_score'), 5),
    requireAcceptedRequest: booleanValue(
      settings.get('ratings.require_accepted_request'),
      false,
    ),
  };
}

function readNotificationsConfig(
  settings: Map<string, unknown>,
): NotificationsConfigDto {
  return {
    enabled: booleanValue(settings.get('notifications.enabled'), true),
  };
}

export async function getConfig(): Promise<AdminConfigDto> {
  const [settings, positions, localities] = await Promise.all([
    loadSettingsMap(),
    repository.listPositions(),
    repository.listLocalities(),
  ]);

  return {
    ratings: readRatingsConfig(settings),
    notifications: readNotificationsConfig(settings),
    positions,
    localities,
  };
}

export async function updateRatingsConfig(
  input: UpdateRatingsConfigInput,
): Promise<RatingsConfigDto> {
  const settings = await loadSettingsMap();
  const current = readRatingsConfig(settings);

  const merged: RatingsConfigDto = {
    minScore: input.minScore ?? current.minScore,
    maxScore: input.maxScore ?? current.maxScore,
    requireAcceptedRequest:
      input.requireAcceptedRequest ?? current.requireAcceptedRequest,
  };

  if (merged.minScore >= merged.maxScore) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'La calificación mínima debe ser menor que la máxima',
      { field: 'minScore' },
    );
  }

  const scaleChanged =
    merged.minScore !== current.minScore || merged.maxScore !== current.maxScore;

  if (scaleChanged) {
    const outside = await repository.countRatingsOutsideRange(
      merged.minScore,
      merged.maxScore,
    );
    if (outside > 0) {
      throw new AppError(
        409,
        'RATING_SCALE_IN_USE',
        'Hay calificaciones fuera del nuevo rango; ajusta o elimina esos contenidos antes de reducir la escala',
        {
          count: outside,
          minScore: merged.minScore,
          maxScore: merged.maxScore,
        },
      );
    }
  }

  await withTransaction(async (client) => {
    await settingsRepository.upsertSetting(
      'ratings.min_score',
      merged.minScore,
      'Calificación mínima configurable (1–10).',
      client,
    );
    await settingsRepository.upsertSetting(
      'ratings.max_score',
      merged.maxScore,
      'Calificación máxima configurable (1–10).',
      client,
    );
    await settingsRepository.upsertSetting(
      'ratings.require_accepted_request',
      merged.requireAcceptedRequest,
      'Si es true, solo se puede calificar a un jugador con quien exista una solicitud aceptada.',
      client,
    );
  });

  return merged;
}

export async function updateNotificationsConfig(
  enabled: boolean,
): Promise<NotificationsConfigDto> {
  await settingsRepository.upsertSetting(
    'notifications.enabled',
    enabled,
    'Si es false, se dejan de generar notificaciones nuevas.',
  );

  return { enabled };
}

export async function createPosition(
  title: string,
): Promise<CatalogPositionDto> {
  if (await repository.findPositionByTitle(title)) {
    throw new AppError(
      409,
      'POSITION_ALREADY_EXISTS',
      'Ya existe una posición con ese nombre',
    );
  }

  try {
    const id = await repository.insertPosition(title);
    return { id, title };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'POSITION_ALREADY_EXISTS',
        'Ya existe una posición con ese nombre',
      );
    }
    throw error;
  }
}

export async function updatePosition(
  id: number,
  title: string,
): Promise<CatalogPositionDto> {
  const current = await repository.findPositionById(id);
  if (!current) {
    throw new AppError(
      404,
      'POSITION_NOT_FOUND',
      'No existe la posición indicada',
    );
  }

  if (await repository.findPositionByTitle(title, id)) {
    throw new AppError(
      409,
      'POSITION_ALREADY_EXISTS',
      'Ya existe una posición con ese nombre',
    );
  }

  try {
    await withTransaction((client) =>
      repository.renamePosition(id, title, current.title, client),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'POSITION_ALREADY_EXISTS',
        'Ya existe una posición con ese nombre',
      );
    }
    throw error;
  }

  return { id, title };
}

export async function deletePosition(id: number): Promise<void> {
  const current = await repository.findPositionById(id);
  if (!current) {
    throw new AppError(
      404,
      'POSITION_NOT_FOUND',
      'No existe la posición indicada',
    );
  }

  const usage = await repository.countPositionUsage(id, current.title);
  if (usage.users > 0 || usage.matches > 0) {
    throw new AppError(
      409,
      'POSITION_IN_USE',
      'La posición está en uso por perfiles o partidos; no se puede eliminar',
      usage,
    );
  }

  await repository.deletePosition(id);
}

export async function createLocality(
  name: string,
): Promise<CatalogLocalityDto> {
  if (await repository.findLocalityByName(name)) {
    throw new AppError(
      409,
      'LOCALITY_ALREADY_EXISTS',
      'Ya existe una localidad con ese nombre',
    );
  }

  try {
    const id = await repository.insertLocality(name);
    return { id, name };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'LOCALITY_ALREADY_EXISTS',
        'Ya existe una localidad con ese nombre',
      );
    }
    throw error;
  }
}

export async function updateLocality(
  id: number,
  name: string,
): Promise<CatalogLocalityDto> {
  const current = await repository.findLocalityById(id);
  if (!current) {
    throw new AppError(
      404,
      'LOCALITY_NOT_FOUND',
      'No existe la localidad indicada',
    );
  }

  if (await repository.findLocalityByName(name, id)) {
    throw new AppError(
      409,
      'LOCALITY_ALREADY_EXISTS',
      'Ya existe una localidad con ese nombre',
    );
  }

  try {
    await withTransaction((client) =>
      repository.renameLocality(id, name, current.name, client),
    );
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError(
        409,
        'LOCALITY_ALREADY_EXISTS',
        'Ya existe una localidad con ese nombre',
      );
    }
    throw error;
  }

  return { id, name };
}

export async function deleteLocality(id: number): Promise<void> {
  const current = await repository.findLocalityById(id);
  if (!current) {
    throw new AppError(
      404,
      'LOCALITY_NOT_FOUND',
      'No existe la localidad indicada',
    );
  }

  const usage = await repository.countLocalityUsage(current.name);
  if (usage.users > 0 || usage.matches > 0) {
    throw new AppError(
      409,
      'LOCALITY_IN_USE',
      'La localidad está en uso por perfiles o partidos; no se puede eliminar',
      usage,
    );
  }

  await repository.deleteLocality(id);
}
