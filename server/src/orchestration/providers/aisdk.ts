import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, type LanguageModel } from 'ai';
import type { AppConfig } from '../../config.js';
import type { GenerateRequest, GenerateResult, LLMProvider } from './types.js';

const DEFAULT_MODELS = { openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-5' } as const;

/** Provider adapter on top of the Vercel AI SDK (structured output via generateObject). Keys stay server-side. */
export class AiSdkProvider implements LLMProvider {
  readonly isMock = false;
  readonly name: string;
  readonly model: string;
  private readonly lm: LanguageModel;

  constructor(cfg: Pick<AppConfig, 'LLM_PROVIDER' | 'LLM_MODEL' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY'>) {
    if (cfg.LLM_PROVIDER === 'openai') {
      this.name = 'openai';
      this.model = cfg.LLM_MODEL || DEFAULT_MODELS.openai;
      this.lm = createOpenAI({ apiKey: cfg.OPENAI_API_KEY })(this.model);
    } else if (cfg.LLM_PROVIDER === 'anthropic') {
      this.name = 'anthropic';
      this.model = cfg.LLM_MODEL || DEFAULT_MODELS.anthropic;
      this.lm = createAnthropic({ apiKey: cfg.ANTHROPIC_API_KEY })(this.model);
    } else {
      throw new Error(`AiSdkProvider does not support provider "${cfg.LLM_PROVIDER}"`);
    }
  }

  async generateObject<T>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
    const t0 = Date.now();
    // Cast: the SDK's generic overloads cannot infer T from a runtime zod schema.
    const res = (await generateObject({
      model: this.lm,
      schema: req.schema,
      system: req.system,
      prompt: req.prompt,
      abortSignal: req.signal,
      temperature: 0.2,
      maxRetries: 1,
    } as never)) as unknown as { object: T; usage: { inputTokens?: number; outputTokens?: number } };
    return {
      object: res.object,
      usage: { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0 },
      latencyMs: Date.now() - t0,
    };
  }
}
