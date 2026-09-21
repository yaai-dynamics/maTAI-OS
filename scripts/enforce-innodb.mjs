import fs from 'node:fs';
import path from 'node:path';

/**
 * Forces ENGINE=InnoDB onto every CREATE TABLE in the newest migration.
 *
 * WAMP ships MySQL with default_storage_engine=MyISAM. MyISAM cannot support
 * this schema: it has no foreign keys, no transactions, and a 1000-byte index
 * key limit that the CreatorApplication unique index exceeds — which is exactly
 * how the first migration failed.
 *
 * Prisma has no per-model engine attribute for MySQL, so rather than depending
 * on the server being configured correctly, every migration states the engine
 * itself. Run through `npm run db:migrate`, which applies this before the
 * migration reaches the database.
 */

const MIGRATIONS = path.join(process.cwd(), 'prisma', 'migrations');

const NOTE = [
  '-- ENGINE=InnoDB is stated explicitly on every table.',
  '-- The schema needs foreign keys and transactions, which MyISAM does not',
  '-- support. Stating the engine keeps this project independent of the',
  '-- server default. Applied by scripts/enforce-innodb.mjs.',
  '',
  '',
].join('\n');

function patch(file) {
  const original = fs.readFileSync(file, 'utf8');
  const needing = (original.match(/\)\s*DEFAULT CHARACTER SET/g) ?? []).length;
  if (needing === 0) return 0;

  let patched = original.replace(/\)\s*DEFAULT CHARACTER SET/g, ') ENGINE=InnoDB DEFAULT CHARACTER SET');
  if (!patched.startsWith('-- ENGINE=InnoDB')) patched = NOTE + patched;

  fs.writeFileSync(file, patched);
  return needing;
}

if (!fs.existsSync(MIGRATIONS)) {
  console.log('No migrations directory yet — nothing to patch.');
  process.exit(0);
}

let total = 0;
for (const dir of fs.readdirSync(MIGRATIONS)) {
  const file = path.join(MIGRATIONS, dir, 'migration.sql');
  if (!fs.existsSync(file)) continue;
  const n = patch(file);
  if (n > 0) {
    total += n;
    console.log(`${dir}: ${n} table(s) pinned to InnoDB`);
  }
}

console.log(total === 0 ? 'All migrations already pin InnoDB.' : `Pinned ${total} table(s) to InnoDB.`);
