import { Pool } from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

export type QueryParam =
  | string
  | number
  | boolean
  | null
  | Date
  | Buffer
  | Record<string, unknown>
  | unknown[];

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 5_000,
  query_timeout: 5_000,
  application_name: 'futlink-api',
});

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en un cliente inactivo de PostgreSQL');
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: QueryParam[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error({ err: rollbackError }, 'Error al revertir la transacción');
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
