import { loadConfig } from './config.js';
import { createPgDb } from './db/client.js';
import { seed } from './db/seed.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrationsFolder } from './db/migrate.js';
import { buildApp } from './http/app.js';
import { createProvider } from './orchestration/providers/index.js';

const config = loadConfig();
const { db, pool, close } = createPgDb(config.DATABASE_URL);
await migrate(db as never, { migrationsFolder });

const provider = createProvider(config);
const { app, store, orchestrator } = await buildApp({ config, db, provider });
await seed(store);
const recovered = await orchestrator.recover();
if (recovered) app.log.warn(`Recovered ${recovered} interrupted execution(s) → FAILED (retryable)`);
if (provider.isMock) app.log.warn('LLM_PROVIDER=mock: deterministic MOCK mode. Results are NOT produced by a language model.');

await app.listen({ port: config.PORT, host: config.HOST });

const shutdown = async () => { await app.close(); await close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
void pool;
