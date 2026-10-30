export const untrusted = (label, text, max = 6000) => `<untrusted source="${label}">\n${text.length > max ? text.slice(0, max) + '\n…[truncated]' : text}\n</untrusted>`;
export function planPrompt(task, registry, limits, feedback) {
    const agents = registry.routable().map((a) => `- ${a.slug} (${a.role}): capabilities [${a.capabilities.join(', ')}]; tools [${a.allowedTools.join(', ')}] — ${a.description}`).join('\n');
    return [
        `Create an execution plan for this task.`,
        `Title: ${task.title}`,
        `Description: ${task.description}`,
        task.context ? untrusted('task_context', task.context, 4000) : '(no extra context supplied)',
        `Available agents:\n${agents}`,
        `Constraints: at most ${limits.maxPlanSteps} steps; step ids lowercase [a-z0-9_-]; every step needs a capability offered by some agent; dependsOn must reference earlier step ids; ` +
            `use "condition" ({stepId, minSeverity}) only to run a step when a dependency's findings reach that severity; set agent to null unless you have a strong preference. ` +
            `Do not add a review step — one is appended automatically.`,
        feedback ? `Your previous plan was rejected: ${feedback}. Fix it.` : '',
    ].filter(Boolean).join('\n\n');
}
export function agentPrompt(opts) {
    const outputShape = {
        researcher: '{"summary": string, "facts": [{"claim": string, "source": string}], "assumptions": [string]}',
        analyst: '{"summary": string, "findings": [{"title": string, "severity": "info|low|medium|high|critical", "reasoning": string, "evidence"?: string}]}',
        reviewer: '{"summary": string, "verdicts": [{"stepId": string, "verdict": "verified|rejected|needs_human_review", "reasoning": string, "revisionRequest"?: string}]}',
        custom: '{"summary": string, "details"?: string}',
    };
    return [
        `Task: ${opts.task.title}\n${opts.task.description}`,
        `Your instruction: ${opts.instruction}`,
        Object.keys(opts.upstream).length ? `Upstream results (by step id):\n${untrusted('upstream_agents', JSON.stringify(opts.upstream, null, 1), 8000)}` : '',
        `Available tools (call at most one per turn; sensitive tools require human approval):\n${opts.tools.length ? JSON.stringify(opts.tools, null, 1) : '(none)'}`,
        opts.transcript.length ? `Conversation so far:\n${opts.transcript.join('\n')}` : '',
        opts.feedback ? `Feedback to address: ${opts.feedback}` : '',
        opts.mustFinish
            ? 'You MUST now return action="final".'
            : 'Respond with action="tool_call" (tool + argsJson as a JSON string) OR action="final".',
        `For action="final", outputJson must be a JSON string shaped like: ${outputShape[opts.role] ?? outputShape.custom}`,
    ].filter(Boolean).join('\n\n');
}
export function aggregatePrompt(task, steps, verification) {
    return [
        `Compile the final report for task "${task.title}". Use ONLY the verified information below; flag anything rejected or needing human review in openIssues. Do not invent findings.`,
        untrusted('step_outputs', JSON.stringify(steps, null, 1), 10000),
        `Verification summary (authoritative, computed by the platform): ${JSON.stringify(verification)}`,
    ].join('\n\n');
}
