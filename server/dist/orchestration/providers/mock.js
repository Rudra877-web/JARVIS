/**
 * Deterministic provider for development and tests. It performs NO reasoning: plans follow a fixed template and agent
 * outputs are derived mechanically from real tool results. Everything it produces is prefixed "[MOCK]" and executions
 * created with it are flagged `mock = true` (shown in the UI).
 */
export class MockProvider {
    name = 'mock';
    model = 'mock-deterministic';
    isMock = true;
    calls = [];
    async generateObject(req) {
        if (req.signal?.aborted)
            throw new Error('aborted');
        this.calls.push({ purpose: req.purpose });
        const meta = (req.meta ?? {});
        let obj;
        if (req.purpose === 'plan')
            obj = this.plan(meta);
        else if (req.purpose === 'aggregate')
            obj = this.aggregate(meta);
        else
            obj = this.agentTurn(meta);
        const parsed = req.schema.parse(obj);
        return { object: parsed, usage: { inputTokens: Math.ceil((req.system.length + req.prompt.length) / 4), outputTokens: Math.ceil(JSON.stringify(obj).length / 4) }, latencyMs: 1 };
    }
    plan(meta) {
        const caps = (meta.capabilities ?? []);
        const has = (c) => caps.includes(c);
        const steps = [];
        if (has('research'))
            steps.push({ id: 'research', title: 'Gather and record facts', capability: 'research', agent: null, instruction: 'Collect the facts available in the task context and record evidence.', dependsOn: [], condition: null });
        if (has('analysis')) {
            steps.push({ id: 'analyze', title: 'Analyse context for risks', capability: 'analysis', agent: null, instruction: 'Scan the supplied context for problems and rate their severity.', dependsOn: steps.some((s) => s.id === 'research') ? ['research'] : [], condition: null });
            steps.push({ id: 'deep-dive', title: 'Deep dive on high-severity findings', capability: 'analysis', agent: null, instruction: 'Only runs when a high-severity finding exists: examine those findings in more depth.', dependsOn: ['analyze'], condition: { stepId: 'analyze', minSeverity: 'high' } });
        }
        for (const c of caps)
            if (!['research', 'analysis', 'evidence', 'risk-assessment', 'review', 'verification', 'planning', 'aggregation'].includes(c) && steps.length < 6) {
                steps.push({ id: `custom-${steps.length}`, title: `Custom work: ${c}`, capability: c, agent: null, instruction: `Perform the "${c}" part of the task.`, dependsOn: [], condition: null });
            }
        if (steps.length === 0)
            throw new Error('mock plan: no usable capabilities selected');
        return { summary: '[MOCK] Template plan: research → analysis → (conditional deep dive) → review.', steps };
    }
    agentTurn(meta) {
        const role = meta.role;
        const results = (meta.toolResults ?? []); // eslint-disable-line @typescript-eslint/no-explicit-any
        const tools = (meta.availableTools ?? []);
        const used = (t) => results.some((r) => r.tool === t);
        const call = (tool, args) => ({ action: 'tool_call', tool, argsJson: JSON.stringify(args), outputJson: null, rationale: '[MOCK] deterministic tool choice' });
        const final = (o) => ({ action: 'final', tool: null, argsJson: null, outputJson: JSON.stringify(o), rationale: null });
        if (role === 'researcher') {
            if (tools.includes('task_context') && !used('task_context'))
                return call('task_context', { section: 'all' });
            const ctx = results.find((r) => r.tool === 'task_context')?.result?.data ?? {};
            const facts = [
                ctx.description ? { claim: `Task description: ${String(ctx.description).slice(0, 160)}`, source: 'tool:task_context' } : null,
                ctx.context ? { claim: `Supplied context is ${String(ctx.context).length} characters long`, source: 'tool:task_context' } : null,
            ].filter(Boolean);
            return final({ summary: `[MOCK] Collected ${facts.length} fact(s) from task context. No external research performed.`, facts, assumptions: ['Mock mode: no live model reasoning was used.'] });
        }
        if (role === 'analyst') {
            if (tools.includes('pattern_scan') && !used('pattern_scan'))
                return call('pattern_scan', {});
            const scan = results.find((r) => r.tool === 'pattern_scan')?.result?.data ?? { matches: [] };
            const matches = (scan.matches ?? []);
            const findings = matches.slice(0, 10).map((m) => ({ title: `${m.label} (line ${m.line})`, severity: m.severity, reasoning: `Pattern preset "${m.preset}" matched.`, evidence: m.excerpt }));
            return final({ summary: `[MOCK] Pattern scan produced ${findings.length} finding(s).`, findings });
        }
        if (role === 'reviewer') {
            const upstream = (meta.upstream ?? {}); // eslint-disable-line @typescript-eslint/no-explicit-any
            const verdicts = Object.entries(upstream).map(([stepId, out]) => {
                const empty = Array.isArray(out?.facts) && out.facts.length === 0;
                return empty
                    ? { stepId, verdict: 'needs_human_review', reasoning: '[MOCK] No facts were recorded.' }
                    : { stepId, verdict: 'verified', reasoning: '[MOCK] Output is structurally complete; evidence fields present.' };
            });
            return final({ summary: `[MOCK] Reviewed ${verdicts.length} step(s) structurally.`, verdicts });
        }
        if (role === 'custom') {
            if (tools.includes('folder_list') && !used('folder_list')) {
                return call('folder_list', { folder: '.' });
            }
            const listRes = results.find((r) => r.tool === 'folder_list')?.result?.data;
            if (listRes && typeof listRes === 'object' && 'count' in listRes) {
                return final({ summary: `[MOCK] Folder agent inspected "${listRes.folder}": found ${listRes.count} item(s). Processed instructions.` });
            }
            return final({ summary: `[MOCK] Custom agent acknowledged: ${String(meta.instruction ?? '').slice(0, 120)}` });
        }
        return final({ summary: `[MOCK] Agent acknowledged: ${String(meta.instruction ?? '').slice(0, 120)}` });
    }
    aggregate(meta) {
        const steps = (meta.steps ?? []);
        return {
            title: `[MOCK] Report: ${meta.taskTitle ?? 'task'}`,
            summary: '[MOCK] Mechanical aggregation of step summaries. No model reasoning was applied.',
            sections: steps.map((s) => ({ heading: s.title, body: s.summary })),
            openIssues: (meta.openIssues ?? []),
        };
    }
}
