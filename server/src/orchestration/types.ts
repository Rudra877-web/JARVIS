import { z } from 'zod';

export const Severity = z.enum(['info', 'low', 'medium', 'high', 'critical']);
export type Severity = z.infer<typeof Severity>;
export const SEVERITY_ORDER: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

export type ExecutionStatus = 'PENDING' | 'PLANNING' | 'AWAITING_APPROVAL' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
export type VerificationStatus = 'VERIFIED' | 'NEEDS_HUMAN_REVIEW' | 'REJECTED' | 'UNVERIFIED';
export type AgentRole = 'coordinator' | 'researcher' | 'analyst' | 'reviewer' | 'custom';

/** Explicit state machine. Every status change goes through `canTransition`. */
export const TRANSITIONS: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  PENDING: ['PLANNING', 'CANCELLED', 'FAILED'],
  PLANNING: ['AWAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: ['RUNNING', 'CANCELLED', 'FAILED'],
  RUNNING: ['VERIFYING', 'FAILED', 'CANCELLED'],
  VERIFYING: ['COMPLETED', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};
export const TERMINAL: readonly ExecutionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];
export const canTransition = (from: ExecutionStatus, to: ExecutionStatus) => TRANSITIONS[from].includes(to);
export const allowedFrom = (to: ExecutionStatus) => (Object.keys(TRANSITIONS) as ExecutionStatus[]).filter((s) => canTransition(s, to));

/* ---------- Limits ---------- */
export const LimitsSchema = z.object({
  maxPlanSteps: z.number().int().min(1).max(20).default(8),
  maxRetries: z.number().int().min(0).max(5).default(2),
  stepTimeoutMs: z.number().int().min(500).max(300_000).default(60_000),
  maxTurns: z.number().int().min(1).max(200).default(40),
  maxTokens: z.number().int().min(1_000).max(2_000_000).default(200_000),
  maxRevisions: z.number().int().min(0).max(3).default(1),
  maxToolCallsPerStep: z.number().int().min(1).max(10).default(5),
});
export type Limits = z.infer<typeof LimitsSchema>;
export const DEFAULT_LIMITS: Limits = LimitsSchema.parse({});

/* ---------- Plan (provider-facing schema uses nullable, not optional, for strict structured output) ---------- */
export const PlanStepSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,32}$/, 'step id must be lowercase alphanumeric/-/_'),
  title: z.string().min(1).max(120),
  capability: z.string().min(1).max(64),
  agent: z.string().max(80).nullable(),
  instruction: z.string().min(1).max(2000),
  dependsOn: z.array(z.string()),
  condition: z.object({ stepId: z.string(), minSeverity: Severity }).nullable(),
});
export const PlanSchema = z.object({
  summary: z.string().min(1).max(1000),
  steps: z.array(PlanStepSchema).min(1).max(20),
});
export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

/* ---------- Agent step outputs ---------- */
export const ResearcherOutput = z.object({
  summary: z.string(),
  facts: z.array(z.object({ claim: z.string(), source: z.string() })),
  assumptions: z.array(z.string()),
});
export const AnalystOutput = z.object({
  summary: z.string(),
  findings: z.array(z.object({ title: z.string(), severity: Severity, reasoning: z.string(), evidence: z.string().optional() })),
});
export const Verdict = z.enum(['verified', 'rejected', 'needs_human_review']);
export const ReviewerOutput = z.object({
  summary: z.string(),
  verdicts: z.array(z.object({ stepId: z.string(), verdict: Verdict, reasoning: z.string(), revisionRequest: z.string().optional() })),
});
export const CustomOutput = z.object({ summary: z.string(), details: z.string().optional() });

export const OUTPUT_SCHEMAS = {
  researcher: ResearcherOutput,
  analyst: AnalystOutput,
  reviewer: ReviewerOutput,
  custom: CustomOutput,
} as const;
export type StepOutput = Record<string, unknown> & { summary: string };

/** A single agent "turn": either call one tool or deliver the final output. JSON-as-string keeps strict-mode providers happy. */
export const AgentTurnSchema = z.object({
  action: z.enum(['tool_call', 'final']),
  tool: z.string().nullable(),
  argsJson: z.string().nullable(),
  outputJson: z.string().nullable(),
  rationale: z.string().nullable(),
});
export type AgentTurn = z.infer<typeof AgentTurnSchema>;

export const FinalReportSchema = z.object({
  title: z.string(),
  summary: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
  openIssues: z.array(z.string()),
});
export type FinalReport = z.infer<typeof FinalReportSchema>;

/* ---------- Agents ---------- */
export interface AgentDef {
  id: string;
  slug: string;
  name: string;
  description: string;
  role: AgentRole;
  capabilities: string[];
  allowedTools: string[];
  systemPrompt: string;
  enabled: boolean;
  isBuiltin: boolean;
  ownerId: string | null;
}

export interface ToolCallRecord {
  tool: string;
  args: unknown;
  status: 'ok' | 'error' | 'denied' | 'rejected' | 'invalid';
  resultSummary: string;
  durationMs: number;
  approvalId?: string;
  at: string;
}

/* ---------- Errors ---------- */
export class OrchestrationError extends Error {
  constructor(message: string, public readonly retryable = true) { super(message); this.name = new.target.name; }
}
export class PlanValidationError extends OrchestrationError { constructor(m: string) { super(m, true); } }
export class InvalidOutputError extends OrchestrationError { constructor(m: string) { super(m, true); } }
export class StepTimeoutError extends OrchestrationError { constructor(ms: number) { super(`Step timed out after ${ms}ms`, true); } }
export class BudgetExceededError extends OrchestrationError { constructor(m: string) { super(m, false); } }
export class CancelledError extends OrchestrationError { constructor() { super('Execution cancelled', false); } }
