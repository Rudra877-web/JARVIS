import { scanWorkspaceFolders, syncFolderAgents } from '../../orchestration/folderScanner.js';
export async function folderRoutes(api, { app, store }) {
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
