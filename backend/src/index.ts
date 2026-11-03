import { createApp } from './app.js';
import { closePool } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    { port: env.PORT, env: env.NODE_ENV },
    `FutLink API escuchando en http://localhost:${env.PORT}`,
  );
});

server.on('error', (err) => {
  logger.fatal({ err }, 'Error al iniciar el servidor HTTP');
  process.exit(1);
});

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  logger.info({ signal }, 'Apagando el servidor...');

  const forceExit = setTimeout(() => {
    logger.error('No se pudo cerrar a tiempo; saliendo forzadamente');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async (err) => {
    if (err) {
      logger.error({ err }, 'Error al cerrar el servidor HTTP');
    }

    try {
      await closePool();
      logger.info('Pool de PostgreSQL cerrado');
    } catch (poolError) {
      logger.error({ err: poolError }, 'Error al cerrar el pool de PostgreSQL');
    }

    clearTimeout(forceExit);
    process.exit(err ? 1 : 0);
  });
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesa rechazada sin manejar');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Excepción no capturada');
  void shutdown('uncaughtException');
});
