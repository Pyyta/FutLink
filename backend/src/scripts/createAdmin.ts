import bcrypt from 'bcrypt';
import { closePool, query } from '../config/db.js';
import { env } from '../config/env.js';

async function main(): Promise<void> {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    console.error(
      '[FutLink] Define ADMIN_EMAIL y ADMIN_PASSWORD en backend/.env para provisionar el administrador.',
    );
    process.exitCode = 1;
    return;
  }

  const email = env.ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, env.BCRYPT_COST);

  const existing = await query<{ id: number }>(
    'SELECT id FROM users WHERE lower(email) = $1 LIMIT 1',
    [email],
  );

  const current = existing.rows[0];
  if (current) {
    await query(
      `UPDATE users
       SET password = $2, role = 'admin', state = 'active', updated_at = now()
       WHERE id = $1`,
      [current.id, passwordHash],
    );
    console.log(`[FutLink] Administrador actualizado: ${email}`);
    return;
  }

  await query(
    `INSERT INTO users (email, password, role, state, name)
     VALUES ($1, $2, 'admin', 'active', 'Administrador')`,
    [email, passwordHash],
  );
  console.log(`[FutLink] Administrador creado: ${email}`);
}

try {
  await main();
} catch (error) {
  console.error(
    '[FutLink] No se pudo provisionar el administrador:',
    error instanceof Error ? error.message : 'error desconocido',
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
