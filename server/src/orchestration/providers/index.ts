import type { AppConfig } from '../../config.js';
import { AiSdkProvider } from './aisdk.js';
import { MockProvider } from './mock.js';
import type { LLMProvider } from './types.js';

export function createProvider(cfg: AppConfig): LLMProvider {
  return cfg.LLM_PROVIDER === 'mock' ? new MockProvider() : new AiSdkProvider(cfg);
}
export type { LLMProvider } from './types.js';
