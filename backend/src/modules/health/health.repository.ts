import { query } from '../../config/db.js';

export interface DatabasePing {
  ok: number;
  now: Date;
}

export async function pingDatabase(): Promise<DatabasePing> {
  const result = await query<DatabasePing>('SELECT 1 AS ok, NOW() AS now');
  const row = result.rows[0];
  if (!row) {
    throw new Error('SELECT 1 no devolvió filas');
  }
  return row;
}

export async function getPostgisVersion(): Promise<string> {
  const result = await query<{ version: string }>('SELECT PostGIS_Version() AS version');
  const row = result.rows[0];
  if (!row) {
    throw new Error('PostGIS_Version() no devolvió filas');
  }
  return row.version;
}
