import fs from 'node:fs';
import path from 'node:path';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.drizzle',
  '.next',
  '.vscode',
  '.idea',
  'coverage',
]);

/**
 * Resolves the root workspace directory for the Nexus project.
 */
export function getWorkspaceRoot(): string {
  if (process.env.WORKSPACE_ROOT && fs.existsSync(process.env.WORKSPACE_ROOT)) {
    return path.resolve(process.env.WORKSPACE_ROOT);
  }
  const curr = process.cwd();
  const candidates = [
    curr,
    path.resolve(curr, '..'),
    path.resolve(curr, '../..'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'package.json'))) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(c, 'package.json'), 'utf8'));
        if (pkg.workspaces || pkg.name === 'nexus') return c;
      } catch {
        // continue
      }
    }
  }
  return curr;
}

/**
 * Ensures a relative or absolute path is strictly within the allowed workspace boundary.
 * Throws an error if path traversal (e.g. '../..') attempts to escape the root.
 */
export function safeResolvePath(relPath: string, rootDir: string = getWorkspaceRoot()): string {
  const normalized = relPath.replace(/^[/\\]+/, '');
  const target = path.resolve(rootDir, normalized);
  const relative = path.relative(rootDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Access denied: path "${relPath}" escapes workspace boundary`);
  }
  return target;
}

export interface FolderEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  sizeBytes?: number;
}

/**
 * Recursively inspects a directory up to maxDepth, ignoring system and dependency folders.
 */
export function listFolderEntries(
  folderRelPath = '.',
  maxDepth = 2,
  rootDir = getWorkspaceRoot()
): { folder: string; count: number; entries: FolderEntry[] } {
  const targetDir = safeResolvePath(folderRelPath, rootDir);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Directory not found: "${folderRelPath}"`);
  }

  const entries: FolderEntry[] = [];

  function walk(currentDir: string, depth: number) {
    if (depth > maxDepth || entries.length >= 100) return;
    let list: fs.Dirent[] = [];
    try {
      list = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of list) {
      if (IGNORED_DIRS.has(item.name) || item.name.startsWith('.env')) continue;
      const full = path.join(currentDir, item.name);
      const rel = path.relative(targetDir, full).replace(/\\/g, '/');

      if (item.isDirectory()) {
        entries.push({ path: rel, name: item.name, type: 'dir' });
        walk(full, depth + 1);
      } else if (item.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          // ignore
        }
        entries.push({ path: rel, name: item.name, type: 'file', sizeBytes: size });
      }
      if (entries.length >= 100) break;
    }
  }

  walk(targetDir, 1);
  return {
    folder: path.relative(rootDir, targetDir).replace(/\\/g, '/') || '.',
    count: entries.length,
    entries,
  };
}

/**
 * Reads text content of a file within the workspace safely.
 */
export function readWorkspaceFile(
  filePath: string,
  maxLines = 500,
  rootDir = getWorkspaceRoot()
): { filePath: string; totalLines: number; linesReturned: number; truncated: boolean; content: string } {
  const full = safeResolvePath(filePath, rootDir);
  const baseName = path.basename(full);
  if (baseName.startsWith('.env')) {
    throw new Error('Access denied: .env configuration files cannot be inspected by agents.');
  }
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
    throw new Error(`File not found: "${filePath}"`);
  }

  const content = fs.readFileSync(full, 'utf8');
  const lines = content.split('\n');
  const truncated = lines.length > maxLines;
  const sliced = lines.slice(0, maxLines).join('\n');

  return {
    filePath: path.relative(rootDir, full).replace(/\\/g, '/'),
    totalLines: lines.length,
    linesReturned: Math.min(lines.length, maxLines),
    truncated,
    content: sliced,
  };
}

/**
 * Writes or modifies a text file inside the workspace safely.
 */
export function writeWorkspaceFile(
  filePath: string,
  content: string,
  rootDir = getWorkspaceRoot()
): { filePath: string; bytesWritten: number; status: string } {
  const full = safeResolvePath(filePath, rootDir);
  const baseName = path.basename(full);
  if (baseName.startsWith('.env')) {
    throw new Error('Access denied: writing to .env files is blocked for security.');
  }

  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(full, content, 'utf8');
  return {
    filePath: path.relative(rootDir, full).replace(/\\/g, '/'),
    bytesWritten: Buffer.byteLength(content, 'utf8'),
    status: 'written',
  };
}

/**
 * Searches for keywords or pattern text across files inside a folder.
 */
export function searchWorkspaceFolder(
  folderRelPath = '.',
  query: string,
  fileExtension?: string,
  rootDir = getWorkspaceRoot()
): { folder: string; query: string; matchCount: number; matches: { file: string; line: number; text: string }[] } {
  const targetDir = safeResolvePath(folderRelPath, rootDir);
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    throw new Error(`Directory not found: "${folderRelPath}"`);
  }

  const matches: { file: string; line: number; text: string }[] = [];
  const qLower = query.toLowerCase();

  function searchDir(dir: string, depth = 0) {
    if (depth > 3 || matches.length >= 30) return;
    let list: fs.Dirent[] = [];
    try {
      list = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of list) {
      if (IGNORED_DIRS.has(item.name) || item.name.startsWith('.env')) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        searchDir(full, depth + 1);
      } else if (item.isFile()) {
        if (fileExtension && !item.name.endsWith(fileExtension)) continue;
        try {
          const content = fs.readFileSync(full, 'utf8');
          const lines = content.split('\n');
          for (let i = 0; i < lines.length && matches.length < 30; i++) {
            const line = lines[i];
            if (line && line.toLowerCase().includes(qLower)) {
              matches.push({
                file: path.relative(rootDir, full).replace(/\\/g, '/'),
                line: i + 1,
                text: line.trim().slice(0, 160),
              });
            }
          }
        } catch {
          // ignore unreadable/binary files
        }
      }
      if (matches.length >= 30) break;
    }
  }

  searchDir(targetDir);
  return {
    folder: path.relative(rootDir, targetDir).replace(/\\/g, '/') || '.',
    query,
    matchCount: matches.length,
    matches,
  };
}
