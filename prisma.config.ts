import path from 'node:path';

import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * From Prisma 7 the connection URL is no longer allowed in schema.prisma: the
 * CLI reads it from here, and the application passes a driver adapter to the
 * PrismaClient constructor instead (see src/server/data/client.ts).
 *
 * Node 22 loads .env itself; the guard keeps the CLI usable in environments
 * where the file is absent and DATABASE_URL is already exported.
 */
try {
  process.loadEnvFile(path.join(process.cwd(), '.env'));
} catch {
  // No .env on disk — fall back to the ambient environment.
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
