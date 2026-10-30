import type { FastifyInstance } from 'fastify';
import { scanWorkspaceFolders, syncFolderAgents } from '../../orchestration/folderScanner.js';
import type { RouteCtx } from '../app.js';

export async function folderRoutes(api: FastifyInstance, { app, store }: RouteCtx) {
  const auth = { onRequest: [app.authenticate] };

  /** List all auto-discovered workspace folders and their specialized agent profiles */
  api.get('/folders', auth, async () => {
    const folders = scanWorkspaceFolders();
    return { folders };
  });

  /** Re-scan workspace folders and sync/upsert their agents in the database */
  api.post('/folders/sync', auth, async () => {
    const synced = await syncFolderAgents(store);
    return { count: synced.length, folders: synced };
  });
}
