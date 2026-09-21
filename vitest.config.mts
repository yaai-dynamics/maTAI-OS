import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * The unit suite runs against the seed-built in-memory state and needs no
 * database. tests/integration/* exercises the MySQL write path and skips
 * itself when DATABASE_URL is absent, so `npm run test` stays runnable on a
 * machine with no server running.
 */
try {
  process.loadEnvFile(new URL('./.env', import.meta.url).pathname.replace(/^\//, ''));
} catch {
  // No .env — the integration tests will skip themselves.
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // .env may name a live AI provider for the app; the suite never calls one.
    // Tests of the provider adapters stub fetch instead.
    env: { AI_PROVIDER: 'mock' },
    // Integration tests hash real passwords (scrypt at production cost, up to
    // a second each) and re-seed about 7,000 rows; 5 s left no headroom.
    testTimeout: 30_000,
    // The integration suite shares one database, so its files must not run
    // concurrently with each other.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@data': fileURLToPath(new URL('./data', import.meta.url)),
    },
  },
});
