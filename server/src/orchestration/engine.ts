import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';
import type { ExecutionRow, Store, TaskRow } from '../store/store.js';
import { closeOpenSteps } from '../store/store.js';
import { AgentRegistry } from './agents.js';
import type { EventBus } from './events.js';
import { validateAndResolvePlan } from './planner.js';
import { agentPrompt, aggregatePrompt, planPrompt, untrusted } from './prompts.js';
import type { GenerateRequest, LLMProvider } from './providers/types.js';
import type { ToolRegistry } from './tools.js';
import {
  type AgentDef, AgentTurnSchema, allowedFrom, BudgetExceededError, CancelledError, type ExecutionStatus, FinalReportSchema,
  InvalidOutputError, type Limits, LimitsSchema, OrchestrationError, OUTPUT_SCHEMAS, type Plan, PlanSchema, type PlanStep, SEVERITY_ORDER,
  type Severity, type StepOutput, type StepStatus, StepTimeoutError, TERMINAL, type ToolCallRecord, type VerificationStatus,
} from './types.js';

export type EngineConfig = Pick<AppConfig, 'COST_PER_1K_INPUT_USD' | 'COST_PER_1K_OUTPUT_USD' | 'APPROVAL_TIMEOUT_MS' | 'MAX_PARALLEL_STEPS' | 'MAX_RETRY_CHAIN' | 'MAX_CONCURRENT_EXECUTIONS_PER_USER' | 'fetchAllowedHosts'>;

export interface SubmitInput {
  title: string; description: string; context: string;
  agentSlugs?: string[]; toolNames?: string[]; limits?: Partial<Limits>;
}

interface StepState {
  key: string;
  def: PlanStep;
  agent: AgentDef;
  status: StepStatus;
  skipKind?: 'condition' | 'dependency';
  output?: StepOutput;
  toolCalls: ToolCallRecord[];
  attempt: number;
  revision: number;
  tokensIn: number;
  tokensOut: number;
}

interface RunCtx {
  exec: ExecutionRow;
  task: TaskRow;
  limits: Limits;
  registry: AgentRegistry;
  signal: AbortSignal;
  allowedTools: Set<string>;
  steps: Map<string, StepState>;
  turns: number;
  tokens: number;
  haltReason?: string;
}

/** A timer that can be paused (used while waiting on a human so approval time never counts against the step timeout). */
class Deadline {
  private timer?: NodeJS.Timeout;
  private remaining: number;
  private startedAt = 0;
  constructor(ms: number, private onExpire: () => void) { this.remaining = ms; this.resume(); }
  pause() { if (this.timer) { clearTimeout(this.timer); this.timer = undefined; this.remaining -= Date.now() - this.startedAt; } }
  resume() { if (!this.timer) { this.startedAt = Date.now(); this.timer = setTimeout(this.onExpire, Math.max(this.remaining, 1)); } }
  clear() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
}

const isTerminalStep = (s: StepStatus) => s === 'COMPLETED' || s === 'FAILED' || s === 'SKIPPED' || s === 'CANCELLED';
const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Orchestrator {
  private runs = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private approvalWaiters = new Map<string, (s: 'approved' | 'rejected' | 'expired') => void>();

  constructor(private deps: { store: Store; provider: LLMProvider; tools: ToolRegistry; bus: EventBus; config: EngineConfig }) {}

  private get store() { return this.deps.store; }

  /* ================= public API ================= */

  /** Create task + execution and synchronously produce a plan preview (PENDING → PLANNING → AWAITING_APPROVAL). */
  async submitTask(userId: string, input: SubmitInput, retryOf?: string): Promise<ExecutionRow> {
    if ((await this.store.countActiveExecutions(userId)) >= this.deps.config.MAX_CONCURRENT_EXECUTIONS_PER_USER) {
      throw AppError.tooMany('Too many active executions; wait for one to finish or cancel it.');
    }
    const agents = (await this.store.listAgents(userId)).filter((a) => a.enabled);
    const knownSlugs = new Set(agents.map((a) => a.slug));
    const requested = input.agentSlugs?.length ? input.agentSlugs : agents.filter((a) => a.role !== 'coordinator').map((a) => a.slug);
    for (const slug of requested) if (!knownSlugs.has(slug)) throw AppError.badRequest(`Unknown or disabled agent "${slug}"`);
    const selectedAgents = [...new Set(['coordinator', ...requested])];

    const registryTools = this.deps.tools.list();
    const selectedTools = input.toolNames ?? registryTools.filter((t) => !t.sensitive).map((t) => t.name);
    for (const t of selectedTools) if (!this.deps.tools.has(t)) throw AppError.badRequest(`Unknown tool "${t}"`);

    const limits = LimitsSchema.parse({ ...input.limits });
    const { execution } = await this.store.createTaskWithExecution({
      userId, title: input.title, description: input.description, context: input.context, limits,
      selectedAgents, selectedTools, mock: this.deps.provider.isMock, provider: this.deps.provider.name, model: this.deps.provider.model, retryOf,
    });
    await this.emit(execution, 'execution.created', { status: 'PENDING', mock: execution.mock });
    await this.plan(execution.id);
    return (await this.store.getExecution(execution.id))!;
  }

  /** AWAITING_APPROVAL → RUNNING; execution continues in the background. */
  async approve(executionId: string, userId: string): Promise<ExecutionRow> {
    const exec = await this.store.getExecutionForUser(executionId, userId);
    if (!exec) throw AppError.notFound('Execution not found');
    const updated = await this.store.transition(executionId, ['AWAITING_APPROVAL'], 'RUNNING', { startedAt: new Date() });
    if (!updated) throw AppError.conflict(`Execution is ${exec.status}; only AWAITING_APPROVAL executions can be approved`);
    await this.emit(updated, 'execution.status', { status: 'RUNNING', from: 'AWAITING_APPROVAL' });
    const controller = new AbortController();
    const done = this.run(updated, controller).finally(() => this.runs.delete(executionId));
    this.runs.set(executionId, { controller, done });
    return updated;
  }

  async cancel(executionId: string, userId: string): Promise<ExecutionRow> {
    const exec = await this.store.getExecutionForUser(executionId, userId);
    if (!exec) throw AppError.notFound('Execution not found');
    if (TERMINAL.includes(exec.status as ExecutionStatus)) throw AppError.conflict(`Execution already ${exec.status}`);
    const live = this.runs.get(executionId);
    if (live) {
      live.controller.abort();            // the run loop finalises CANCELLED itself
      await live.done.catch(() => undefined);
    } else {
      const t = await this.store.transition(executionId, allowedFrom('CANCELLED'), 'CANCELLED', { finishedAt: new Date() });
      if (t) {
        await this.store.expirePendingApprovals(executionId);
        await closeOpenSteps(this.store, executionId, 'CANCELLED');
        await this.emit(t, 'execution.status', { status: 'CANCELLED' });
      }
    }
    return (await this.store.getExecution(executionId))!;
  }

  async retry(executionId: string, userId: string): Promise<ExecutionRow> {
    const exec = await this.store.getExecutionForUser(executionId, userId);
    if (!exec) throw AppError.notFound('Execution not found');
    if (exec.status !== 'FAILED') throw AppError.conflict('Only FAILED executions can be retried');
    if ((await this.store.retryDepth(executionId)) >= this.deps.config.MAX_RETRY_CHAIN) throw AppError.conflict('Retry chain limit reached; create a new task instead');
    const task = await this.store.getTask(exec.taskId);
    if (!task) throw AppError.notFound('Task not found');
    // A retry re-plans and requires fresh plan approval; nothing sensitive is replayed automatically.
    return this.submitTask(userId, {
      title: task.title, description: task.description, context: task.context,
      agentSlugs: exec.selectedAgents.filter((s) => s !== 'coordinator'), toolNames: exec.selectedTools, limits: LimitsSchema.parse(exec.limits),
    }, executionId);
  }

  /** Called by the approvals route after the DB decision is persisted. */
  resolveApproval(approvalId: string, status: 'approved' | 'rejected') { this.approvalWaiters.get(approvalId)?.(status); }

  isRunning(id: string) { return this.runs.has(id); }
  waitFor(id: string) { return this.runs.get(id)?.done ?? Promise.resolve(); }

  /** Startup recovery: executions that were mid-flight when the process died cannot be resumed in-memory — fail them cleanly (retryable). */
  async recover(): Promise<number> {
    const stuck = await this.store.listInterruptedExecutions();
    for (const e of stuck) {
      const t = await this.store.transition(e.id, ['PLANNING', 'RUNNING', 'VERIFYING'], 'FAILED', { error: 'Interrupted by server restart', finishedAt: new Date() });
      if (!t) continue;
      await this.store.expirePendingApprovals(e.id);
      await closeOpenSteps(this.store, e.id, 'FAILED', 'Interrupted by server restart');
      await this.emit(t, 'execution.status', { status: 'FAILED', error: 'Interrupted by server restart' });
    }
    return stuck.length;
  }

  /* ================= planning ================= */

  private async registryFor(exec: ExecutionRow): Promise<AgentRegistry> {
    const all = await this.store.listAgents(exec.userId);
    return new AgentRegistry(all.filter((a) => a.enabled && exec.selectedAgents.includes(a.slug)));
  }

  private async plan(executionId: string): Promise<void> {
    const started = await this.store.transition(executionId, ['PENDING'], 'PLANNING');
    if (!started) return;
    await this.emit(started, 'execution.status', { status: 'PLANNING' });
    const controller = new AbortController();
    const done = (async () => {
      try {
        const task = (await this.store.getTask(started.taskId))!;
        const limits = LimitsSchema.parse(started.limits);
        const registry = await this.registryFor(started);
        const coordinator = registry.coordinator();
        if (!coordinator) throw new OrchestrationError('No enabled coordinator agent', false);
        const ctx: RunCtx = { exec: started, task, limits, registry, signal: controller.signal, allowedTools: new Set(), steps: new Map(), turns: 0, tokens: 0 };
        let feedback: string | undefined;
        let plan: Plan | undefined;
        let lastError = 'unknown';
        for (let attempt = 0; attempt <= limits.maxRetries && !plan; attempt++) {
          this.checkAbort(ctx);
          try {
            const res = await this.callProvider(ctx, 'plan', null, {
              purpose: 'plan', schema: PlanSchema,
              system: coordinator.systemPrompt, prompt: planPrompt(task, registry, limits, feedback), signal: controller.signal,
              meta: { capabilities: [...new Set(registry.routable().flatMap((a) => a.capabilities))] },
            });
            plan = validateAndResolvePlan(res.object, registry, limits);
          } catch (e) {
            if (e instanceof CancelledError || e instanceof BudgetExceededError || controller.signal.aborted) throw e;
            lastError = errMsg(e); feedback = lastError;
            await this.emit(started, 'plan.retry', { attempt: attempt + 1, error: truncate(lastError, 500) });
          }
        }
        if (!plan) throw new OrchestrationError(`Could not produce a valid plan: ${lastError}`, false);
        const t = await this.store.transition(executionId, ['PLANNING'], 'AWAITING_APPROVAL', { plan });
        if (t) {
          await this.emit(t, 'plan.ready', { steps: plan.steps.length });
          await this.emit(t, 'execution.status', { status: 'AWAITING_APPROVAL', from: 'PLANNING' });
        }
      } catch (e) {
        if (controller.signal.aborted || e instanceof CancelledError) await this.finishCancelled(executionId, ['PLANNING']);
        else await this.finishFailed(executionId, ['PLANNING'], errMsg(e));
      }
    })().finally(() => this.runs.delete(executionId));
    this.runs.set(executionId, { controller, done });
    await done;
  }

  /* ================= execution ================= */

  private async run(exec: ExecutionRow, controller: AbortController): Promise<void> {
    try {
      const task = (await this.store.getTask(exec.taskId))!;
      const limits = LimitsSchema.parse(exec.limits);
      const registry = await this.registryFor(exec);
      const plan = exec.plan as Plan;
      const disabled = new Set((await this.store.listTools()).filter((t) => !t.enabled).map((t) => t.name));
      const ctx: RunCtx = {
        exec, task, limits, registry, signal: controller.signal, steps: new Map(), turns: 0, tokens: 0,
        allowedTools: new Set(exec.selectedTools.filter((t) => this.deps.tools.has(t) && !disabled.has(t))),
      };
      for (const def of plan.steps) {
        const agent = registry.get(def.agent ?? '');
        if (!agent) throw new OrchestrationError(`Agent "${def.agent}" for step "${def.id}" is no longer available`, false);
        ctx.steps.set(def.id, { key: def.id, def, agent, status: 'PENDING', toolCalls: [], attempt: 0, revision: 0, tokensIn: 0, tokensOut: 0 });
      }
      await this.store.insertSteps(plan.steps.map((def) => ({
        executionId: exec.id, stepKey: def.id, title: def.title, agentId: ctx.steps.get(def.id)!.agent.id, agentSlug: ctx.steps.get(def.id)!.agent.slug,
        agentRole: ctx.steps.get(def.id)!.agent.role, capability: def.capability, instruction: def.instruction, dependsOn: def.dependsOn,
      })));

      await this.runSteps(ctx);
      this.checkAbort(ctx);

      const failed = [...ctx.steps.values()].filter((s) => s.status === 'FAILED');
      if (failed.length) throw new OrchestrationError(`Step(s) failed: ${failed.map((s) => s.key).join(', ')}${ctx.haltReason ? ` (${ctx.haltReason})` : ''}`, false);

      const verifying = await this.store.transition(exec.id, ['RUNNING'], 'VERIFYING');
      if (!verifying) throw new CancelledError();
      await this.emit(verifying, 'execution.status', { status: 'VERIFYING', from: 'RUNNING' });

      const verification = this.verify(ctx);
      const completedOutputs = [...ctx.steps.values()].filter((s) => s.status === 'COMPLETED').map((s) => ({ id: s.key, title: s.def.title, output: s.output }));
      const report = await this.callProvider(ctx, 'aggregate', null, {
        purpose: 'aggregate', schema: FinalReportSchema, system: ctx.registry.coordinator()?.systemPrompt ?? '',
        prompt: aggregatePrompt(task, completedOutputs, verification), signal: controller.signal,
        meta: {
          taskTitle: task.title, steps: completedOutputs.map((o) => ({ id: o.id, title: o.title, summary: String(o.output?.summary ?? '') })),
          openIssues: verification.verdicts.filter((v) => v.verdict !== 'verified').map((v) => `${v.stepId}: ${v.verdict} — ${v.reasoning}`),
        },
      });
      const finalReport = { ...report.object, verification, mock: this.deps.provider.isMock };
      await this.store.addArtifact({ executionId: exec.id, kind: 'report', title: report.object.title, content: finalReport });
      const done = await this.store.transition(exec.id, ['VERIFYING'], 'COMPLETED', { finalReport, verificationStatus: verification.status, finishedAt: new Date() });
      if (!done) throw new CancelledError();
      await this.emit(done, 'execution.status', { status: 'COMPLETED', verification: verification.status });
    } catch (e) {
      if (controller.signal.aborted || e instanceof CancelledError) await this.finishCancelled(exec.id, ['RUNNING', 'VERIFYING']);
      else await this.finishFailed(exec.id, ['RUNNING', 'VERIFYING'], errMsg(e));
    }
  }

  private async runSteps(ctx: RunCtx): Promise<void> {
    for (;;) {
      this.checkAbort(ctx);
      const pending = [...ctx.steps.values()].filter((s) => s.status === 'PENDING');
      if (!pending.length) return;
      const ready = pending.filter((s) => s.def.dependsOn.every((d) => isTerminalStep(ctx.steps.get(d)!.status)));
      if (!ready.length) throw new OrchestrationError('Scheduler deadlock: no runnable steps (invalid dependency state)', false);

      const toRun: StepState[] = [];
      for (const st of ready) {
        const skip = this.skipDecision(ctx, st);
        if (skip) await this.skipStep(ctx, st, skip.kind, skip.reason);
        else toRun.push(st);
      }
      for (let i = 0; i < toRun.length; i += this.deps.config.MAX_PARALLEL_STEPS) {
        await Promise.all(toRun.slice(i, i + this.deps.config.MAX_PARALLEL_STEPS).map((st) => this.executeStep(ctx, st)));
      }
    }
  }

  /** Conditional routing + dependency-failure propagation. */
  private skipDecision(ctx: RunCtx, st: StepState): { kind: 'condition' | 'dependency'; reason: string } | undefined {
    if (ctx.haltReason) return { kind: 'dependency', reason: `Halted: ${ctx.haltReason}` };
    for (const d of st.def.dependsOn) {
      const dep = ctx.steps.get(d)!;
      if (dep.status === 'FAILED' || dep.status === 'CANCELLED' || (dep.status === 'SKIPPED' && dep.skipKind === 'dependency')) {
        return { kind: 'dependency', reason: `Dependency "${d}" did not complete` };
      }
    }
    const c = st.def.condition;
    if (c) {
      const dep = ctx.steps.get(c.stepId)!;
      if (dep.status !== 'COMPLETED') return { kind: 'condition', reason: `Condition source "${c.stepId}" was skipped` };
      const findings = ((dep.output as { findings?: { severity: Severity }[] } | undefined)?.findings ?? []);
      const max = findings.reduce((m, f) => Math.max(m, SEVERITY_ORDER[f.severity] ?? 0), -1);
      if (max < SEVERITY_ORDER[c.minSeverity]) return { kind: 'condition', reason: `No finding of severity ≥ ${c.minSeverity} in "${c.stepId}"` };
    }
    return undefined;
  }

  private async skipStep(ctx: RunCtx, st: StepState, kind: 'condition' | 'dependency', reason: string) {
    st.status = 'SKIPPED'; st.skipKind = kind;
    await this.store.updateStep(ctx.exec.id, st.key, { status: 'SKIPPED', skipReason: reason, finishedAt: new Date() });
    await this.emit(ctx.exec, 'step.status', { stepKey: st.key, status: 'SKIPPED', reason });
  }

  private async setStep(ctx: RunCtx, st: StepState, status: StepStatus, patch: Parameters<Store['updateStep']>[2] = {}, extra: Record<string, unknown> = {}) {
    st.status = status;
    await this.store.updateStep(ctx.exec.id, st.key, { status, ...patch });
    await this.emit(ctx.exec, 'step.status', { stepKey: st.key, status, agent: st.agent.slug, ...extra });
  }

  private async executeStep(ctx: RunCtx, st: StepState): Promise<void> {
    const t0 = Date.now();
    await this.setStep(ctx, st, 'RUNNING', { startedAt: new Date() });
    try {
      const output = st.agent.role === 'reviewer' ? await this.runReviewer(ctx, st) : await this.runWithRetries(ctx, st);
      st.output = output;
      await this.setStep(ctx, st, 'COMPLETED', { output, toolCalls: st.toolCalls, durationMs: Date.now() - t0, finishedAt: new Date(), tokensIn: st.tokensIn, tokensOut: st.tokensOut }, { durationMs: Date.now() - t0 });
    } catch (e) {
      if (e instanceof CancelledError || ctx.signal.aborted) {
        await this.setStep(ctx, st, 'CANCELLED', { toolCalls: st.toolCalls, finishedAt: new Date(), durationMs: Date.now() - t0 });
        throw new CancelledError();
      }
      if (e instanceof BudgetExceededError) ctx.haltReason = e.message;
      await this.setStep(ctx, st, 'FAILED', { error: truncate(errMsg(e), 2000), toolCalls: st.toolCalls, finishedAt: new Date(), durationMs: Date.now() - t0, tokensIn: st.tokensIn, tokensOut: st.tokensOut }, { error: truncate(errMsg(e), 300) });
    }
  }

  private async runWithRetries(ctx: RunCtx, st: StepState, feedback?: string): Promise<StepOutput> {
    const maxAttempts = ctx.limits.maxRetries + 1;
    let fb = feedback;
    let last: unknown;
    for (let i = 1; i <= maxAttempts; i++) {
      this.checkAbort(ctx);
      st.attempt++;
      await this.store.updateStep(ctx.exec.id, st.key, { attempt: st.attempt });
      try {
        return await this.withTimeout(ctx, (signal, deadline) => this.runAgentLoop(ctx, st, signal, deadline, fb));
      } catch (e) {
        if (e instanceof CancelledError || ctx.signal.aborted) throw new CancelledError();
        last = e;
        if (e instanceof OrchestrationError && !e.retryable) throw e;
        fb = `Your previous attempt failed: ${truncate(errMsg(e), 400)}`;
        if (i < maxAttempts) await this.emit(ctx.exec, 'step.retry', { stepKey: st.key, attempt: st.attempt, error: truncate(errMsg(e), 300) });
      }
    }
    throw last instanceof Error ? last : new OrchestrationError(errMsg(last));
  }

  private async withTimeout<T>(ctx: RunCtx, fn: (signal: AbortSignal, deadline: Deadline) => Promise<T>): Promise<T> {
    const ctl = new AbortController();
    let timedOut = false;
    const deadline = new Deadline(ctx.limits.stepTimeoutMs, () => { timedOut = true; ctl.abort(); });
    const onParent = () => ctl.abort();
    ctx.signal.addEventListener('abort', onParent, { once: true });
    try {
      const work = fn(ctl.signal, deadline);
      work.catch(() => undefined);
      const aborted = new Promise<never>((_, reject) => {
        ctl.signal.addEventListener('abort', () => reject(timedOut ? new StepTimeoutError(ctx.limits.stepTimeoutMs) : new CancelledError()), { once: true });
      });
      return await Promise.race([work, aborted]);
    } finally {
      deadline.clear();
      ctx.signal.removeEventListener('abort', onParent);
    }
  }

  /** The per-agent loop: model chooses a tool or a final answer; the platform validates and enforces everything. */
  private async runAgentLoop(ctx: RunCtx, st: StepState, signal: AbortSignal, deadline: Deadline, feedback?: string): Promise<StepOutput> {
    const agent = st.agent;
    const toolNames = agent.allowedTools.filter((t) => ctx.allowedTools.has(t));
    const toolDescs = this.deps.tools.describe(toolNames);
    const upstream: Record<string, unknown> = {};
    for (const d of st.def.dependsOn) { const o = ctx.steps.get(d)?.output; if (o) upstream[d] = o; }
    const transcript: string[] = [];
    const toolResults: { tool: string; result: unknown }[] = [];
    let toolCalls = 0; let denied = 0;

    for (let turn = 0; turn < ctx.limits.maxToolCallsPerStep + 3; turn++) {
      const mustFinish = toolCalls >= ctx.limits.maxToolCallsPerStep;
      const res = await this.callProvider(ctx, 'agent', st.key, {
        purpose: 'agent', schema: AgentTurnSchema, system: agent.systemPrompt, signal,
        prompt: agentPrompt({ task: ctx.task, instruction: st.def.instruction, tools: toolDescs, upstream, transcript, feedback, mustFinish, role: agent.role }),
        meta: { role: agent.role, availableTools: toolNames, toolResults, upstream, instruction: st.def.instruction },
      }, st);
      const t = res.object;
      if (t.action === 'final') return this.parseFinal(agent, t.outputJson);
      if (mustFinish) { transcript.push('SYSTEM: tool budget exhausted — return action="final" now.'); continue; }

      toolCalls++;
      const started = Date.now();
      const record = (status: ToolCallRecord['status'], summary: string, extra: Partial<ToolCallRecord> = {}) => {
        const r: ToolCallRecord = { tool: t.tool ?? '(none)', args: t.argsJson, status, resultSummary: truncate(summary, 400), durationMs: Date.now() - started, at: new Date().toISOString(), ...extra };
        st.toolCalls.push(r);
        void this.emit(ctx.exec, 'tool.call', { stepKey: st.key, tool: r.tool, status, durationMs: r.durationMs });
        return r;
      };

      // 1. permission check (server-side; the model cannot grant itself tools)
      const def = t.tool ? this.deps.tools.get(t.tool) : undefined;
      if (!def || !t.tool || !toolNames.includes(t.tool)) {
        record('denied', `Tool "${t.tool}" is not permitted for agent ${agent.slug}`);
        transcript.push(`TOOL_ERROR: "${t.tool}" is not permitted. Available tools: ${toolNames.join(', ') || '(none)'}`);
        if (++denied >= 2) throw new OrchestrationError(`Agent ${agent.slug} repeatedly requested a tool it may not use ("${t.tool}")`, false);
        continue;
      }
      // 2. argument validation
      let rawArgs: unknown;
      try { rawArgs = JSON.parse(t.argsJson ?? '{}'); } catch { rawArgs = undefined; }
      const parsed = def.argsSchema.safeParse(rawArgs);
      if (!parsed.success) {
        record('invalid', z.prettifyError(parsed.error));
        transcript.push(`TOOL_ERROR: invalid arguments for ${def.name}: ${truncate(z.prettifyError(parsed.error), 300)}`);
        continue;
      }
      // 3. human approval for sensitive / external tools
      let approvalId: string | undefined;
      if (def.sensitive || def.external) {
        const approval = await this.store.createApproval({
          executionId: ctx.exec.id, stepKey: st.key, userId: ctx.exec.userId, toolName: def.name, arguments: parsed.data,
          reason: t.rationale ?? `Agent ${agent.name} wants to call ${def.name}`,
        });
        approvalId = approval.id;
        await this.setStep(ctx, st, 'AWAITING_APPROVAL', {}, { approvalId });
        await this.emit(ctx.exec, 'approval.requested', { approvalId, stepKey: st.key, tool: def.name, args: parsed.data });
        deadline.pause();
        const decision = await this.awaitApproval(ctx, approval.id, signal);
        deadline.resume();
        await this.setStep(ctx, st, 'RUNNING', {}, { approvalId });
        await this.emit(ctx.exec, 'approval.decided', { approvalId, decision });
        if (decision !== 'approved') {
          record('rejected', `Human ${decision} the call`, { approvalId });
          transcript.push(`TOOL_ERROR: the human operator ${decision} your call to ${def.name}. Proceed without it and state this limitation.`);
          continue;
        }
      }
      // 4. execute (bounded) and treat result as untrusted
      try {
        const result = await def.execute(parsed.data, {
          userId: ctx.exec.userId, executionId: ctx.exec.id, stepKey: st.key, signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
          task: { title: ctx.task.title, description: ctx.task.description, context: ctx.task.context }, fetchAllowedHosts: this.deps.config.fetchAllowedHosts,
          addArtifact: async (a) => (await this.store.addArtifact({ executionId: ctx.exec.id, stepKey: st.key, ...a })).id,
        });
        const json = JSON.stringify(result) ?? 'null';
        record('ok', json, { approvalId });
        toolResults.push({ tool: def.name, result: { untrusted: true, data: result } });
        transcript.push(`TOOL_RESULT ${def.name}:\n${untrusted(`tool:${def.name}`, json)}`);
      } catch (e) {
        if (signal.aborted) throw e;
        record('error', errMsg(e), { approvalId });
        transcript.push(`TOOL_ERROR: ${def.name} failed: ${truncate(errMsg(e), 300)}`);
      }
    }
    throw new InvalidOutputError('Agent did not produce a final output within the turn limit');
  }

  private parseFinal(agent: AgentDef, outputJson: string | null): StepOutput {
    if (!outputJson) throw new InvalidOutputError('Final action had no outputJson');
    let raw: unknown;
    try { raw = JSON.parse(outputJson); } catch { throw new InvalidOutputError('outputJson is not valid JSON'); }
    const schema = OUTPUT_SCHEMAS[agent.role as keyof typeof OUTPUT_SCHEMAS] ?? OUTPUT_SCHEMAS.custom;
    const r = schema.safeParse(raw);
    if (!r.success) throw new InvalidOutputError(`Output failed schema validation: ${truncate(z.prettifyError(r.error), 400)}`);
    return r.data as StepOutput;
  }

  private awaitApproval(ctx: RunCtx, approvalId: string, signal: AbortSignal): Promise<'approved' | 'rejected' | 'expired'> {
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.approvalWaiters.delete(approvalId); signal.removeEventListener('abort', onAbort); };
      const onAbort = () => { cleanup(); reject(new CancelledError()); };
      const timer = setTimeout(async () => {
        cleanup();
        await this.store.decideApproval(approvalId, ctx.exec.userId, 'expired').catch(() => undefined);
        resolve('expired');
      }, this.deps.config.APPROVAL_TIMEOUT_MS);
      this.approvalWaiters.set(approvalId, (s) => { cleanup(); resolve(s); });
      if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** Reviewer with bounded revision rounds: rejected steps with a revisionRequest are re-run (≤ maxRevisions each), then re-reviewed. */
  private async runReviewer(ctx: RunCtx, st: StepState): Promise<StepOutput> {
    let round = 0;
    let feedback: string | undefined;
    for (;;) {
      const out = await this.runWithRetries(ctx, st, feedback);
      const upstreamIds = new Set(st.def.dependsOn.filter((d) => ctx.steps.get(d)?.status === 'COMPLETED'));
      const verdicts = ((out as { verdicts?: { stepId: string; verdict: string; revisionRequest?: string }[] }).verdicts ?? []).filter((v) => upstreamIds.has(v.stepId));
      (out as Record<string, unknown>).verdicts = verdicts;
      const revisable = verdicts.filter((v) => {
        const t = ctx.steps.get(v.stepId)!;
        return v.verdict === 'rejected' && v.revisionRequest && t.agent.role !== 'reviewer' && t.revision < ctx.limits.maxRevisions;
      });
      if (!revisable.length || round >= ctx.limits.maxRevisions) return out;
      round++;
      for (const v of revisable) {
        const target = ctx.steps.get(v.stepId)!;
        target.revision++;
        await this.emit(ctx.exec, 'step.revision', { stepKey: target.key, revision: target.revision, request: truncate(v.revisionRequest ?? '', 300) });
        await this.setStep(ctx, target, 'RUNNING', { revision: target.revision });
        try {
          target.output = await this.runWithRetries(ctx, target, `Reviewer requested a revision: ${v.revisionRequest}`);
          await this.setStep(ctx, target, 'COMPLETED', { output: target.output, toolCalls: target.toolCalls, finishedAt: new Date() });
        } catch (e) {
          if (e instanceof CancelledError) throw e;
          await this.setStep(ctx, target, 'FAILED', { error: truncate(errMsg(e), 2000), finishedAt: new Date() });
          throw new OrchestrationError(`Revision of "${target.key}" failed: ${errMsg(e)}`, false);
        }
      }
      feedback = 'Steps were revised after your feedback; re-review them and issue updated verdicts for every step.';
    }
  }

  /** Verification status is computed by the platform from reviewer verdicts — never taken from model prose. */
  private verify(ctx: RunCtx) {
    const verdicts = new Map<string, { stepId: string; verdict: 'verified' | 'rejected' | 'needs_human_review'; reasoning: string }>();
    const reviewers = [...ctx.steps.values()].filter((s) => s.agent.role === 'reviewer' && s.status === 'COMPLETED');
    for (const r of reviewers) for (const v of ((r.output as { verdicts?: { stepId: string; verdict: 'verified' | 'rejected' | 'needs_human_review'; reasoning: string }[] })?.verdicts ?? [])) verdicts.set(v.stepId, v);
    const reviewable = [...ctx.steps.values()].filter((s) => s.agent.role !== 'reviewer' && s.status === 'COMPLETED');
    const result = reviewable.map((s) => verdicts.get(s.key) ?? { stepId: s.key, verdict: 'needs_human_review' as const, reasoning: 'Not covered by any reviewer verdict' });
    let status: VerificationStatus;
    if (!reviewers.length || !reviewable.length) status = 'UNVERIFIED';
    else if (result.some((v) => v.verdict === 'rejected')) status = 'REJECTED';
    else if (result.some((v) => v.verdict === 'needs_human_review')) status = 'NEEDS_HUMAN_REVIEW';
    else status = 'VERIFIED';
    return { status, verdicts: result };
  }

  /* ================= helpers ================= */

  private checkAbort(ctx: RunCtx) { if (ctx.signal.aborted) throw new CancelledError(); }

  private async callProvider<T>(ctx: RunCtx, purpose: GenerateRequest<T>['purpose'], stepKey: string | null, req: GenerateRequest<T>, st?: StepState) {
    this.checkAbort(ctx);
    if (ctx.turns >= ctx.limits.maxTurns) throw new BudgetExceededError(`Turn budget exhausted (${ctx.limits.maxTurns})`);
    if (ctx.tokens >= ctx.limits.maxTokens) throw new BudgetExceededError(`Token budget exhausted (${ctx.limits.maxTokens})`);
    ctx.turns++;
    const res = await this.deps.provider.generateObject(req);
    const { inputTokens, outputTokens } = res.usage;
    const cost = (inputTokens / 1000) * this.deps.config.COST_PER_1K_INPUT_USD + (outputTokens / 1000) * this.deps.config.COST_PER_1K_OUTPUT_USD;
    ctx.tokens += inputTokens + outputTokens;
    if (st) { st.tokensIn += inputTokens; st.tokensOut += outputTokens; }
    await this.store.recordUsage({ executionId: ctx.exec.id, stepKey, provider: this.deps.provider.name, model: this.deps.provider.model, purpose, inputTokens, outputTokens, costUsd: cost, latencyMs: res.latencyMs });
    await this.store.addExecutionUsage(ctx.exec.id, { tokensIn: inputTokens, tokensOut: outputTokens, costUsd: cost });
    return res;
  }

  private async finishCancelled(executionId: string, from: ExecutionStatus[]) {
    const t = await this.store.transition(executionId, from, 'CANCELLED', { finishedAt: new Date() });
    await this.store.expirePendingApprovals(executionId);
    await closeOpenSteps(this.store, executionId, 'CANCELLED');
    if (t) await this.emit(t, 'execution.status', { status: 'CANCELLED' });
  }

  private async finishFailed(executionId: string, from: ExecutionStatus[], message: string) {
    const t = await this.store.transition(executionId, from, 'FAILED', { error: truncate(message, 2000), finishedAt: new Date() });
    await this.store.expirePendingApprovals(executionId);
    await closeOpenSteps(this.store, executionId, 'FAILED', 'Execution failed');
    if (t) await this.emit(t, 'execution.status', { status: 'FAILED', error: truncate(message, 500) });
  }

  private async emit(exec: Pick<ExecutionRow, 'id' | 'userId'>, type: string, payload: Record<string, unknown>) {
    try {
      this.deps.bus.publish(await this.store.appendEvent(exec.id, exec.userId, type, payload));
    } catch (e) {
      console.error('[nexus] failed to persist event', type, errMsg(e));
    }
  }
}
