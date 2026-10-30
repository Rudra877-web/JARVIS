import { and, asc, desc, eq, gt, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import * as s from '../db/schema.js';
import type { ExecutionEvent } from '../orchestration/events.js';
import type { AgentDef, ExecutionStatus, Limits, Plan, StepStatus, ToolCallRecord, VerificationStatus } from '../orchestration/types.js';

export type ExecutionRow = typeof s.executions.$inferSelect;
export type StepRow = typeof s.executionSteps.$inferSelect;
export type ApprovalRow = typeof s.approvalRequests.$inferSelect;
export type ArtifactRow = typeof s.executionArtifacts.$inferSelect;
export type UserRow = typeof s.users.$inferSelect;
export type ToolRow = typeof s.tools.$inferSelect;
export type TaskRow = typeof s.tasks.$inferSelect;

const toAgent = (r: typeof s.agents.$inferSelect): AgentDef => ({
  id: r.id, slug: r.slug, name: r.name, description: r.description, role: r.role as AgentDef['role'],
  capabilities: r.capabilities, allowedTools: r.allowedTools, systemPrompt: r.systemPrompt,
  enabled: r.enabled, isBuiltin: r.isBuiltin, ownerId: r.ownerId,
});

export interface ExecutionFilters {
  status?: ExecutionStatus[]; q?: string; from?: Date; to?: Date; agentSlug?: string; limit: number; offset: number;
}

/** All persistence goes through here. Tenant isolation: every user-facing read takes a userId. */
export class Store {
  constructor(readonly db: Db) {}

  /* ---- users ---- */
  async createUser(v: { email: string; name: string; passwordHash: string }) {
    const [row] = await this.db.insert(s.users).values({ ...v, email: v.email.toLowerCase() }).returning();
    return row!;
  }
  async getUserByEmail(email: string) { return (await this.db.select().from(s.users).where(eq(s.users.email, email.toLowerCase())).limit(1))[0]; }
  async getUserById(id: string) { return (await this.db.select().from(s.users).where(eq(s.users.id, id)).limit(1))[0]; }

  /* ---- agents ---- */
  /** Built-in agents + the user's own custom agents. */
  async listAgents(userId: string): Promise<AgentDef[]> {
    const rows = await this.db.select().from(s.agents).where(or(eq(s.agents.isBuiltin, true), eq(s.agents.ownerId, userId))).orderBy(desc(s.agents.isBuiltin), asc(s.agents.name));
    return rows.map(toAgent);
  }
  async getAgentForUser(id: string, userId: string) {
    const r = (await this.db.select().from(s.agents).where(and(eq(s.agents.id, id), or(eq(s.agents.isBuiltin, true), eq(s.agents.ownerId, userId)))).limit(1))[0];
    return r ? toAgent(r) : undefined;
  }
  async upsertBuiltinAgent(a: Omit<AgentDef, 'id' | 'ownerId'>) {
    await this.db.insert(s.agents).values({ ...a, ownerId: null, isBuiltin: true }).onConflictDoUpdate({
      target: s.agents.slug,
      set: { name: a.name, description: a.description, role: a.role, capabilities: a.capabilities, allowedTools: a.allowedTools, systemPrompt: a.systemPrompt, updatedAt: new Date() },
    });
  }
  async createAgent(v: Omit<AgentDef, 'id' | 'isBuiltin'> & { ownerId: string }) {
    const [r] = await this.db.insert(s.agents).values({ ...v, isBuiltin: false }).returning();
    return toAgent(r!);
  }
  async updateOwnAgent(id: string, ownerId: string, patch: Partial<Pick<AgentDef, 'name' | 'description' | 'capabilities' | 'allowedTools' | 'systemPrompt' | 'enabled'>>) {
    const [r] = await this.db.update(s.agents).set({ ...patch, updatedAt: new Date() }).where(and(eq(s.agents.id, id), eq(s.agents.ownerId, ownerId), eq(s.agents.isBuiltin, false))).returning();
    return r ? toAgent(r) : undefined;
  }
  async deleteOwnAgent(id: string, ownerId: string) {
    const r = await this.db.delete(s.agents).where(and(eq(s.agents.id, id), eq(s.agents.ownerId, ownerId), eq(s.agents.isBuiltin, false))).returning({ id: s.agents.id });
    return r.length > 0;
  }
  async agentStats(userId: string) {
    const rows = await this.db.select({
      slug: s.executionSteps.agentSlug,
      runs: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${s.executionSteps.status} = 'COMPLETED')::int`,
      failed: sql<number>`count(*) filter (where ${s.executionSteps.status} = 'FAILED')::int`,
      avgMs: sql<number>`coalesce(avg(${s.executionSteps.durationMs}), 0)::int`,
    }).from(s.executionSteps).innerJoin(s.executions, eq(s.executions.id, s.executionSteps.executionId))
      .where(eq(s.executions.userId, userId)).groupBy(s.executionSteps.agentSlug);
    return rows;
  }

  /* ---- tools ---- */
  async syncTools(defs: { name: string; description: string; sensitive: boolean; external: boolean }[]) {
    for (const d of defs) {
      await this.db.insert(s.tools).values(d).onConflictDoUpdate({ target: s.tools.name, set: { description: d.description, sensitive: d.sensitive, external: d.external } });
    }
  }
  async listTools() { return this.db.select().from(s.tools).orderBy(asc(s.tools.name)); }

  /* ---- tasks / executions ---- */
  async createTaskWithExecution(v: {
    userId: string; title: string; description: string; context: string; limits: Limits;
    selectedAgents: string[]; selectedTools: string[]; mock: boolean; provider: string; model: string; retryOf?: string | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [task] = await tx.insert(s.tasks).values({ userId: v.userId, title: v.title, description: v.description, context: v.context }).returning();
      const [exec] = await tx.insert(s.executions).values({
        taskId: task!.id, userId: v.userId, limits: v.limits, selectedAgents: v.selectedAgents, selectedTools: v.selectedTools,
        mock: v.mock, provider: v.provider, model: v.model, retryOf: v.retryOf ?? null,
      }).returning();
      return { task: task!, execution: exec! };
    });
  }
  async getExecution(id: string) { return (await this.db.select().from(s.executions).where(eq(s.executions.id, id)).limit(1))[0]; }
  async getExecutionForUser(id: string, userId: string) {
    return (await this.db.select().from(s.executions).where(and(eq(s.executions.id, id), eq(s.executions.userId, userId))).limit(1))[0];
  }
  async getTask(id: string) { return (await this.db.select().from(s.tasks).where(eq(s.tasks.id, id)).limit(1))[0]; }

  /** Atomic compare-and-set state transition; returns undefined if the execution was not in one of `from`. */
  async transition(id: string, from: readonly ExecutionStatus[], to: ExecutionStatus, patch: Partial<{
    plan: Plan; error: string | null; verificationStatus: VerificationStatus; finalReport: unknown; startedAt: Date; finishedAt: Date;
  }> = {}) {
    const [r] = await this.db.update(s.executions).set({ ...patch, status: to, updatedAt: new Date() })
      .where(and(eq(s.executions.id, id), inArray(s.executions.status, [...from]))).returning();
    return r;
  }
  async addExecutionUsage(id: string, v: { tokensIn: number; tokensOut: number; costUsd: number }) {
    await this.db.update(s.executions).set({
      tokensIn: sql`${s.executions.tokensIn} + ${v.tokensIn}`, tokensOut: sql`${s.executions.tokensOut} + ${v.tokensOut}`,
      costUsd: sql`${s.executions.costUsd} + ${v.costUsd}`, updatedAt: new Date(),
    }).where(eq(s.executions.id, id));
  }

  async listExecutions(userId: string, f: ExecutionFilters) {
    const conds: SQL[] = [eq(s.executions.userId, userId)];
    if (f.status?.length) conds.push(inArray(s.executions.status, f.status));
    if (f.from) conds.push(gte(s.executions.createdAt, f.from));
    if (f.to) conds.push(lte(s.executions.createdAt, f.to));
    if (f.q) conds.push(ilike(s.tasks.title, `%${f.q.replace(/[%_\\]/g, '\\$&')}%`));
    if (f.agentSlug) conds.push(sql`exists (select 1 from ${s.executionSteps} es where es.execution_id = ${s.executions.id} and es.agent_slug = ${f.agentSlug})`);
    const where = and(...conds);
    const items = await this.db.select({ execution: s.executions, taskTitle: s.tasks.title })
      .from(s.executions).innerJoin(s.tasks, eq(s.tasks.id, s.executions.taskId)).where(where)
      .orderBy(desc(s.executions.createdAt)).limit(f.limit).offset(f.offset);
    const [{ count } = { count: 0 }] = await this.db.select({ count: sql<number>`count(*)::int` })
      .from(s.executions).innerJoin(s.tasks, eq(s.tasks.id, s.executions.taskId)).where(where);
    return { items: items.map((i) => ({ ...i.execution, taskTitle: i.taskTitle })), total: count };
  }

  async countActiveExecutions(userId: string) {
    const [r] = await this.db.select({ c: sql<number>`count(*)::int` }).from(s.executions)
      .where(and(eq(s.executions.userId, userId), inArray(s.executions.status, ['PLANNING', 'RUNNING', 'VERIFYING'])));
    return r?.c ?? 0;
  }
  async listInterruptedExecutions() {
    return this.db.select().from(s.executions).where(inArray(s.executions.status, ['PLANNING', 'RUNNING', 'VERIFYING']));
  }
  async retryDepth(id: string): Promise<number> {
    let depth = 0; let cur: string | null | undefined = id;
    while (cur && depth < 20) {
      const e: ExecutionRow | undefined = await this.getExecution(cur);
      cur = e?.retryOf; if (cur) depth++;
    }
    return depth;
  }

  /* ---- steps ---- */
  async insertSteps(rows: (typeof s.executionSteps.$inferInsert)[]) {
    if (!rows.length) return [];
    return this.db.insert(s.executionSteps).values(rows).onConflictDoNothing().returning();
  }
  async updateStep(executionId: string, stepKey: string, patch: Partial<{
    status: StepStatus; attempt: number; revision: number; output: unknown; toolCalls: ToolCallRecord[]; error: string | null;
    skipReason: string | null; tokensIn: number; tokensOut: number; durationMs: number; startedAt: Date; finishedAt: Date;
  }>) {
    const [r] = await this.db.update(s.executionSteps).set(patch).where(and(eq(s.executionSteps.executionId, executionId), eq(s.executionSteps.stepKey, stepKey))).returning();
    return r;
  }
  async listSteps(executionId: string) {
    return this.db.select().from(s.executionSteps).where(eq(s.executionSteps.executionId, executionId)).orderBy(asc(s.executionSteps.createdAt), asc(s.executionSteps.stepKey));
  }

  /* ---- events ---- */
  async appendEvent(executionId: string, userId: string, type: string, payload: Record<string, unknown>): Promise<ExecutionEvent> {
    const [r] = await this.db.insert(s.executionEvents).values({ executionId, type, payload }).returning();
    return { id: r!.id, executionId, userId, seq: Number(r!.seq), type, payload, createdAt: r!.createdAt.toISOString() };
  }
  async listEvents(executionId: string, afterSeq = 0, limit = 500) {
    const rows = await this.db.select().from(s.executionEvents).where(and(eq(s.executionEvents.executionId, executionId), gt(s.executionEvents.seq, afterSeq))).orderBy(asc(s.executionEvents.seq)).limit(limit);
    return rows.map((r) => ({ id: r.id, executionId, seq: Number(r.seq), type: r.type, payload: r.payload as Record<string, unknown>, createdAt: r.createdAt.toISOString() }));
  }

  /* ---- approvals ---- */
  async createApproval(v: { executionId: string; stepKey: string; userId: string; toolName: string; arguments: unknown; reason: string }) {
    const [r] = await this.db.insert(s.approvalRequests).values(v).returning();
    return r!;
  }
  async getApprovalForUser(id: string, userId: string) {
    return (await this.db.select().from(s.approvalRequests).where(and(eq(s.approvalRequests.id, id), eq(s.approvalRequests.userId, userId))).limit(1))[0];
  }
  async decideApproval(id: string, userId: string, status: 'approved' | 'rejected' | 'expired') {
    const [r] = await this.db.update(s.approvalRequests).set({ status, decidedAt: new Date() })
      .where(and(eq(s.approvalRequests.id, id), eq(s.approvalRequests.userId, userId), eq(s.approvalRequests.status, 'pending'))).returning();
    return r;
  }
  async expirePendingApprovals(executionId: string) {
    return this.db.update(s.approvalRequests).set({ status: 'expired', decidedAt: new Date() })
      .where(and(eq(s.approvalRequests.executionId, executionId), eq(s.approvalRequests.status, 'pending'))).returning();
  }
  async listApprovals(userId: string, status?: ApprovalRow['status']) {
    const conds = [eq(s.approvalRequests.userId, userId)];
    if (status) conds.push(eq(s.approvalRequests.status, status));
    return this.db.select().from(s.approvalRequests).where(and(...conds)).orderBy(desc(s.approvalRequests.createdAt)).limit(100);
  }

  /* ---- artifacts / usage ---- */
  async addArtifact(v: { executionId: string; stepKey?: string | null; kind: 'evidence' | 'report' | 'note'; title: string; content: unknown }) {
    const [r] = await this.db.insert(s.executionArtifacts).values({ ...v, stepKey: v.stepKey ?? null }).returning();
    return r!;
  }
  async listArtifacts(executionId: string) { return this.db.select().from(s.executionArtifacts).where(eq(s.executionArtifacts.executionId, executionId)).orderBy(asc(s.executionArtifacts.createdAt)); }
  async recordUsage(v: typeof s.providerUsageRecords.$inferInsert) { await this.db.insert(s.providerUsageRecords).values(v); }

  /* ---- dashboard ---- */
  async dashboardStats(userId: string) {
    const byStatus = await this.db.select({ status: s.executions.status, c: sql<number>`count(*)::int` }).from(s.executions).where(eq(s.executions.userId, userId)).groupBy(s.executions.status);
    const [tot] = await this.db.select({
      tokensIn: sql<number>`coalesce(sum(${s.executions.tokensIn}),0)::int`, tokensOut: sql<number>`coalesce(sum(${s.executions.tokensOut}),0)::int`,
      cost: sql<number>`coalesce(sum(${s.executions.costUsd}),0)::float`,
      avgDurationMs: sql<number>`coalesce(avg(extract(epoch from (${s.executions.finishedAt} - ${s.executions.startedAt})) * 1000) filter (where ${s.executions.finishedAt} is not null and ${s.executions.startedAt} is not null),0)::int`,
    }).from(s.executions).where(eq(s.executions.userId, userId));
    return { byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.c])) as Record<string, number>, totals: tot!, agents: await this.agentStats(userId) };
  }
}

export async function closeOpenSteps(store: Store, executionId: string, to: 'FAILED' | 'CANCELLED', error?: string) {
  await store.db.update(s.executionSteps)
    .set({ status: to, error: error ?? null, finishedAt: new Date() })
    .where(and(eq(s.executionSteps.executionId, executionId), inArray(s.executionSteps.status, ['PENDING', 'RUNNING', 'AWAITING_APPROVAL'])));
}
