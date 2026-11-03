import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../src/config/db.js';

afterAll(async () => {
  await closePool();
});

describe('Conexión a PostgreSQL', () => {
  it('responde SELECT NOW()', async () => {
    const result = await query<{ now: Date }>('SELECT NOW() AS now');

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.now).toBeInstanceOf(Date);
  });

  it('tiene PostGIS disponible', async () => {
    const result = await query<{ version: string }>('SELECT PostGIS_Version() AS version');

    expect(result.rows[0]?.version).toMatch(/^3\./);
  });
});
