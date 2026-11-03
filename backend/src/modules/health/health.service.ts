import { AppError } from '../../shared/errors.js';
import { getPostgisVersion, pingDatabase } from './health.repository.js';

export interface HealthStatus {
  status: 'ok';
  db: 'up';
  postgis: string;
  now: string;
  uptimeSeconds: number;
}

export async function getHealthStatus(): Promise<HealthStatus> {
  let now: Date;

  try {
    const ping = await pingDatabase();
    now = ping.now;
  } catch {
    throw new AppError(503, 'DB_UNAVAILABLE', 'No se pudo conectar a la base de datos');
  }

  let postgis: string;

  try {
    postgis = await getPostgisVersion();
  } catch {
    throw new AppError(503, 'POSTGIS_UNAVAILABLE', 'PostGIS no está disponible en la base de datos');
  }

  return {
    status: 'ok',
    db: 'up',
    postgis,
    now: now.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  };
}
