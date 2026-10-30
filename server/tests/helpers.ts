import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../src/config.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db/client.js';
import { seed } from '../src/db/seed.js';
import { buildApp } from '../src/http/app.js';
import { MockProvider } from '../src/orchestration/providers/mock.js';
import type { GenerateRequest, GenerateResult, LLMProvider } from '../src/orchestration/providers/types.js';
import { createDefaultToolRegistry, type ToolRegistry } from '../src/orchestration/tools.js';
import type { Store } from '../src/store/store.js';

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');

/** Deterministic provider whose behaviour can be overridden per request (return `undefined` to fall through to the mock). */
export class ScriptedProvider implements LLMProvider {
  readonly name = 'scripted'; readonly model = 'scripted'; readonly isMock = true;
  private base = new MockProvider();
  calls: { purpose: string; role?: string }[] = [];
  constructor(public override?: (req: GenerateRequest<unknown>, n: number) => unknown | Promise<unknown>) {}
  async generateObject<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const role = (req.meta as { role?: string } | undefined)?.role;
    this.calls.push({ purpose: req.purpose, role });
    const n = this.calls.filter((c) => c.purpose === req.purpose && c.role === role).length;
    const o = this.override ? await this.override(req as GenerateRequest<unknown>, n) : undefined;
    if (o !== undefined) return { object: req.schema.parse(o), usage: { inputTokens: 10, outputTokens: 10 }, latencyMs: 1 };
    return this.base.generateObject(req);
  }
}

export const turn = {
  final: (o: unknown) => ({ action: 'final', tool: null, argsJson: null, outputJson: typeof o === 'string' ? o : JSON.stringify(o), rationale: null }),
  tool: (tool: string, args: unknown = {}) => ({ action: 'tool_call', tool, argsJson: JSON.stringify(args), outputJson: null, rationale: 'test' }),
};

export function testConfig(over: Record<string, string> = {}): AppConfig {
  return loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret', RATE_LIMIT_MAX: '10000', AUTH_RATE_LIMIT_MAX: '10000', MAX_CONCURRENT_EXECUTIONS_PER_USER: '50', ...over } as NodeJS.ProcessEnv);
}

export async function makeEnv(opts: { provider?: LLMProvider; tools?: ToolRegistry; config?: Record<string, string> } = {}) {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  const provider = opts.provider ?? new ScriptedProvider();
  const built = await buildApp({ config: testConfig(opts.config), db: db as unknown as Db, provider, tools: opts.tools ?? createDefaultToolRegistry() });
  await seed(built.store);
  let n = 0;
  const makeUser = async () => {
    const email = `u${++n}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
    const res = await built.app.inject({ method: 'POST', url: '/api/auth/register', payload: { email, name: 'Test', password: 'correct-horse-battery' } });
    const body = res.json() as { token: string; user: { id: string } };
    return { id: body.user.id, token: body.token, auth: { authorization: `Bearer ${body.token}` } };
  };
  return { ...built, provider, db, makeUser, close: async () => { await built.app.close(); await client.close(); } };
}

export async function waitFor<T>(fn: () => Promise<T | undefined | false>, timeoutMs = 8000, label = 'condition'): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
export const statusOf = async (store: Store, id: string) => (await store.getExecution(id))!.status;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
