// One-off migration runner — executes all SQL migrations in order against Supabase.
// Usage: node scripts/run-migrations.mjs
// Delete after use or keep for CI — never commit DB credentials here.

import { createRequire } from 'module';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { Client } = require('C:\\Users\\somme\\AppData\\Local\\Temp\\pgrun\\node_modules\\pg');

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

// Session mode (5432) preferred for DDL; fall back to transaction mode (6543) not suitable for migrations.
// Supavisor username format: postgres.{project_ref}
const DB_URL = 'postgresql://postgres.apnbpcauqrjvkoleisde:WLs88gBmr8G7w4y3@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

const client = new Client({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function run() {
  await client.connect();
  console.log('Connected to database.\n');

  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
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
