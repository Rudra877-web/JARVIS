import { AiSdkProvider } from './aisdk.js';
import { MockProvider } from './mock.js';
export function createProvider(cfg) {
    return cfg.LLM_PROVIDER === 'mock' ? new MockProvider() : new AiSdkProvider(cfg);
}
