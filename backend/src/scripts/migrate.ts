import { closePool } from '../config/db.js';
import { printStatus, runDown, runUp, withMigrationLock } from './lib/migrations.js';

const args = process.argv.slice(2);
const validArgs = new Set(['--up', '--down', '--status']);
const unknown = args.filter((arg) => !validArgs.has(arg));

if (unknown.length > 0) {
  console.error(`[FutLink] Argumentos no reconocidos: ${unknown.join(', ')}`);
  console.error('[FutLink] Uso: migrate.ts [--up | --down | --status]');
  process.exit(1);
}

const wantsDown = args.includes('--down');
const wantsStatus = args.includes('--status');

if (wantsDown && wantsStatus) {
  console.error('[FutLink] Usa solo una opción: --down o --status.');
  process.exit(1);
}

const command = wantsStatus ? 'status' : wantsDown ? 'down' : 'up';

const log = (message: string): void => {
  console.log(`[FutLink] ${message}`);
};

async function main(): Promise<void> {
  await withMigrationLock(async (client) => {
    if (command === 'status') {
      await printStatus(client, log);
      return;
    }

    if (command === 'down') {
      await runDown(client, log);
      return;
    }

    await runUp(client, log);
  });
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FutLink] ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
