import { afterAll, describe, expect, it } from 'vitest';
import { closePool, query } from '../src/config/db.js';
import { runSeeds } from '../src/scripts/lib/seeds.js';

afterAll(async () => {
  await closePool();
});

describe('Seeds', () => {
  it('siembran posiciones y localidades de forma idempotente', async () => {
    await runSeeds();
    await runSeeds();

    const positions = await query<{ title: string }>(
      'SELECT title FROM positions ORDER BY title',
    );
    expect(positions.rows.map((row) => row.title)).toEqual([
      'defensa',
      'delantero',
      'mediocampista',
      'portero',
    ]);

    const localities = await query<{ total: string }>(
      'SELECT count(*)::text AS total FROM localities',
    );
    expect(localities.rows[0]?.total).toBe('20');
  });
});
