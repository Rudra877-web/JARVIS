import { z } from 'zod';
import { AppError } from '../../errors.js';
import { EXECUTION_STATUSES } from '../../db/schema.js';
import { LimitsSchema } from '../../orchestration/types.js';
const Uuid = z.object({ id: z.uuid() });
const TaskInput = z.object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().min(10).max(8000),
    context: z.string().max(200_000).default(''),
    agentSlugs: z.array(z.string().max(80)).max(30).optional(),
    toolNames: z.array(z.string().max(64)).max(20).optional(),
    limits: LimitsSchema.partial().optional(),
});
const ListQuery = z.object({
    status: z.string().optional().transform((v) => v?.split(',').filter(Boolean)).pipe(z.array(z.enum(EXECUTION_STATUSES)).optional()),
    q: z.string().max(100).optional(),
    agent: z.string().max(80).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export async function executionRoutes(api, { app, store, orchestrator }) {
    const auth = { onRequest: [app.authenticate] };
    const owned = async (id, userId) => {
        const e = await store.getExecutionForUser(id, userId);
        if (!e)
            throw AppError.notFound('Execution not found'); // never reveal that another user's execution exists
        return e;
    };
    /** Submit a task; responds with the execution + plan preview (AWAITING_APPROVAL). */
    api.post('/tasks', auth, async (req, reply) => {
        const b = TaskInput.parse(req.body);
        const exec = await orchestrator.submitTask(req.user.sub, b);
        return reply.status(201).send({ execution: exec });
    });
    api.post('/executions/:id/approve', auth, async (req) => {
        const { id } = Uuid.parse(req.params);
        return { execution: await orchestrator.approve(id, req.user.sub) };
    });
    api.post('/executions/:id/cancel', auth, async (req) => {
        const { id } = Uuid.parse(req.params);
        return { execution: await orchestrator.cancel(id, req.user.sub) };
    });
    api.post('/executions/:id/retry', auth, async (req, reply) => {
        const { id } = Uuid.parse(req.params);
        return reply.status(201).send({ execution: await orchestrator.retry(id, req.user.sub) });
    });
    api.get('/executions', auth, async (req) => {
        const q = ListQuery.parse(req.query);
        const { items, total } = await store.listExecutions(req.user.sub, { status: q.status, q: q.q, agentSlug: q.agent, from: q.from, to: q.to, limit: q.pageSize, offset: (q.page - 1) * q.pageSize });
        return { items, total, page: q.page, pageSize: q.pageSize };
    });
    api.get('/executions/:id', auth, async (req) => {
        const { id } = Uuid.parse(req.params);
        const execution = await owned(id, req.user.sub);
        const [task, steps, artifacts, approvals] = await Promise.all([
            store.getTask(execution.taskId), store.listSteps(id), store.listArtifacts(id),
            store.listApprovals(req.user.sub).then((a) => a.filter((x) => x.executionId === id)),
        ]);
        return { execution, task, steps, artifacts, approvals, live: orchestrator.isRunning(id) };
    });
    api.get('/executions/:id/events', auth, async (req) => {
        const { id } = Uuid.parse(req.params);
        const { afterSeq } = z.object({ afterSeq: z.coerce.number().int().min(0).default(0) }).parse(req.query);
        await owned(id, req.user.sub);
        return { events: await store.listEvents(id, afterSeq) };
    });
    api.get('/approvals', auth, async (req) => {
        const { status } = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional() }).parse(req.query);
        return { approvals: await store.listApprovals(req.user.sub, status) };
    });
    api.post('/approvals/:id/decision', auth, async (req) => {
        const { id } = Uuid.parse(req.params);
        const { decision } = z.object({ decision: z.enum(['approved', 'rejected']) }).parse(req.body);
        const existing = await store.getApprovalForUser(id, req.user.sub);
        if (!existing)
            throw AppError.notFound('Approval request not found');
        const decided = await store.decideApproval(id, req.user.sub, decision);
        if (!decided)
            throw AppError.conflict(`Approval already ${existing.status}`);
        orchestrator.resolveApproval(id, decision);
        return { approval: decided };
    });
}
