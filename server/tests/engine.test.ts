import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineTool, createDefaultToolRegistry } from '../src/orchestration/tools.js';
import { z } from 'zod';
import { makeEnv, ScriptedProvider, sleep, statusOf, turn, waitFor } from './helpers.js';

const CLEAN = 'function add(a, b) { return a + b; }';
const RISKY = "const password = 'hunter2hunter2'\n// TODO remove\nconsole.log(password)";
const base = { title: 'Audit snippet', description: 'Review this snippet for problems please' };

describe('orchestration engine (PGlite + scripted provider)', () => {
  const provider = new ScriptedProvider();
  let env: Awaited<ReturnType<typeof makeEnv>>;
  let user: Awaited<ReturnType<typeof env.makeUser>>;
  const fireTool = defineTool({ name: 'send_report', description: 'external side effect', argsSchema: z.object({ to: z.string() }), sensitive: true, external: true, execute: async ({ to }) => { sent.push(to); return { sent: true }; } });
  const sent: string[] = [];

  beforeAll(async () => {
    env = await makeEnv({ provider, tools: createDefaultToolRegistry().register(fireTool) });
    user = await env.makeUser();
  });
  afterAll(async () => env.close());
  const run = async (input: Parameters<typeof env.orchestrator.submitTask>[1]) => {
    const exec = await env.orchestrator.submitTask(user.id, input);
    return exec;
  };
  const runToEnd = async (input: Parameters<typeof env.orchestrator.submitTask>[1]) => {
    const exec = await run(input);
    expect(exec.status).toBe('AWAITING_APPROVAL');
    await env.orchestrator.approve(exec.id, user.id);
    await env.orchestrator.waitFor(exec.id);
    return (await env.store.getExecution(exec.id))!;
  };

  it('PENDING → PLANNING → AWAITING_APPROVAL → RUNNING → VERIFYING → COMPLETED with persisted state', async () => {
    provider.override = undefined;
    const done = await runToEnd({ ...base, context: CLEAN });
    expect(done.status).toBe('COMPLETED');
    expect(done.verificationStatus).toBe('VERIFIED');
    expect(done.mock).toBe(true);
    const steps = await env.store.listSteps(done.id);
    expect(steps.find((s) => s.stepKey === 'research')?.status).toBe('COMPLETED');
    expect(steps.find((s) => s.stepKey === 'deep-dive')?.status).toBe('SKIPPED');           // conditional routing: nothing ≥ high
    expect(steps.find((s) => s.stepKey === 'final-review')?.status).toBe('COMPLETED');      // reviewer auto-appended
    const events = await env.store.listEvents(done.id);
    const statuses = events.filter((e) => e.type === 'execution.status').map((e) => e.payload.status);
    expect(statuses).toEqual(['PLANNING', 'AWAITING_APPROVAL', 'RUNNING', 'VERIFYING', 'COMPLETED']);
    expect(events.map((e) => e.seq)).toEqual([...events.map((e) => e.seq)].sort((a, b) => a - b));
    expect((done.finalReport as { mock: boolean }).mock).toBe(true);
    expect(done.tokensIn).toBeGreaterThan(0);
    expect((await env.store.listArtifacts(done.id)).some((a) => a.kind === 'report')).toBe(true);
  });

  it('routes conditionally: high-severity finding triggers the deep-dive step', async () => {
    const done = await runToEnd({ ...base, context: RISKY });
    const steps = await env.store.listSteps(done.id);
    expect(steps.find((s) => s.stepKey === 'deep-dive')?.status).toBe('COMPLETED');
    const analyze = steps.find((s) => s.stepKey === 'analyze')!;
    expect((analyze.output as { findings: { severity: string }[] }).findings.some((f) => f.severity === 'high')).toBe(true);
    expect((analyze.toolCalls as { tool: string }[]).some((c) => c.tool === 'pattern_scan')).toBe(true);
  });

  it('retries invalid LLM output up to the limit then FAILS with a persisted error', async () => {
    provider.override = (req) => (req.meta as { role?: string })?.role === 'researcher' ? turn.final('this is not json') : undefined;
    const done = await runToEnd({ ...base, context: CLEAN, limits: { maxRetries: 2 } });
    expect(done.status).toBe('FAILED');
    const research = (await env.store.listSteps(done.id)).find((s) => s.stepKey === 'research')!;
    expect(research.status).toBe('FAILED');
    expect(research.attempt).toBe(3);               // 1 + maxRetries
    expect(research.error).toMatch(/valid JSON/);
    const analyze = (await env.store.listSteps(done.id)).find((s) => s.stepKey === 'analyze')!;
    expect(analyze.status).toBe('SKIPPED');         // dependency failure propagates
    expect(done.error).toMatch(/research/);
  });

  it('recovers when a later attempt produces valid output', async () => {
    let n = 0;
    provider.override = (req) => {
      if ((req.meta as { role?: string })?.role !== 'researcher') return undefined;
      return ++n === 1 ? turn.final(JSON.stringify({ wrong: 'shape' })) : undefined;
    };
    const done = await runToEnd({ ...base, context: CLEAN, limits: { maxRetries: 2 } });
    expect(done.status).toBe('COMPLETED');
    expect((await env.store.listSteps(done.id)).find((s) => s.stepKey === 'research')!.attempt).toBe(2);
  });

  it('rejects an invalid plan from the model and retries planning within limits', async () => {
    let n = 0;
    provider.override = (req) => req.purpose === 'plan' && ++n === 1
      ? { summary: 'bad', steps: [{ id: 'a', title: 'a', capability: 'research', agent: null, instruction: 'x', dependsOn: ['ghost'], condition: null }] } : undefined;
    const exec = await run({ ...base, context: CLEAN });
    expect(exec.status).toBe('AWAITING_APPROVAL');
    expect(n).toBeGreaterThanOrEqual(2);
    provider.override = undefined;
  });

  it('fails planning cleanly when the model never returns a valid plan', async () => {
    provider.override = (req) => req.purpose === 'plan' ? { summary: 'x', steps: [] } : undefined;
    const exec = await run({ ...base, context: CLEAN, limits: { maxRetries: 1 } });
    expect(exec.status).toBe('FAILED');
    expect(exec.error).toMatch(/valid plan/);
    provider.override = undefined;
  });

  it('enforces per-step timeouts even if the provider ignores the abort signal', async () => {
    provider.override = (req) => (req.meta as { role?: string })?.role === 'researcher' ? new Promise(() => undefined) : undefined;
    const t0 = Date.now();
    const done = await runToEnd({ ...base, context: CLEAN, limits: { maxRetries: 0, stepTimeoutMs: 500 } });
    expect(done.status).toBe('FAILED');
    expect(Date.now() - t0).toBeLessThan(5000);
    expect((await env.store.listSteps(done.id)).find((s) => s.stepKey === 'research')!.error).toMatch(/timed out/);
    provider.override = undefined;
  });

  it('cancels a running execution and closes open steps', async () => {
    provider.override = (req) => (req.meta as { role?: string })?.role === 'researcher' ? new Promise(() => undefined) : undefined;
    const exec = await run({ ...base, context: CLEAN, limits: { stepTimeoutMs: 60_000 } });
    await env.orchestrator.approve(exec.id, user.id);
    await waitFor(async () => (await env.store.listSteps(exec.id)).some((s) => s.status === 'RUNNING'), 5000, 'step running');
    const t0 = Date.now();
    const cancelled = await env.orchestrator.cancel(exec.id, user.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(Date.now() - t0).toBeLessThan(3000);
    const steps = await env.store.listSteps(exec.id);
    expect(steps.every((s) => ['CANCELLED', 'COMPLETED', 'SKIPPED'].includes(s.status))).toBe(true);
    await expect(env.orchestrator.cancel(exec.id, user.id)).rejects.toThrow(/already/);
    provider.override = undefined;
  });

  it('cancels an execution that is awaiting plan approval, and refuses to approve it afterwards', async () => {
    const exec = await run({ ...base, context: CLEAN });
    const c = await env.orchestrator.cancel(exec.id, user.id);
    expect(c.status).toBe('CANCELLED');
    await expect(env.orchestrator.approve(exec.id, user.id)).rejects.toThrow(/AWAITING_APPROVAL/);
  });

  it('stops when the turn budget is exhausted', async () => {
    const done = await runToEnd({ ...base, context: CLEAN, limits: { maxTurns: 2, maxRetries: 0 } });
    expect(done.status).toBe('FAILED');
    expect(done.error).toMatch(/Step\(s\) failed/);
    const errs = (await env.store.listSteps(done.id)).map((s) => s.error).filter(Boolean).join(' ');
    expect(errs).toMatch(/budget/i);
  });

  it('denies tools the agent is not permitted to use (server-side) and aborts repeat offenders', async () => {
    provider.override = (req) => (req.meta as { role?: string })?.role === 'analyst' ? turn.tool('http_fetch', { url: 'https://example.com' }) : undefined;
    const done = await runToEnd({ ...base, context: CLEAN, limits: { maxRetries: 0 } });
    expect(done.status).toBe('FAILED');
    const analyze = (await env.store.listSteps(done.id)).find((s) => s.stepKey === 'analyze')!;
    expect((analyze.toolCalls as { status: string }[]).filter((c) => c.status === 'denied').length).toBe(2);
    expect(analyze.error).toMatch(/may not use/);
    provider.override = undefined;
  });

  it('feeds back invalid tool arguments instead of executing', async () => {
    let n = 0;
    provider.override = (req) => {
      if ((req.meta as { role?: string })?.role !== 'researcher') return undefined;
      return ++n === 1 ? turn.tool('record_evidence', { claim: 'only a claim' }) : undefined;
    };
    const done = await runToEnd({ ...base, context: CLEAN });
    const research = (await env.store.listSteps(done.id)).find((s) => s.stepKey === 'research')!;
    expect((research.toolCalls as { status: string }[])[0]!.status).toBe('invalid');
    expect(done.status).toBe('COMPLETED');
    provider.override = undefined;
  });

  describe('human approval for sensitive tools', () => {
    const makeAgent = async () => {
      const r = await env.app.inject({ method: 'POST', url: '/api/agents', headers: user.auth, payload: { name: 'Notifier', description: 'Sends reports', capabilities: ['notify'], allowedTools: ['send_report'] } });
      expect(r.statusCode).toBe(201);
      return (r.json() as { agent: { slug: string } }).agent.slug;
    };
    const setup = async (slug: string) => {
      provider.calls.length = 0; // per-role call counters are derived from this
      provider.override = (req, n) => {
        const role = (req.meta as { role?: string })?.role;
        if (req.purpose === 'plan') return { summary: 'p', steps: [{ id: 'notify', title: 'Notify', capability: 'notify', agent: slug, instruction: 'send', dependsOn: [], condition: null }] };
        if (role === 'custom') return n === 1 ? turn.tool('send_report', { to: 'boss@example.com' }) : turn.final({ summary: 'done notifying' });
        return undefined;
      };
      const exec = await run({ ...base, context: CLEAN, agentSlugs: [slug, 'reviewer'], toolNames: ['send_report', 'task_context'], limits: { stepTimeoutMs: 1000 } });
      await env.orchestrator.approve(exec.id, user.id);
      const approval = await waitFor(async () => (await env.store.listApprovals(user.id, 'pending')).find((a) => a.executionId === exec.id), 5000, 'approval request');
      return { exec, approval };
    };

    it('blocks the sensitive call until approved — and the approval wait does not count toward the step timeout', async () => {
      sent.length = 0;
      const { exec, approval } = await setup(await makeAgent());
      await sleep(1300);                             // longer than stepTimeoutMs
      expect(sent).toHaveLength(0);
      expect(await statusOf(env.store, exec.id)).toBe('RUNNING');
      expect((await env.store.listSteps(exec.id)).find((s) => s.stepKey === 'notify')!.status).toBe('AWAITING_APPROVAL');
      const r = await env.app.inject({ method: 'POST', url: `/api/approvals/${approval.id}/decision`, headers: user.auth, payload: { decision: 'approved' } });
      expect(r.statusCode).toBe(200);
      await env.orchestrator.waitFor(exec.id);
      expect(sent).toEqual(['boss@example.com']);
      expect(await statusOf(env.store, exec.id)).toBe('COMPLETED');
    });

    it('does not execute the tool when rejected', async () => {
      sent.length = 0;
      const { exec, approval } = await setup(await makeAgent());
      await env.app.inject({ method: 'POST', url: `/api/approvals/${approval.id}/decision`, headers: user.auth, payload: { decision: 'rejected' } });
      await env.orchestrator.waitFor(exec.id);
      expect(sent).toHaveLength(0);
      const step = (await env.store.listSteps(exec.id)).find((s) => s.stepKey === 'notify')!;
      expect((step.toolCalls as { status: string }[])[0]!.status).toBe('rejected');
    });

    it('cannot decide an approval twice, and cancellation expires pending approvals', async () => {
      const { exec, approval } = await setup(await makeAgent());
      await env.orchestrator.cancel(exec.id, user.id);
      expect((await env.store.getApprovalForUser(approval.id, user.id))!.status).toBe('expired');
      const r = await env.app.inject({ method: 'POST', url: `/api/approvals/${approval.id}/decision`, headers: user.auth, payload: { decision: 'approved' } });
      expect(r.statusCode).toBe(409);
      expect(sent).toHaveLength(0);
    });
  });

  it('reviewer rejection triggers a bounded revision, then re-review', async () => {
    let reviews = 0;
    provider.override = (req) => {
      if ((req.meta as { role?: string })?.role !== 'reviewer') return undefined;
      reviews++;
      const ids = Object.keys((req.meta as { upstream: Record<string, unknown> }).upstream);
      return turn.final({ summary: 'review', verdicts: ids.map((stepId) => reviews === 1 && stepId === 'research'
        ? { stepId, verdict: 'rejected', reasoning: 'thin', revisionRequest: 'add more facts' } : { stepId, verdict: 'verified', reasoning: 'ok' }) });
    };
    const done = await runToEnd({ ...base, context: CLEAN });
    const steps = await env.store.listSteps(done.id);
    expect(steps.find((s) => s.stepKey === 'research')!.revision).toBe(1);
    expect(reviews).toBe(2);
    expect(done.verificationStatus).toBe('VERIFIED');
    provider.override = undefined;
  });

  it('never loops: revisions are capped and a still-rejected result is flagged REJECTED', async () => {
    let reviews = 0;
    provider.override = (req) => {
      if ((req.meta as { role?: string })?.role !== 'reviewer') return undefined;
      reviews++;
      const ids = Object.keys((req.meta as { upstream: Record<string, unknown> }).upstream);
      return turn.final({ summary: 'no', verdicts: ids.map((stepId) => ({ stepId, verdict: 'rejected', reasoning: 'bad', revisionRequest: 'fix' })) });
    };
    const done = await runToEnd({ ...base, context: CLEAN, limits: { maxRevisions: 1 } });
    expect(done.status).toBe('COMPLETED');
    expect(done.verificationStatus).toBe('REJECTED');
    expect(reviews).toBe(2);   // initial + one re-review, never more
    provider.override = undefined;
  });

  it('flags NEEDS_HUMAN_REVIEW when the reviewer does not cover every step', async () => {
    provider.override = (req) => (req.meta as { role?: string })?.role === 'reviewer'
      ? turn.final({ summary: 'partial', verdicts: [{ stepId: 'research', verdict: 'verified', reasoning: 'ok' }] }) : undefined;
    const done = await runToEnd({ ...base, context: CLEAN });
    expect(done.verificationStatus).toBe('NEEDS_HUMAN_REVIEW');
    provider.override = undefined;
  });

  it('recovers from a crash: interrupted executions become FAILED, retryable, with approvals expired', async () => {
    const exec = await run({ ...base, context: CLEAN });
    await env.orchestrator.approve(exec.id, user.id);
    await env.orchestrator.waitFor(exec.id);
    // simulate a process that died mid-run
    const stuck = await run({ ...base, context: CLEAN });
    await env.store.transition(stuck.id, ['AWAITING_APPROVAL'], 'RUNNING');
    expect(await env.orchestrator.recover()).toBe(1);
    const after = (await env.store.getExecution(stuck.id))!;
    expect(after.status).toBe('FAILED');
    expect(after.error).toMatch(/restart/);
    const retried = await env.orchestrator.retry(stuck.id, user.id);
    expect(retried.status).toBe('AWAITING_APPROVAL');
    expect(retried.retryOf).toBe(stuck.id);
    await env.orchestrator.cancel(retried.id, user.id);
    await expect(env.orchestrator.retry(exec.id, user.id)).rejects.toThrow(/Only FAILED/);
  });

  it('limits retry chains', async () => {
    let cur = await run({ ...base, context: CLEAN });
    for (let i = 0; i < 3; i++) {
      await env.store.transition(cur.id, ['AWAITING_APPROVAL'], 'FAILED');
      cur = await env.orchestrator.retry(cur.id, user.id);
    }
    await env.store.transition(cur.id, ['AWAITING_APPROVAL'], 'FAILED');
    await expect(env.orchestrator.retry(cur.id, user.id)).rejects.toThrow(/chain/);
  });
});
