import { describe, expect, it } from 'vitest';
import { AgentRegistry, BUILTIN_AGENTS } from '../src/orchestration/agents.js';
import { assertFetchable, createDefaultToolRegistry, isPrivateIp } from '../src/orchestration/tools.js';
import { assertAcyclic, validateAndResolvePlan } from '../src/orchestration/planner.js';
import { canTransition, DEFAULT_LIMITS, type AgentDef, type Plan, PlanSchema, TERMINAL } from '../src/orchestration/types.js';

const defs: AgentDef[] = BUILTIN_AGENTS.map((a, i) => ({ ...a, id: `id-${i}`, ownerId: null }));
const custom: AgentDef = { id: 'c1', slug: 'custom-x', name: 'Translator', description: '', role: 'custom', capabilities: ['translate'], allowedTools: [], systemPrompt: '', enabled: true, isBuiltin: false, ownerId: 'u' };
const step = (id: string, capability: string, dependsOn: string[] = [], extra: Partial<Plan['steps'][number]> = {}): Plan['steps'][number] => ({ id, title: id, capability, agent: null, instruction: 'do it', dependsOn, condition: null, ...extra });

describe('agent registry & capability routing', () => {
  const reg = new AgentRegistry([...defs, custom]);
  it('routes by capability', () => {
    expect(reg.route('research')?.slug).toBe('researcher');
    expect(reg.route('analysis')?.slug).toBe('analyst');
    expect(reg.route('translate')?.slug).toBe('custom-x');
  });
  it('never routes to the coordinator or unknown capabilities', () => {
    expect(reg.route('planning')).toBeUndefined();
    expect(reg.route('nonexistent')).toBeUndefined();
  });
  it('honours a preferred agent only when it has the capability', () => {
    expect(reg.route('translate', 'custom-x')?.slug).toBe('custom-x');
    expect(reg.route('research', 'custom-x')?.slug).toBe('researcher');
  });
  it('skips disabled agents', () => {
    const r = new AgentRegistry([...defs, { ...custom, enabled: false }]);
    expect(r.route('translate')).toBeUndefined();
  });
});

describe('plan validation', () => {
  const reg = new AgentRegistry(defs);
  const plan = (steps: Plan['steps']): Plan => ({ summary: 's', steps });
  it('resolves agents and appends a reviewer step covering everything', () => {
    const p = validateAndResolvePlan(plan([step('a', 'research'), step('b', 'analysis', ['a'])]), reg, DEFAULT_LIMITS);
    expect(p.steps.map((s) => s.agent)).toEqual(['researcher', 'analyst', 'reviewer']);
    expect(p.steps[2]!.dependsOn).toEqual(['a', 'b']);
  });
  it('does not append a second reviewer if one exists', () => {
    const p = validateAndResolvePlan(plan([step('a', 'research'), step('r', 'review', ['a'])]), reg, DEFAULT_LIMITS);
    expect(p.steps).toHaveLength(2);
  });
  it('rejects cycles, unknown deps, self deps, duplicate ids', () => {
    expect(() => validateAndResolvePlan(plan([step('a', 'research', ['b']), step('b', 'analysis', ['a'])]), reg, DEFAULT_LIMITS)).toThrow(/cycle/);
    expect(() => validateAndResolvePlan(plan([step('a', 'research', ['zzz'])]), reg, DEFAULT_LIMITS)).toThrow(/unknown step/);
    expect(() => validateAndResolvePlan(plan([step('a', 'research', ['a'])]), reg, DEFAULT_LIMITS)).toThrow(/itself/);
    expect(() => validateAndResolvePlan(plan([step('a', 'research'), step('a', 'analysis')]), reg, DEFAULT_LIMITS)).toThrow(/Duplicate/);
  });
  it('enforces the step budget and capability availability', () => {
    expect(() => validateAndResolvePlan(plan([step('a', 'research'), step('b', 'research')]), reg, { ...DEFAULT_LIMITS, maxPlanSteps: 1 })).toThrow(/limit/);
    expect(() => validateAndResolvePlan(plan([step('a', 'telepathy')]), reg, DEFAULT_LIMITS)).toThrow(/No enabled agent/);
  });
  it('requires conditions to reference a dependency', () => {
    expect(() => validateAndResolvePlan(plan([step('a', 'research'), step('b', 'analysis', [], { condition: { stepId: 'a', minSeverity: 'high' } })]), reg, DEFAULT_LIMITS)).toThrow(/Condition/);
  });
  it('detects cycles directly', () => { expect(() => assertAcyclic([{ id: 'a', dependsOn: ['a'] }])).toThrow(); });
  it('plan schema rejects malformed LLM output', () => {
    expect(PlanSchema.safeParse({ summary: 'x', steps: [] }).success).toBe(false);
    expect(PlanSchema.safeParse({ summary: 'x', steps: [{ id: 'Bad Id', title: 't', capability: 'c', agent: null, instruction: 'i', dependsOn: [], condition: null }] }).success).toBe(false);
  });
});

describe('state machine', () => {
  it('allows the documented happy path', () => {
    for (const [a, b] of [['PENDING', 'PLANNING'], ['PLANNING', 'AWAITING_APPROVAL'], ['AWAITING_APPROVAL', 'RUNNING'], ['RUNNING', 'VERIFYING'], ['VERIFYING', 'COMPLETED']] as const) expect(canTransition(a, b)).toBe(true);
  });
  it('forbids skipping states and leaving terminal states', () => {
    expect(canTransition('PENDING', 'RUNNING')).toBe(false);
    expect(canTransition('RUNNING', 'COMPLETED')).toBe(false);
    for (const t of TERMINAL) for (const to of ['RUNNING', 'PENDING', 'COMPLETED'] as const) expect(canTransition(t, to)).toBe(false);
  });
});

describe('tools', () => {
  const tools = createDefaultToolRegistry();
  it('validates tool arguments with zod', () => {
    const scan = tools.get('pattern_scan')!;
    expect(scan.argsSchema.safeParse({ presets: ['secrets'] }).success).toBe(true);
    expect(scan.argsSchema.safeParse({ presets: ['(a+)+$'] }).success).toBe(false); // no user-supplied regex
    expect(tools.get('record_evidence')!.argsSchema.safeParse({ claim: 'x' }).success).toBe(false);
    expect(tools.get('http_fetch')!.argsSchema.safeParse({ url: 'not a url' }).success).toBe(false);
  });
  it('marks external fetch as sensitive', () => { expect(tools.get('http_fetch')!.sensitive).toBe(true); });
  it('describes tools with JSON schema for the model', () => { expect(tools.describe(['task_context'])[0]!.args).toMatchObject({ type: 'object' }); });
  it('pattern_scan redacts secrets', async () => {
    const out = await tools.get('pattern_scan')!.execute({ presets: ['secrets'] }, { task: { title: '', description: '', context: 'api_key = "sk_live_abcdef123456"' } } as never) as { matches: { excerpt: string }[] };
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0]!.excerpt).not.toContain('abcdef123456');
  });
  it('SSRF guard blocks private ranges, http, creds and non-allow-listed hosts', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1']) expect(isPrivateIp(ip)).toBe(true);
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    await expect(assertFetchable('http://example.com', ['example.com'])).rejects.toThrow(/https/);
    await expect(assertFetchable('https://evil.com/x', ['example.com'])).rejects.toThrow(/allow/i);
    await expect(assertFetchable('https://user:pw@example.com', ['example.com'])).rejects.toThrow(/Credentials/);
    await expect(assertFetchable('https://127.0.0.1/', ['127.0.0.1'])).rejects.toThrow(/private/);
  });
  it('registers folder tools', () => {
    expect(tools.has('folder_list')).toBe(true);
    expect(tools.has('folder_read_file')).toBe(true);
    expect(tools.has('folder_write_file')).toBe(true);
    expect(tools.has('folder_search')).toBe(true);
  });
});

import { scanWorkspaceFolders } from '../src/orchestration/folderScanner.js';
import { safeResolvePath } from '../src/orchestration/workspaceFs.js';

describe('folder agents & workspace fs', () => {
  it('blocks path traversal outside workspace', () => {
    expect(() => safeResolvePath('../../secret')).toThrow(/escapes workspace/);
  });
  it('auto-discovers workspace folders and generates agents', () => {
    const folders = scanWorkspaceFolders();
    expect(folders.length).toBeGreaterThan(0);
    const slugs = folders.map((f) => f.slug);
    expect(slugs).toContain('folder-apps-server');
    expect(slugs).toContain('folder-apps-web');
    const serverAgent = folders.find((f) => f.slug === 'folder-apps-server');
    expect(serverAgent?.allowedTools).toContain('folder_list');
    expect(serverAgent?.allowedTools).toContain('folder_read_file');
    expect(serverAgent?.allowedTools).toContain('folder_write_file');
    expect(serverAgent?.allowedTools).toContain('folder_search');
  });
});

