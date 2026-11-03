import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: Date;
}

async function readSetting(
  key: string,
  client?: PoolClient,
): Promise<unknown | null> {
  const text = 'SELECT value FROM systemsettings WHERE key = $1 LIMIT 1';
  const result = client
    ? await client.query<{ value: unknown }>(text, [key])
    : await query<{ value: unknown }>(text, [key]);

  return result.rows[0]?.value ?? null;
}

/**
 * Lee un flag booleano de la configuración global. Si la clave no existe o no
 * contiene un booleano, usa el valor por defecto indicado.
 */
export async function getBooleanSetting(
  key: string,
  fallback: boolean,
  client?: PoolClient,
): Promise<boolean> {
  const value = await readSetting(key, client);
  return typeof value === 'boolean' ? value : fallback;
}

export async function getNumberSetting(
  key: string,
  fallback: number,
  client?: PoolClient,
): Promise<number> {
  const value = await readSetting(key, client);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function listSettings(): Promise<SettingRow[]> {
  return query<SettingRow>(
    `SELECT key, value, description, updated_at
     FROM systemsettings
     ORDER BY key`,
  ).then((result) => result.rows);
}

export async function upsertSetting(
  key: string,
  value: unknown,
  description: string | null,
  client?: PoolClient,
): Promise<void> {
  const text = `
    INSERT INTO systemsettings (key, value, description)
    VALUES ($1, $2::jsonb, $3)
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        description = COALESCE(EXCLUDED.description, systemsettings.description),
        updated_at = now()
  `;
  const params = [key, JSON.stringify(value), description];

  if (client) {
    await client.query(text, params);
  } else {
    await query(text, params);
  }
}
