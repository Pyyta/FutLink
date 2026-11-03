import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: 'forks',
    // Las suites comparten la misma base y algunas modifican configuración
    // global (escala de calificación, notificaciones), así que se ejecutan en
    // serie para que los resultados no dependan del orden de finalización.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      BCRYPT_COST: '10',
    },
  },
});
