import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
const DEFAULT_MODELS = { openai: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-5' };
/** Provider adapter on top of the Vercel AI SDK (structured output via generateObject). Keys stay server-side. */
export class AiSdkProvider {
    isMock = false;
    name;
    model;
    lm;
    constructor(cfg) {
        if (cfg.LLM_PROVIDER === 'openai') {
            this.name = 'openai';
            this.model = cfg.LLM_MODEL || DEFAULT_MODELS.openai;
            this.lm = createOpenAI({ apiKey: cfg.OPENAI_API_KEY })(this.model);
        }
        else if (cfg.LLM_PROVIDER === 'anthropic') {
            this.name = 'anthropic';
            this.model = cfg.LLM_MODEL || DEFAULT_MODELS.anthropic;
            this.lm = createAnthropic({ apiKey: cfg.ANTHROPIC_API_KEY })(this.model);
        }
        else {
            throw new Error(`AiSdkProvider does not support provider "${cfg.LLM_PROVIDER}"`);
        }
    }
    async generateObject(req) {
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
        }));
        return {
            object: res.object,
            usage: { inputTokens: res.usage.inputTokens ?? 0, outputTokens: res.usage.outputTokens ?? 0 },
            latencyMs: Date.now() - t0,
        };
    }
}
