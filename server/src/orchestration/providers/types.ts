import type { z } from 'zod';

export type Purpose = 'plan' | 'agent' | 'aggregate';

export interface GenerateRequest<T> {
  purpose: Purpose;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  signal?: AbortSignal;
  /** Structured hints. Real providers ignore this; the mock provider uses it to behave deterministically. */
  meta?: Record<string, unknown>;
}
export interface GenerateResult<T> { object: T; usage: { inputTokens: number; outputTokens: number }; latencyMs: number }

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  /** true only when explicitly configured; surfaced in the UI and persisted on every execution. */
  readonly isMock: boolean;
  generateObject<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>>;
}
