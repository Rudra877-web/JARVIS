import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadConfig } from '../config.js';

export const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cfg = loadConfig();
  const pool = new pg.Pool({ connectionString: cfg.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder });
  console.log('Migrations applied.');
  await pool.end();
}
