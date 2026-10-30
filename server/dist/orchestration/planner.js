import { PlanValidationError } from './types.js';
/**
 * Validates a model-produced plan and resolves every step to a concrete, enabled agent via capability routing.
 * Guarantees: unique ids, known dependencies, acyclic graph, step budget, valid conditions,
 * and (when a reviewer agent is available) at least one reviewer step covering all other steps.
 */
export function validateAndResolvePlan(raw, registry, limits) {
    if (raw.steps.length > limits.maxPlanSteps)
        throw new PlanValidationError(`Plan has ${raw.steps.length} steps; limit is ${limits.maxPlanSteps}`);
    const ids = new Set();
    for (const s of raw.steps) {
        if (ids.has(s.id))
            throw new PlanValidationError(`Duplicate step id "${s.id}"`);
        ids.add(s.id);
    }
    const steps = raw.steps.map((s) => {
        for (const d of s.dependsOn) {
            if (d === s.id)
                throw new PlanValidationError(`Step "${s.id}" depends on itself`);
            if (!ids.has(d))
                throw new PlanValidationError(`Step "${s.id}" depends on unknown step "${d}"`);
        }
        if (s.condition && !s.dependsOn.includes(s.condition.stepId))
            throw new PlanValidationError(`Condition of "${s.id}" must reference one of its dependencies`);
        const agent = registry.route(s.capability, s.agent);
        if (!agent)
            throw new PlanValidationError(`No enabled agent provides capability "${s.capability}" (step "${s.id}")`);
        return { ...s, capability: s.capability.toLowerCase(), agent: agent.slug, dependsOn: [...new Set(s.dependsOn)] };
    });
    assertAcyclic(steps);
    const reviewer = registry.byRole('reviewer')[0];
    if (reviewer && !steps.some((s) => registry.get(s.agent)?.role === 'reviewer')) {
        let id = 'final-review';
        while (ids.has(id))
            id += '_';
        steps.push({
            id, title: 'Review and verify results', capability: reviewer.capabilities[0] ?? 'review', agent: reviewer.slug,
            instruction: 'Review every upstream step output for completeness, consistency and evidence. Provide one verdict per step.',
            dependsOn: steps.map((s) => s.id), condition: null,
        });
    }
    return { summary: raw.summary, steps };
}
export function assertAcyclic(steps) {
    const indeg = new Map(steps.map((s) => [s.id, s.dependsOn.length]));
    const queue = steps.filter((s) => s.dependsOn.length === 0).map((s) => s.id);
    let seen = 0;
    while (queue.length) {
        const id = queue.shift();
        seen++;
        for (const s of steps) {
            if (s.dependsOn.includes(id)) {
                const n = (indeg.get(s.id) ?? 0) - 1;
                indeg.set(s.id, n);
                if (n === 0)
                    queue.push(s.id);
            }
        }
    }
    if (seen !== steps.length)
        throw new PlanValidationError('Plan contains a dependency cycle');
}
