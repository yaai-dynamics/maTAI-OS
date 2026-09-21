import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

/**
 * The Prisma client.
 *
 * Nothing outside src/server/data may import this module. The repository in
 * repository.ts is the only read surface and the actions in src/server/actions
 * are the only write path, so analytics, AI and UI code stays unaware of the
 * database — which is what makes the Postgres target in
 * prisma/schema.postgres.prisma a configuration change rather than a rewrite.
 *
 * From Prisma 7 the connection is supplied by a driver adapter rather than by a
 * url in schema.prisma, so the pool is configured here.
 *
 * The client is created on first use rather than at import. The unit tests run
 * against the seed-built in-memory state and never reach the database, and they
 * should not need a DATABASE_URL just because a module upstream imported this
 * one.
 */

const globalForPrisma = globalThis as unknown as {
  __manipurPrisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at your MySQL server.',
    );
  }

  const adapter = new PrismaMariaDb(url, {
    // Prisma sends parameterised statements, so the binary protocol applies.
    // Named here so the choice is explicit rather than implicit.
    useTextProtocol: false,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? [{ level: 'warn', emit: 'stdout' }, { level: 'error', emit: 'stdout' }]
        : [{ level: 'error', emit: 'stdout' }],
  });
}

/**
 * One client per process. Next.js hot reload re-evaluates modules, so without
 * the global the dev server would open a new pool on every edit until MySQL
 * refused further connections.
 */
function client(): PrismaClient {
  if (!globalForPrisma.__manipurPrisma) {
    globalForPrisma.__manipurPrisma = createClient();
  }
  return globalForPrisma.__manipurPrisma;
}

/**
 * Proxied so that importing this module costs nothing: the connection is opened
 * by the first property access, not by the import.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get: (_target, property, receiver) => Reflect.get(client(), property, receiver),
  has: (_target, property) => property in client(),
  ownKeys: () => Reflect.ownKeys(client()),
  getOwnPropertyDescriptor: (_target, property) =>
    Reflect.getOwnPropertyDescriptor(client(), property),
});
