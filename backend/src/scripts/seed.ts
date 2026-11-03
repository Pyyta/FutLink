import { closePool } from '../config/db.js';
import { runSeeds } from './lib/seeds.js';

const log = (message: string): void => {
  console.log(`[FutLink] ${message}`);
};

runSeeds(log)
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FutLink] ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
