import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { DEFAULT_LIMITS } from '../../orchestration/types.js';
import type { RouteCtx } from '../app.js';

export async function metaRoutes(api: FastifyInstance, { app, store, tools, config, provider, db }: RouteCtx) {
  const auth = { onRequest: [app.authenticate] };
  const started = Date.now();

  api.get('/health', async () => ({ status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000) }));
  api.get('/health/ready', async (_req, reply) => {
    try { await db.execute(sql`select 1`); return { status: 'ready', database: 'ok', provider: { name: provider.name, mock: provider.isMock } }; }
    catch { return reply.status(503).send({ status: 'degraded', database: 'down' }); }
  });

  api.get('/tools', auth, async () => {
    const rows = await store.listTools();
    return { tools: rows.map((r) => ({ ...r, args: tools.describe([r.name])[0]?.args })) };
  });

  api.get('/dashboard', auth, async (req) => {
    const [stats, recent] = await Promise.all([store.dashboardStats(req.user.sub), store.listExecutions(req.user.sub, { limit: 8, offset: 0 })]);
    return { ...stats, recent: recent.items };
  });

  /** Read-only: secrets are never returned, only whether a provider is configured. Change settings via environment variables. */
  api.get('/settings', auth, async (req) => {
    let dbOk = true;
    try { await db.execute(sql`select 1`); } catch { dbOk = false; }
    const stats = await store.dashboardStats(req.user.sub);
    return {
      provider: { name: provider.name, model: provider.model, mock: provider.isMock, configured: provider.isMock ? false : true },
      defaultLimits: DEFAULT_LIMITS,
      policies: { maxParallelSteps: config.MAX_PARALLEL_STEPS, approvalTimeoutMs: config.APPROVAL_TIMEOUT_MS, maxRetryChain: config.MAX_RETRY_CHAIN, maxConcurrentExecutionsPerUser: config.MAX_CONCURRENT_EXECUTIONS_PER_USER, rateLimitPerMinute: config.RATE_LIMIT_MAX },
      integrations: { fetchAllowedHosts: config.fetchAllowedHosts },
      cost: { per1kInputUsd: config.COST_PER_1K_INPUT_USD, per1kOutputUsd: config.COST_PER_1K_OUTPUT_USD, totals: stats.totals },
      health: { api: 'ok', database: dbOk ? 'ok' : 'down' },
    };
  });
}
