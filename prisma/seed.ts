import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

import { seedDatabase } from '@/server/data/seed-database';

/**
 * Seeds the database from the command line.
 *
 * Run with: npm run db:seed
 * The work itself lives in src/server/data/seed-database.ts so the demo reset
 * action can restore the same dataset.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set — copy .env.example to .env.');

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

seedDatabase(prisma)
  .then(async (counts) => {
    console.log('Seeded:');
    for (const [table, count] of Object.entries(counts)) {
      console.log(`  ${table.padEnd(20)} ${String(count).padStart(6)}`);
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    console.log(`\n  ${'TOTAL'.padEnd(20)} ${String(total).padStart(6)}`);
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
