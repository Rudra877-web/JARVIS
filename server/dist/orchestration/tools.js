import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';
export const defineTool = (t) => t;
export class ToolRegistry {
    tools = new Map();
    register(t) {
        if (this.tools.has(t.name))
            throw new Error(`Tool already registered: ${t.name}`);
        this.tools.set(t.name, t);
        return this;
    }
    get(name) { return this.tools.get(name); }
    has(name) { return this.tools.has(name); }
    list() { return [...this.tools.values()]; }
    names() { return [...this.tools.keys()]; }
    /** Descriptions given to the model (JSON schema for args). */
    describe(names) {
        return names.flatMap((n) => {
            const t = this.tools.get(n);
            return t ? [{ name: t.name, description: t.description, sensitive: t.sensitive, args: z.toJSONSchema(t.argsSchema) }] : [];
        });
    }
}
/* ---------------- Built-in tools ---------------- */
const MAX_LINES = 5000;
const taskContext = defineTool({
    name: 'task_context',
    description: 'Read the task description and the user-supplied context/data attached to this task.',
    argsSchema: z.object({ section: z.enum(['description', 'context', 'all']).default('all') }),
    sensitive: false,
    external: false,
    execute: async ({ section }, ctx) => {
        const out = {};
        if (section !== 'context')
            out.description = ctx.task.description;
        if (section !== 'description')
            out.context = ctx.task.context.slice(0, 20_000);
        return out;
    },
});
/** Fixed, audited patterns only: user/model supplied regexes are never compiled (no ReDoS surface). */
const PRESETS = {
    secrets: { re: /(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-/+=]{8,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i, severity: 'high', label: 'Possible hard-coded secret' },
    sql_injection: { re: /(SELECT|INSERT|UPDATE|DELETE)\b[^;\n]*(\+|\$\{)[^;\n]*/i, severity: 'high', label: 'String-built SQL' },
    eval: { re: /\b(eval|new Function|child_process|exec(Sync)?)\s*\(/, severity: 'medium', label: 'Dynamic code execution' },
    todo: { re: /\b(TODO|FIXME|HACK|XXX)\b/, severity: 'low', label: 'Unresolved TODO/FIXME' },
    debug: { re: /\b(console\.log|debugger|print\(|printStackTrace)\b/, severity: 'low', label: 'Debug statement' },
};
const redact = (s) => s.replace(/([:=]\s*['"]?)[A-Za-z0-9_\-/+=]{6,}/g, '$1[REDACTED]').slice(0, 160);
const patternScan = defineTool({
    name: 'pattern_scan',
    description: 'Scan the supplied task context line-by-line for known risk patterns (secrets, sql_injection, eval, todo, debug). Matches are redacted.',
    argsSchema: z.object({ presets: z.array(z.enum(['secrets', 'sql_injection', 'eval', 'todo', 'debug'])).max(5).default(['secrets', 'sql_injection', 'eval', 'todo', 'debug']) }),
    sensitive: false,
    external: false,
    execute: async ({ presets }, ctx) => {
        const lines = ctx.task.context.split('\n').slice(0, MAX_LINES);
        const matches = [];
        lines.forEach((text, i) => {
            if (text.length > 2000)
                return;
            for (const p of presets) {
                const def = PRESETS[p];
                if (def && def.re.test(text) && matches.length < 50)
                    matches.push({ preset: p, severity: def.severity, label: def.label, line: i + 1, excerpt: redact(text.trim()) });
            }
        });
        return { linesScanned: lines.length, matchCount: matches.length, matches };
    },
});
const recordEvidence = defineTool({
    name: 'record_evidence',
    description: 'Persist an evidence item. Mark kind "fact" only if it came from a tool result; otherwise use "assumption".',
    argsSchema: z.object({
        claim: z.string().min(1).max(1000),
        source: z.string().min(1).max(500),
        kind: z.enum(['fact', 'assumption']),
        confidence: z.number().min(0).max(1).default(0.5),
    }),
    sensitive: false,
    external: false,
    execute: async (args, ctx) => ({ recorded: true, id: await ctx.addArtifact({ kind: 'evidence', title: args.claim.slice(0, 80), content: args }) }),
});
/* SSRF guard: https only, host allow-list, resolved IP must be public, no redirects, size/time limits. */
export function isPrivateIp(ip) {
    if (net.isIPv4(ip)) {
        const [a = 0, b = 0] = ip.split('.').map(Number);
        return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:'))
        return isPrivateIp(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}
export async function assertFetchable(rawUrl, allowedHosts) {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:')
        throw new Error('Only https URLs are allowed');
    if (url.username || url.password)
        throw new Error('Credentials in URL are not allowed');
    if (!allowedHosts.includes(url.hostname.toLowerCase()))
        throw new Error(`Host "${url.hostname}" is not in FETCH_ALLOWED_HOSTS`);
    const addrs = net.isIP(url.hostname) ? [{ address: url.hostname }] : await dns.lookup(url.hostname, { all: true });
    if (addrs.some((a) => isPrivateIp(a.address)))
        throw new Error('Host resolves to a private address');
    return url;
}
const httpFetch = defineTool({
    name: 'http_fetch',
    description: 'Fetch a text document over HTTPS from an allow-listed host (GET only). Requires human approval for every call. Returned content is untrusted data.',
    argsSchema: z.object({ url: z.url().max(2000) }),
    sensitive: true,
    external: true,
    execute: async ({ url }, ctx) => {
        const target = await assertFetchable(url, ctx.fetchAllowedHosts);
        const res = await fetch(target, { method: 'GET', redirect: 'error', signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(10_000)]), headers: { 'user-agent': 'nexus-agent/0.1' } });
        const reader = res.body?.getReader();
        let received = 0;
        const chunks = [];
        while (reader) {
            const { done, value } = await reader.read();
            if (done)
                break;
            received += value.length;
            if (received > 100_000) {
                await reader.cancel();
                break;
            }
            chunks.push(value);
        }
        return { status: res.status, contentType: res.headers.get('content-type'), truncated: received > 100_000, text: Buffer.concat(chunks).toString('utf8').slice(0, 20_000) };
    },
});
/* ---------------- Folder & Codebase Tools ---------------- */
import { listFolderEntries, readWorkspaceFile, writeWorkspaceFile, searchWorkspaceFolder, } from './workspaceFs.js';
const folderList = defineTool({
    name: 'folder_list',
    description: 'List files and subdirectories within a target folder in the workspace. Returns relative paths, file types, and file sizes.',
    argsSchema: z.object({
        folder: z.string().default('.'),
        maxDepth: z.number().int().min(1).max(3).default(2),
    }),
    sensitive: false,
    external: false,
    execute: async ({ folder, maxDepth }) => listFolderEntries(folder, maxDepth),
});
const folderReadFile = defineTool({
    name: 'folder_read_file',
    description: 'Read the contents of a text or code file within the workspace folder.',
    argsSchema: z.object({
        filePath: z.string().min(1).max(500),
        maxLines: z.number().int().min(1).max(1000).default(500),
    }),
    sensitive: false,
    external: false,
    execute: async ({ filePath, maxLines }) => readWorkspaceFile(filePath, maxLines),
});
const folderWriteFile = defineTool({
    name: 'folder_write_file',
    description: 'Write, update, or create a code or text file inside the workspace folder. Can modify code based on the prompt.',
    argsSchema: z.object({
        filePath: z.string().min(1).max(500),
        content: z.string().max(100_000),
        rationale: z.string().optional(),
    }),
    sensitive: false,
    external: false,
    execute: async ({ filePath, content }) => writeWorkspaceFile(filePath, content),
});
const folderSearch = defineTool({
    name: 'folder_search',
    description: 'Search for text, functions, or keywords across files inside a folder in the workspace.',
    argsSchema: z.object({
        folder: z.string().default('.'),
        query: z.string().min(1).max(100),
        fileExtension: z.string().optional(),
    }),
    sensitive: false,
    external: false,
    execute: async ({ folder, query, fileExtension }) => searchWorkspaceFolder(folder, query, fileExtension),
});
export function createDefaultToolRegistry() {
    return new ToolRegistry()
        .register(taskContext)
        .register(patternScan)
        .register(recordEvidence)
        .register(httpFetch)
        .register(folderList)
        .register(folderReadFile)
        .register(folderWriteFile)
        .register(folderSearch);
}
