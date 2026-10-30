import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ZodError, z } from 'zod';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/client.js';
import { AppError } from '../errors.js';
import { EventBus } from '../orchestration/events.js';
import { Orchestrator } from '../orchestration/engine.js';
import type { LLMProvider } from '../orchestration/providers/types.js';
import { createDefaultToolRegistry, type ToolRegistry } from '../orchestration/tools.js';
import { Store } from '../store/store.js';
import { agentRoutes } from './routes/agents.js';
import { authRoutes } from './routes/auth.js';
import { executionRoutes } from './routes/executions.js';
import { folderRoutes } from './routes/folders.js';
import { metaRoutes } from './routes/meta.js';
import { attachSocket } from './socket.js';

declare module 'fastify' {
  interface FastifyInstance { authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void> }
}
declare module '@fastify/jwt' {
  interface FastifyJWT { payload: { sub: string; email: string }; user: { sub: string; email: string } }
}

export interface AppDeps { config: AppConfig; db: Db; provider: LLMProvider; tools?: ToolRegistry; bus?: EventBus }

export async function buildApp(deps: AppDeps) {
  const { config } = deps;
  const app = Fastify({ logger: config.NODE_ENV === 'test' ? false : { level: 'info', redact: ['req.headers.authorization'] }, bodyLimit: 1_000_000 });
  const store = new Store(deps.db);
  const bus = deps.bus ?? new EventBus();
  const tools = deps.tools ?? createDefaultToolRegistry();
  const orchestrator = new Orchestrator({ store, provider: deps.provider, tools, bus, config });

  await app.register(helmet);
  await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: '1 minute' });
  await app.register(jwt, { secret: config.JWT_SECRET, sign: { expiresIn: '12h' } });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    try { await req.jwtVerify(); } catch { throw AppError.unauthorized(); }
  });

  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    if (err instanceof ZodError) return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: z.prettifyError(err), issues: err.issues.map((i) => ({ path: i.path, message: i.message })) } });
    if (err instanceof AppError) return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    if (err.statusCode === 429) return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } });
    if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: err.message } });
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Internal server error' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } }));

  const ctx = { app, store, orchestrator, tools, config, provider: deps.provider, db: deps.db };
  await app.register(async (api) => {
    await metaRoutes(api, ctx);
    await authRoutes(api, ctx);
    await agentRoutes(api, ctx);
    await executionRoutes(api, ctx);
    await folderRoutes(api, ctx);
  }, { prefix: '/api' });

  const io = attachSocket(app, { store, bus, config });
  await store.syncTools(tools.list().map((t) => ({ name: t.name, description: t.description, sensitive: t.sensitive, external: t.external })));
  return { app, store, orchestrator, bus, io, tools };
}
export type AppContext = Awaited<ReturnType<typeof buildApp>> extends infer R ? R : never;
export interface RouteCtx { app: Awaited<ReturnType<typeof buildApp>>['app']; store: Store; orchestrator: Orchestrator; tools: ToolRegistry; config: AppConfig; provider: LLMProvider; db: Db }
