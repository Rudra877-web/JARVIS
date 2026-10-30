import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { makeEnv, waitFor } from './helpers.js';

const task = { title: 'Audit snippet', description: 'Review this snippet for problems', context: "token = 'abcdef123456789'" };

describe('REST API: authentication, authorization, validation', () => {
  let env: Awaited<ReturnType<typeof makeEnv>>;
  let alice: Awaited<ReturnType<typeof env.makeUser>>;
  let bob: Awaited<ReturnType<typeof env.makeUser>>;
  let execId: string;

  beforeAll(async () => {
    env = await makeEnv();
    alice = await env.makeUser(); bob = await env.makeUser();
    const r = await env.app.inject({ method: 'POST', url: '/api/tasks', headers: alice.auth, payload: task });
    expect(r.statusCode).toBe(201);
    execId = (r.json() as { execution: { id: string } }).execution.id;
  });
  afterAll(async () => env.close());
  const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, who?: { auth: Record<string, string> }, payload?: unknown) =>
    env.app.inject({ method, url, headers: who?.auth, payload: payload as never });

  it('health is public; everything else requires a valid token', async () => {
    expect((await call('GET', '/api/health')).statusCode).toBe(200);
    expect((await call('GET', '/api/health/ready')).json()).toMatchObject({ database: 'ok', provider: { mock: true } });
    for (const [m, u] of [['GET', '/api/agents'], ['GET', '/api/executions'], ['GET', `/api/executions/${execId}`], ['POST', '/api/tasks'], ['GET', '/api/settings'], ['GET', '/api/tools'], ['GET', '/api/approvals']] as const) {
      expect((await call(m, u)).statusCode, `${m} ${u}`).toBe(401);
    }
    expect((await env.app.inject({ method: 'GET', url: '/api/agents', headers: { authorization: 'Bearer garbage' } })).statusCode).toBe(401);
  });

  it('users cannot read, approve, cancel, retry or list another user’s executions (404, not 403)', async () => {
    expect((await call('GET', `/api/executions/${execId}`, alice)).statusCode).toBe(200);
    for (const [m, u] of [['GET', `/api/executions/${execId}`], ['GET', `/api/executions/${execId}/events`], ['POST', `/api/executions/${execId}/approve`], ['POST', `/api/executions/${execId}/cancel`], ['POST', `/api/executions/${execId}/retry`]] as const) {
      expect((await call(m, u, bob)).statusCode, `${m} ${u}`).toBe(404);
    }
    expect(((await call('GET', '/api/executions', bob)).json() as { total: number }).total).toBe(0);
    expect(((await call('GET', '/api/executions', alice)).json() as { total: number }).total).toBe(1);
    expect((await call('GET', '/api/dashboard', bob)).json()).toMatchObject({ byStatus: {} });
  });

  it('users cannot decide another user’s approval requests', async () => {
    const a = await env.store.createApproval({ executionId: execId, stepKey: 'x', userId: alice.id, toolName: 'http_fetch', arguments: {}, reason: '' });
    expect((await call('POST', `/api/approvals/${a.id}/decision`, bob, { decision: 'approved' })).statusCode).toBe(404);
    expect((await call('GET', '/api/approvals', bob)).json()).toEqual({ approvals: [] });
    expect((await env.store.getApprovalForUser(a.id, alice.id))!.status).toBe('pending');
  });

  it('validates input with clear 400s', async () => {
    expect((await call('POST', '/api/tasks', alice, { title: 'x' })).statusCode).toBe(400);
    expect((await call('POST', '/api/tasks', alice, { ...task, limits: { maxRetries: 99 } })).statusCode).toBe(400);
    expect((await call('POST', '/api/tasks', alice, { ...task, agentSlugs: ['nope'] })).statusCode).toBe(400);
    expect((await call('POST', '/api/tasks', alice, { ...task, toolNames: ['rm_rf'] })).statusCode).toBe(400);
    expect((await call('GET', '/api/executions/not-a-uuid', alice)).statusCode).toBe(400);
    expect((await call('GET', '/api/executions?status=BOGUS', alice)).statusCode).toBe(400);
    expect((await call('POST', '/api/auth/register', undefined, { email: 'bad', name: 'x', password: 'short' })).statusCode).toBe(400);
  });

  it('custom agents: server-side validation and ownership', async () => {
    const ok = await call('POST', '/api/agents', alice, { name: 'Summariser', description: 'Summarises', capabilities: ['summarise'], allowedTools: ['task_context'] });
    expect(ok.statusCode).toBe(201);
    const agent = (ok.json() as { agent: { id: string; slug: string; role: string; isBuiltin: boolean } }).agent;
    expect(agent.role).toBe('custom'); expect(agent.isBuiltin).toBe(false);
    expect((await call('POST', '/api/agents', alice, { name: 'Evil', capabilities: ['review'], allowedTools: [] })).statusCode).toBe(400);          // reserved capability
    expect((await call('POST', '/api/agents', alice, { name: 'Evil', capabilities: ['x'], allowedTools: ['bash'] })).statusCode).toBe(400);          // unknown tool
    expect((await call('POST', '/api/agents', alice, { name: 'Evil', capabilities: ['x'], allowedTools: [], role: 'coordinator' })).json()).toMatchObject({ agent: { role: 'custom' } }); // role is not client-controlled
    // Bob can neither see, edit nor delete Alice's agent
    expect(((await call('GET', '/api/agents', bob)).json() as { agents: { id: string }[] }).agents.some((a) => a.id === agent.id)).toBe(false);
    expect((await call('PATCH', `/api/agents/${agent.id}`, bob, { enabled: false })).statusCode).toBe(404);
    expect((await call('DELETE', `/api/agents/${agent.id}`, bob)).statusCode).toBe(404);
    expect((await call('PATCH', `/api/agents/${agent.id}`, alice, { enabled: false })).json()).toMatchObject({ agent: { enabled: false } });
    // built-ins are immutable
    const builtin = ((await call('GET', '/api/agents', alice)).json() as { agents: { id: string; isBuiltin: boolean }[] }).agents.find((a) => a.isBuiltin)!;
    expect((await call('PATCH', `/api/agents/${builtin.id}`, alice, { enabled: false })).statusCode).toBe(403);
    expect((await call('DELETE', `/api/agents/${builtin.id}`, alice)).statusCode).toBe(403);
    // a disabled agent cannot be selected for a task
    expect((await call('POST', '/api/tasks', alice, { ...task, agentSlugs: [agent.slug] })).statusCode).toBe(400);
  });

  it('filters and paginates execution history', async () => {
    for (let i = 0; i < 2; i++) await call('POST', '/api/tasks', alice, { ...task, title: `Second batch ${i}` });
    const page = (await call('GET', '/api/executions?pageSize=2&page=1', alice)).json() as { items: unknown[]; total: number };
    expect(page.items).toHaveLength(2); expect(page.total).toBeGreaterThanOrEqual(3);
    const q = (await call('GET', '/api/executions?q=second%20batch', alice)).json() as { total: number };
    expect(q.total).toBe(2);
    expect(((await call('GET', '/api/executions?status=COMPLETED', alice)).json() as { total: number }).total).toBe(0);
    expect(((await call('GET', '/api/executions?status=AWAITING_APPROVAL&agent=researcher', alice)).json() as { total: number }).total).toBe(0); // steps are created on approval
    expect(((await call('GET', '/api/executions?q=%25', alice)).json() as { total: number }).total).toBe(0);                                         // LIKE wildcards are escaped
  });

  it('login does not reveal whether an email exists', async () => {
    const a = await call('POST', '/api/auth/login', undefined, { email: 'ghost@test.dev', password: 'whatever-whatever' });
    const b = await call('POST', '/api/auth/login', undefined, { email: alice.id ? (await env.store.getUserById(alice.id))!.email : '', password: 'wrong-password-123' });
    expect(a.statusCode).toBe(401); expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });

  it('never leaks secrets via settings', async () => {
    const s = JSON.stringify((await call('GET', '/api/settings', alice)).json());
    expect(s).not.toMatch(/JWT_SECRET|API_KEY|password/i);
  });
});

describe('rate limiting', () => {
  it('throttles auth endpoints', async () => {
    const env = await makeEnv({ config: { AUTH_RATE_LIMIT_MAX: '3' } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await env.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.dev', password: 'x' } })).statusCode);
    expect(codes.slice(0, 3)).toEqual([401, 401, 401]);
    expect(codes.slice(3)).toEqual([429, 429]);
    await env.close();
  });
});

describe('Socket.IO: authenticated, room-scoped real-time events', () => {
  let env: Awaited<ReturnType<typeof makeEnv>>;
  let alice: Awaited<ReturnType<typeof env.makeUser>>;
  let bob: Awaited<ReturnType<typeof env.makeUser>>;
  let url: string; let execId: string;
  const sockets: Socket[] = [];
  const open = async (token?: string) => {
    const s = connect(url, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await new Promise<void>((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
    return s;
  };
  const sub = (s: Socket, executionId: string) => new Promise<{ ok: boolean }>((res) => s.emit('subscribe', { executionId }, res));

  beforeAll(async () => {
    env = await makeEnv();
    await env.app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(env.app.server.address() as AddressInfo).port}`;
    alice = await env.makeUser(); bob = await env.makeUser();
    execId = ((await env.app.inject({ method: 'POST', url: '/api/tasks', headers: alice.auth, payload: task })).json() as { execution: { id: string } }).execution.id;
  });
  afterAll(async () => { sockets.forEach((s) => s.close()); await env.close(); });

  it('rejects unauthenticated and forged connections', async () => {
    await expect(open()).rejects.toThrow(/unauthorized/);
    await expect(open('forged.token.value')).rejects.toThrow(/unauthorized/);
  });

  it('owner receives live events; another user cannot subscribe and receives nothing', async () => {
    const a = await open(alice.token); const b = await open(bob.token);
    const aliceGot: { type: string }[] = []; const bobGot: { type: string }[] = [];
    a.on('execution:event', (e) => aliceGot.push(e)); b.on('execution:event', (e) => bobGot.push(e));
    expect((await sub(a, execId)).ok).toBe(true);
    expect(await sub(b, execId)).toEqual({ ok: false, error: 'not_found' });
    expect(await sub(b, 'not-a-uuid')).toEqual({ ok: false, error: 'invalid_payload' });

    await env.app.inject({ method: 'POST', url: `/api/executions/${execId}/approve`, headers: alice.auth });
    await env.orchestrator.waitFor(execId);
    await waitFor(async () => aliceGot.some((e) => e.type === 'execution.status') && aliceGot.some((e) => e.type === 'step.status'), 5000, 'alice events');
    expect(aliceGot.some((e) => e.type === 'step.status')).toBe(true);
    expect(aliceGot.every((e) => !('userId' in e))).toBe(true);
    await new Promise((r) => setTimeout(r, 200));
    expect(bobGot).toHaveLength(0);
  });

  it('user-level room only carries that user’s execution lifecycle events', async () => {
    const a = await open(alice.token); const b = await open(bob.token);
    const aGot: { type: string }[] = []; const bGot: { type: string }[] = [];
    a.on('execution:event', (e) => aGot.push(e)); b.on('execution:event', (e) => bGot.push(e));
    await env.app.inject({ method: 'POST', url: '/api/tasks', headers: alice.auth, payload: task });
    await waitFor(async () => aGot.some((e) => e.type === 'plan.ready'), 3000, 'plan.ready on user room');
    expect(aGot.every((e) => e.type.startsWith('execution.') || e.type === 'plan.ready' || e.type.startsWith('approval.'))).toBe(true);
    expect(bGot).toHaveLength(0);
  });
});
