export type ExecutionStatus = 'PENDING' | 'PLANNING' | 'AWAITING_APPROVAL' | 'RUNNING' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
export type StepStatus = 'PENDING' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'SKIPPED' | 'CANCELLED';
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface PlanStep {
  id: string; title: string; capability: string; agent: string | null; instruction: string; dependsOn: string[];
  condition: { stepId: string; minSeverity: Severity } | null;
}
export interface Plan { summary: string; steps: PlanStep[] }
export interface Limits { maxPlanSteps: number; maxRetries: number; stepTimeoutMs: number; maxTurns: number; maxTokens: number; maxRevisions: number; maxToolCallsPerStep: number }

export interface Execution {
  id: string; taskId: string; status: ExecutionStatus; plan: Plan | null; limits: Limits; selectedAgents: string[]; selectedTools: string[];
  verificationStatus: 'VERIFIED' | 'NEEDS_HUMAN_REVIEW' | 'REJECTED' | 'UNVERIFIED' | null; finalReport: FinalReport | null; error: string | null;
  mock: boolean; provider: string; model: string; retryOf: string | null; tokensIn: number; tokensOut: number; costUsd: number;
  startedAt: string | null; finishedAt: string | null; createdAt: string; taskTitle?: string;
}
export interface FinalReport {
  title: string; summary: string; sections: { heading: string; body: string }[]; openIssues: string[]; mock?: boolean;
  verification: { status: string; verdicts: { stepId: string; verdict: string; reasoning: string }[] };
}
export interface ToolCall { tool: string; args: unknown; status: 'ok' | 'error' | 'denied' | 'rejected' | 'invalid'; resultSummary: string; durationMs: number; approvalId?: string; at: string }
export interface Step {
  id: string; stepKey: string; title: string; agentSlug: string; agentRole: string; capability: string; instruction: string; dependsOn: string[];
  status: StepStatus; attempt: number; revision: number; output: Record<string, unknown> | null; toolCalls: ToolCall[]; error: string | null;
  skipReason: string | null; tokensIn: number; tokensOut: number; durationMs: number | null; startedAt: string | null; finishedAt: string | null;
}
export interface Approval { id: string; executionId: string; stepKey: string; toolName: string; arguments: unknown; reason: string; status: 'pending' | 'approved' | 'rejected' | 'expired'; createdAt: string }
export interface Artifact { id: string; kind: string; title: string; content: unknown; stepKey: string | null }
export interface ExecutionDetail { execution: Execution; task: { title: string; description: string; context: string }; steps: Step[]; artifacts: Artifact[]; approvals: Approval[]; live: boolean }
export interface ExecEvent { id: string; executionId: string; seq: number; type: string; payload: Record<string, unknown>; createdAt: string }

export interface Agent {
  id: string; slug: string; name: string; description: string; role: string; capabilities: string[]; allowedTools: string[];
  enabled: boolean; isBuiltin: boolean; stats: { runs: number; completed: number; failed: number; avgMs: number };
}
export interface Tool { id: string; name: string; description: string; sensitive: boolean; external: boolean; enabled: boolean }
export interface DiscoveredFolder {
  folderPath: string; slug: string; name: string; description: string; capabilities: string[]; allowedTools: string[]; filesSample: string[];
}

