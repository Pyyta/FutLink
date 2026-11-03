import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { pool } from '../../config/db.js';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../../../database/migrations/', import.meta.url),
);
const MIGRATION_LOCK_KEY = 728_144_592;
const FILE_PATTERN = /^(\d{4,})_([a-z0-9_]+)\.(up|down)\.sql$/;

export type Log = (message: string) => void;

export interface Migration {
  version: string;
  name: string;
  upSql: string;
  downSql: string;
  checksum: string;
}

interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: Date;
}

const normalizeSql = (sql: string): string => sql.replace(/\r\n/g, '\n');

const checksumOf = (sql: string): string =>
  createHash('sha256').update(normalizeSql(sql)).digest('hex');

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ensureMigrationsTable = async (client: PoolClient): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
};

const fetchApplied = async (client: PoolClient): Promise<AppliedMigration[]> => {
  const result = await client.query<AppliedMigration>(
    'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version',
  );
  return result.rows;
};

const verifyChecksums = (migrations: Migration[], applied: AppliedMigration[]): void => {
  for (const row of applied) {
    const migration = migrations.find((item) => item.version === row.version);
    if (!migration) {
      throw new Error(
        `La migración ${row.version}_${row.name} está aplicada, pero no existe su archivo local.`,
      );
    }
    if (migration.checksum !== row.checksum) {
      throw new Error(
        `La migración ${row.version}_${row.name} cambió después de aplicarse. Crea una migración nueva en lugar de editar una ya aplicada.`,
      );
    }
  }
};

export async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const found = new Map<string, { name: string; upPath: string; downPath?: string }>();

  for (const file of files) {
    const match = FILE_PATTERN.exec(file);
    if (!match) {
      if (file.endsWith('.sql')) {
        throw new Error(
          `Nombre de migración inválido: ${file}. Usa NNNN_nombre.up.sql y NNNN_nombre.down.sql.`,
        );
      }
      continue;
    }

    const version = match[1] ?? '';
    const name = match[2] ?? '';
    const kind = match[3];
    if (!version || !name || (kind !== 'up' && kind !== 'down')) {
      continue;
    }

    const existing = found.get(version);
    if (existing && existing.name !== name) {
      throw new Error(
        `La versión ${version} aparece con dos nombres distintos: ${existing.name} y ${name}.`,
      );
    }

    const entry = existing ?? { name, upPath: '' };
    const path = join(MIGRATIONS_DIR, file);
    if (kind === 'up') {
      entry.upPath = path;
    } else {
      entry.downPath = path;
    }
    found.set(version, entry);
  }

  const migrations: Migration[] = [];

  for (const [version, entry] of found) {
    if (!entry.upPath) {
      throw new Error(`Falta el archivo up de la migración ${version}_${entry.name}.`);
    }
    if (!entry.downPath) {
      throw new Error(`Falta el archivo down de la migración ${version}_${entry.name}.`);
    }

    const upSql = await readFile(entry.upPath, 'utf8');
    const downSql = await readFile(entry.downPath, 'utf8');

    migrations.push({
      version,
      name: entry.name,
      upSql,
      downSql,
      checksum: checksumOf(upSql),
    });
  }

  return migrations.sort((a, b) => Number(a.version) - Number(b.version));
}

export async function withMigrationLock<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [MIGRATION_LOCK_KEY]);
    return await fn(client);
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]);
    } catch {
      // Si el desbloqueo falla, se destruye la sesión para liberar el lock.
    }
    client.release(true);
  }
}

export async function runUp(client: PoolClient, log: Log): Promise<void> {
  await ensureMigrationsTable(client);
  const migrations = await loadMigrations();
  const applied = await fetchApplied(client);
  verifyChecksums(migrations, applied);

  const appliedVersions = new Set(applied.map((row) => row.version));
  const pending = migrations.filter((migration) => !appliedVersions.has(migration.version));

  if (pending.length === 0) {
    log('No hay migraciones pendientes. La base está al día.');
    return;
  }

  for (const migration of pending) {
    const label = `${migration.version}_${migration.name}`;
    log(`Aplicando ${label}...`);

    await client.query('BEGIN');
    try {
      await client.query(migration.upSql);
      await client.query(
        'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
        [migration.version, migration.name, migration.checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`Falló la migración ${label}: ${messageOf(error)}`, { cause: error });
    }

    log(`Aplicada ${label}.`);
  }

  log(`Migraciones aplicadas: ${pending.length}.`);
}

export async function runDown(client: PoolClient, log: Log): Promise<void> {
  await ensureMigrationsTable(client);
  const migrations = await loadMigrations();
  const applied = await fetchApplied(client);

  if (applied.length === 0) {
    log('No hay migraciones aplicadas que revertir.');
    return;
  }

  const latest = [...applied].sort(
    (a, b) => Number(b.version) - Number(a.version),
  )[0];
  if (!latest) {
    return;
  }

  const migration = migrations.find((item) => item.version === latest.version);
  if (!migration) {
    throw new Error(
      `La migración ${latest.version}_${latest.name} está aplicada, pero no existe su archivo local.`,
    );
  }
  if (migration.checksum !== latest.checksum) {
    throw new Error(
      `La migración ${latest.version}_${latest.name} cambió después de aplicarse; no se revierte automáticamente.`,
    );
  }

  const label = `${migration.version}_${migration.name}`;
  log(`Revirtiendo ${label}...`);

  await client.query('BEGIN');
  try {
    await client.query(migration.downSql);
    await client.query('DELETE FROM schema_migrations WHERE version = $1', [migration.version]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Falló la reversión de ${label}: ${messageOf(error)}`, { cause: error });
  }

  log(`Revertida ${label}.`);
}

export async function printStatus(client: PoolClient, log: Log): Promise<void> {
  await ensureMigrationsTable(client);
  const migrations = await loadMigrations();
  const applied = await fetchApplied(client);
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));

  for (const migration of migrations) {
    const row = appliedByVersion.get(migration.version);
    const state = row ? `aplicada ${row.applied_at.toISOString()}` : 'pendiente';
    log(`${migration.version}  ${migration.name.padEnd(24)}  ${state}`);
  }

  for (const row of applied) {
    if (!migrations.some((migration) => migration.version === row.version)) {
      log(`${row.version}  ${row.name.padEnd(24)}  aplicada (sin archivo local)`);
    }
  }
}
