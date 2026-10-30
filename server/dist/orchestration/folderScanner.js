import fs from 'node:fs';
import path from 'node:path';
import { getWorkspaceRoot } from './workspaceFs.js';
const IGNORED_FOLDERS = new Set([
    'node_modules',
    '.git',
    '.gemini',
    '.drizzle',
    'dist',
    'build',
    '.next',
    '.turbo',
    'coverage',
    '.vscode',
    '.idea',
]);
/**
 * Normalizes folder path to a clean slug: "apps/server" -> "folder-apps-server"
 */
export function folderToSlug(folderRelPath) {
    const clean = folderRelPath.replace(/[/\\]+/g, '-').toLowerCase();
    return `folder-${clean}`;
}
/**
 * Inspects a folder to infer its role, description, and primary technologies.
 */
function inferFolderProfile(relPath, fullPath) {
    const parts = relPath.replace(/\\/g, '/').split('/');
    const baseName = parts[parts.length - 1] ?? 'folder';
    let title = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    let description = `Dedicated agent for the '${relPath}' folder.`;
    const capabilities = [folderToSlug(relPath)];
    // Check package.json if present
    const pkgPath = path.join(fullPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.description)
                description = pkg.description;
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            if (deps['react'] || deps['vue'] || deps['vite'] || deps['tailwindcss']) {
                title = `Web UI Agent (${relPath})`;
                description = `Dedicated frontend & UI agent for ${relPath}. Specializes in React components, styling, routing, and user interface.`;
                capabilities.push('frontend-dev', 'web-ui');
            }
            else if (deps['fastify'] || deps['express'] || deps['drizzle-orm'] || deps['pg']) {
                title = `Server Backend Agent (${relPath})`;
                description = `Dedicated backend agent for ${relPath}. Specializes in APIs, Fastify server, database schema, queries, and business logic.`;
                capabilities.push('backend-dev', 'server-api');
            }
        }
        catch {
            // ignore
        }
    }
    else if (relPath.includes('server') || relPath.includes('backend') || relPath.includes('api')) {
        title = `Server Agent (${relPath})`;
        description = `Backend services and API agent for ${relPath}.`;
        capabilities.push('backend-dev');
    }
    else if (relPath.includes('web') || relPath.includes('client') || relPath.includes('frontend') || relPath.includes('ui')) {
        title = `Web Frontend Agent (${relPath})`;
        description = `Frontend application and UI agent for ${relPath}.`;
        capabilities.push('frontend-dev');
    }
    else if (relPath.includes('docs')) {
        title = `Documentation Agent (${relPath})`;
        description = `Documentation and technical guides agent for ${relPath}.`;
        capabilities.push('docs');
    }
    else if (relPath.includes('test')) {
        title = `Testing Agent (${relPath})`;
        description = `Automated tests and quality assurance agent for ${relPath}.`;
        capabilities.push('testing');
    }
    else {
        title = `${title} Agent (${relPath})`;
    }
    return { name: title, description, capabilities };
}
/**
 * Scans the workspace directory tree and generates folder-scoped agents for each directory.
 */
export function scanWorkspaceFolders(rootDir = getWorkspaceRoot()) {
    const discovered = [];
    if (!fs.existsSync(rootDir))
        return discovered;
    const candidateDirs = [];
    // 1. Scan monorepo apps/* or packages/*
    for (const group of ['apps', 'packages']) {
        const groupPath = path.join(rootDir, group);
        if (fs.existsSync(groupPath) && fs.statSync(groupPath).isDirectory()) {
            try {
                const subdirs = fs.readdirSync(groupPath, { withFileTypes: true });
                for (const s of subdirs) {
                    if (s.isDirectory() && !IGNORED_FOLDERS.has(s.name)) {
                        candidateDirs.push(`${group}/${s.name}`);
                    }
                }
            }
            catch {
                // ignore
            }
        }
    }
    // 2. Scan top-level folders if not in a standard monorepo or to capture root directories
    try {
        const topEntries = fs.readdirSync(rootDir, { withFileTypes: true });
        for (const entry of topEntries) {
            if (entry.isDirectory() && !IGNORED_FOLDERS.has(entry.name) && entry.name !== 'apps' && entry.name !== 'packages') {
                candidateDirs.push(entry.name);
            }
        }
    }
    catch {
        // ignore
    }
    // Fallback: if no subdirs found, include root
    if (candidateDirs.length === 0) {
        candidateDirs.push('.');
    }
    const allowedTools = [
        'task_context',
        'folder_list',
        'folder_read_file',
        'folder_write_file',
        'folder_search',
        'record_evidence',
    ];
    for (const rel of candidateDirs) {
        const fullPath = path.join(rootDir, rel);
        if (!fs.existsSync(fullPath))
            continue;
        const profile = inferFolderProfile(rel, fullPath);
        const slug = folderToSlug(rel);
        // Get sample of files
        let filesSample = [];
        try {
            filesSample = fs
                .readdirSync(fullPath)
                .filter((f) => !IGNORED_FOLDERS.has(f) && !f.startsWith('.env'))
                .slice(0, 10);
        }
        catch {
            filesSample = [];
        }
        const systemPrompt = `You are the specialized Folder Agent for the "${rel}" directory.
Your exclusive scope is inspecting, creating, and modifying code and assets inside "${rel}".

When a prompt or task is received:
1. Use "folder_list" with folder="${rel}" to inspect the folder structure.
2. Use "folder_search" to find relevant code, functions, or files.
3. Use "folder_read_file" to read relevant files in "${rel}".
4. Use "folder_write_file" to apply accurate, clean code changes when asked to modify or add files.
5. In your final output, explain the changes made or findings discovered inside "${rel}".

Rules:
- Never edit files outside "${rel}".
- Never attempt to read or expose .env secrets.
- Always provide clean, complete, working code.`;
        discovered.push({
            folderPath: rel,
            slug,
            name: profile.name,
            description: profile.description,
            capabilities: profile.capabilities,
            allowedTools,
            systemPrompt,
            filesSample,
        });
    }
    return discovered;
}
/**
 * Synchronizes discovered folder agents with the database store as built-in workspace agents.
 */
export async function syncFolderAgents(store) {
    const discovered = scanWorkspaceFolders();
    for (const d of discovered) {
        await store.upsertBuiltinAgent({
            slug: d.slug,
            name: d.name,
            description: d.description,
            role: 'custom',
            capabilities: d.capabilities,
            allowedTools: d.allowedTools,
            systemPrompt: d.systemPrompt,
            enabled: true,
            isBuiltin: true,
        });
    }
    return discovered;
}
