import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
export { schema };
export function createPgDb(url) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzle(pool, { schema });
    return { db: db, pool, close: () => pool.end() };
}
