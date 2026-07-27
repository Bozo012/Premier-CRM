// One-off migration runner — executes all SQL migrations in order against Supabase.
// Usage: DATABASE_URL="postgresql://postgres.<project-ref>:<password>@<pooler-host>:5432/postgres" node scripts/run-migrations.mjs
//
// Intended for bootstrapping a FRESH database only — it replays every
// migration unconditionally with no tracking of what's already applied, so
// running it against a database that already has migrations applied will
// fail on the first non-idempotent statement (e.g. `CREATE TABLE` without
// `IF NOT EXISTS`). For applying a single new migration to an existing
// database, use the Supabase dashboard's SQL editor or an MCP
// apply_migration call instead.
//
// DATABASE_URL is read from the environment — never hardcode credentials in
// this file. Get the connection string from the Supabase dashboard
// (Project Settings → Database → Connection string, "Session pooler" mode;
// session mode on port 5432 is required for DDL — transaction mode on 6543
// does not support prepared statements migrations may rely on).

import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('Missing required environment variable: DATABASE_URL');
  console.error('See the usage comment at the top of this file.');
  process.exit(1);
}

const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  await client.connect();
  console.log('Connected to database.\n');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    process.stdout.write(`Running ${file} ... `);
    try {
      await client.query(sql);
      console.log('OK');
    } catch (err) {
      console.log('FAILED');
      console.error(`\nError in ${file}:\n${err.message}\n`);
      await client.end();
      process.exit(1);
    }
  }

  console.log('\nAll migrations applied successfully.');
  await client.end();
}

run().catch(async (err) => {
  console.error('Fatal:', err.message);
  await client.end().catch(() => {});
  process.exit(1);
});
