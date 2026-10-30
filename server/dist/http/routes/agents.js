import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { customAgentPrompt } from '../../orchestration/agents.js';
import { AppError } from '../../errors.js';
/** Capabilities owned by built-in agents: custom agents may not claim them (prevents hijacking routing/review). */
const RESERVED = new Set(['research', 'evidence', 'analysis', 'risk-assessment', 'review', 'verification', 'planning', 'aggregation']);
const Capability = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,31}$/, 'lowercase letters, digits, - or _').refine((c) => !RESERVED.has(c), 'capability is reserved for built-in agents');
const AgentInput = z.object({
    name: z.string().trim().min(2).max(60),
    description: z.string().trim().max(600).default(''),
    capabilities: z.array(Capability).min(1).max(8),
    allowedTools: z.array(z.string().max(64)).max(10).default([]),
});
const AgentPatch = AgentInput.partial().extend({ enabled: z.boolean().optional() });
export async function agentRoutes(api, { app, store, tools }) {
    const auth = { onRequest: [app.authenticate] };
    const checkTools = (names) => { for (const n of names)
        if (!tools.has(n))
            throw AppError.badRequest(`Unknown tool "${n}"`); };
    api.get('/agents', auth, async (req) => {
        const [agents, stats] = await Promise.all([store.listAgents(req.user.sub), store.agentStats(req.user.sub)]);
        const bySlug = new Map(stats.map((s) => [s.slug, s]));
        return { agents: agents.map((a) => ({ ...a, systemPrompt: a.isBuiltin ? a.systemPrompt : undefined, stats: bySlug.get(a.slug) ?? { runs: 0, completed: 0, failed: 0, avgMs: 0 } })) };
    });
    api.post('/agents', auth, async (req, reply) => {
        const b = AgentInput.parse(req.body);
        checkTools(b.allowedTools);
        const slug = `custom-${b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}-${randomBytes(3).toString('hex')}`;
        const agent = await store.createAgent({ slug, name: b.name, description: b.description, role: 'custom', capabilities: [...new Set(b.capabilities)], allowedTools: [...new Set(b.allowedTools)], systemPrompt: customAgentPrompt(b.name, b.description), enabled: true, ownerId: req.user.sub });
        return reply.status(201).send({ agent });
    });
    api.patch('/agents/:id', auth, async (req) => {
        const { id } = z.object({ id: z.uuid() }).parse(req.params);
        const b = AgentPatch.parse(req.body);
        const existing = await store.getAgentForUser(id, req.user.sub);
        if (!existing)
            throw AppError.notFound('Agent not found');
        if (existing.isBuiltin)
            throw AppError.forbidden('Built-in agents are read-only');
        if (b.allowedTools)
            checkTools(b.allowedTools);
        const name = b.name ?? existing.name;
        const description = b.description ?? existing.description;
        const updated = await store.updateOwnAgent(id, req.user.sub, { ...b, systemPrompt: customAgentPrompt(name, description) });
        if (!updated)
            throw AppError.notFound('Agent not found');
        return { agent: updated };
    });
    api.delete('/agents/:id', auth, async (req, reply) => {
        const { id } = z.object({ id: z.uuid() }).parse(req.params);
        const existing = await store.getAgentForUser(id, req.user.sub);
        if (!existing)
            throw AppError.notFound('Agent not found');
        if (existing.isBuiltin)
            throw AppError.forbidden('Built-in agents cannot be deleted');
        await store.deleteOwnAgent(id, req.user.sub);
        return reply.status(204).send();
    });
}
