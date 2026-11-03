import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../../config/db.js';
import type { Log } from './migrations.js';

const SEEDS_DIR = fileURLToPath(new URL('../../../../database/seeds/', import.meta.url));

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function runSeeds(log: Log = () => {}): Promise<void> {
  const files = (await readdir(SEEDS_DIR)).filter((file) => file.endsWith('.sql')).sort();

  if (files.length === 0) {
    log('No hay seeds para ejecutar.');
    return;
  }

  const client = await pool.connect();

  try {
    const reg = await client.query<{ reg: string | null }>(
      `SELECT to_regclass('public.schema_migrations')::text AS reg`,
    );
    if (!reg.rows[0]?.reg) {
      throw new Error(
        'No existe la tabla schema_migrations. Ejecuta primero npm run db:migrate.',
      );
    }

    for (const file of files) {
      const sql = await readFile(join(SEEDS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falló el seed ${file}: ${messageOf(error)}`, { cause: error });
      }
      log(`Seed aplicado: ${file}`);
    }

    log(`Seeds ejecutados: ${files.length}.`);
  } finally {
    client.release();
  }
}
