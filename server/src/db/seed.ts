import { loadConfig } from '../config.js';
import { BUILTIN_AGENTS } from '../orchestration/agents.js';
import { syncFolderAgents } from '../orchestration/folderScanner.js';
import { createDefaultToolRegistry } from '../orchestration/tools.js';
import { Store } from '../store/store.js';
import { createPgDb } from './client.js';

/** Idempotent: upserts built-in agents, discovered folder agents, and the tool catalogue. Also run automatically on server start. */
export async function seed(store: Store) {
  for (const a of BUILTIN_AGENTS) await store.upsertBuiltinAgent(a);
  await syncFolderAgents(store);
  const tools = createDefaultToolRegistry().list();
  await store.syncTools(tools.map((t) => ({ name: t.name, description: t.description, sensitive: t.sensitive, external: t.external })));
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const { db, close } = createPgDb(loadConfig().DATABASE_URL);
  await seed(new Store(db));
  console.log('Seeded built-in agents and tools.');
  await close();
}
