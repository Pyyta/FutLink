import type { PoolClient } from 'pg';
import { query } from '../../config/db.js';

export interface CatalogPositionRow {
  id: number;
  title: string;
}

export interface CatalogLocalityRow {
  id: number;
  name: string;
}

export interface CatalogUsageRow {
  users: number;
  matches: number;
}

export function listPositions(): Promise<CatalogPositionRow[]> {
  return query<CatalogPositionRow>(
    'SELECT id, title FROM positions ORDER BY id',
  ).then((result) => result.rows);
}

export function listLocalities(): Promise<CatalogLocalityRow[]> {
  return query<CatalogLocalityRow>(
    'SELECT id, name FROM localities ORDER BY name',
  ).then((result) => result.rows);
}

export function findPositionById(
  id: number,
): Promise<CatalogPositionRow | null> {
  return query<CatalogPositionRow>(
    'SELECT id, title FROM positions WHERE id = $1 LIMIT 1',
    [id],
  ).then((result) => result.rows[0] ?? null);
}

export function findPositionByTitle(
  title: string,
  excludeId: number | null = null,
): Promise<CatalogPositionRow | null> {
  return query<CatalogPositionRow>(
    `SELECT id, title
     FROM positions
     WHERE lower(title) = lower($1)
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [title, excludeId],
  ).then((result) => result.rows[0] ?? null);
}

export async function insertPosition(title: string): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO positions (title)
     VALUES ($1)
     RETURNING id`,
    [title],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('No se pudo crear la posición');
  }
  return row.id;
}

export async function renamePosition(
  id: number,
  newTitle: string,
  oldTitle: string,
  client: PoolClient,
): Promise<void> {
  await client.query('UPDATE positions SET title = $2 WHERE id = $1', [
    id,
    newTitle,
  ]);
  await client.query(
    `UPDATE matchvacants
     SET position = $2
     WHERE lower(position) = lower($1)`,
    [oldTitle, newTitle],
  );
}

export async function deletePosition(id: number): Promise<void> {
  await query('DELETE FROM positions WHERE id = $1', [id]);
}

export async function countPositionUsage(
  id: number,
  title: string,
): Promise<CatalogUsageRow> {
  const result = await query<CatalogUsageRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM userspositions WHERE id_positions = $1) AS users,
       (
         SELECT COUNT(*)::int
         FROM matchvacants
         WHERE lower(position) = lower($2)
       ) AS matches`,
    [id, title],
  );

  return result.rows[0] ?? { users: 0, matches: 0 };
}

export function findLocalityById(
  id: number,
): Promise<CatalogLocalityRow | null> {
  return query<CatalogLocalityRow>(
    'SELECT id, name FROM localities WHERE id = $1 LIMIT 1',
    [id],
  ).then((result) => result.rows[0] ?? null);
}

export function findLocalityByName(
  name: string,
  excludeId: number | null = null,
): Promise<CatalogLocalityRow | null> {
  return query<CatalogLocalityRow>(
    `SELECT id, name
     FROM localities
     WHERE lower(name) = lower($1)
       AND ($2::int IS NULL OR id <> $2)
     LIMIT 1`,
    [name, excludeId],
  ).then((result) => result.rows[0] ?? null);
}

export async function insertLocality(name: string): Promise<number> {
  const result = await query<{ id: number }>(
    `INSERT INTO localities (name)
     VALUES ($1)
     RETURNING id`,
    [name],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error('No se pudo crear la localidad');
  }
  return row.id;
}

export async function renameLocality(
  id: number,
  newName: string,
  oldName: string,
  client: PoolClient,
): Promise<void> {
  await client.query('UPDATE localities SET name = $2 WHERE id = $1', [
    id,
    newName,
  ]);
  await client.query(
    `UPDATE users
     SET locality = $2
     WHERE lower(locality) = lower($1)`,
    [oldName, newName],
  );
  await client.query(
    `UPDATE matchs
     SET locality = $2
     WHERE lower(locality) = lower($1)`,
    [oldName, newName],
  );
}

export async function deleteLocality(id: number): Promise<void> {
  await query('DELETE FROM localities WHERE id = $1', [id]);
}

export async function countLocalityUsage(
  name: string,
): Promise<CatalogUsageRow> {
  const result = await query<CatalogUsageRow>(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE lower(locality) = lower($1)) AS users,
       (SELECT COUNT(*)::int FROM matchs WHERE lower(locality) = lower($1)) AS matches`,
    [name],
  );

  return result.rows[0] ?? { users: 0, matches: 0 };
}

export async function countRatingsOutsideRange(
  minScore: number,
  maxScore: number,
): Promise<number> {
  const result = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM usersratings
     WHERE score < $1 OR score > $2`,
    [minScore, maxScore],
  );

  return result.rows[0]?.total ?? 0;
}
