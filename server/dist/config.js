import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
if (!process.env.JWT_SECRET) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
        path.resolve(currentDir, '../../.env'),
        path.resolve(currentDir, '../../../.env'),
        path.resolve(process.cwd(), '../.env'),
        path.resolve(process.cwd(), '../../.env'),
    ];
    for (const envPath of candidatePaths) {
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            if (process.env.JWT_SECRET)
                break;
        }
    }
}
const csv = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const EnvSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    HOST: z.string().default('0.0.0.0'),
    DATABASE_URL: z.string().default('postgres://nexus:nexus@localhost:5432/nexus'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    RATE_LIMIT_MAX: z.coerce.number().int().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(10),
    LLM_PROVIDER: z.enum(['mock', 'openai', 'anthropic']).default('mock'),
    LLM_MODEL: z.string().default(''),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    COST_PER_1K_INPUT_USD: z.coerce.number().default(0),
    COST_PER_1K_OUTPUT_USD: z.coerce.number().default(0),
    FETCH_ALLOWED_HOSTS: z.string().optional(),
    APPROVAL_TIMEOUT_MS: z.coerce.number().int().default(10 * 60_000),
    MAX_PARALLEL_STEPS: z.coerce.number().int().min(1).max(8).default(3),
    MAX_RETRY_CHAIN: z.coerce.number().int().default(3),
    MAX_CONCURRENT_EXECUTIONS_PER_USER: z.coerce.number().int().default(3),
});
export function loadConfig(env = process.env) {
    const parsed = EnvSchema.safeParse(env);
    if (!parsed.success) {
        throw new Error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
    }
    const { FETCH_ALLOWED_HOSTS, ...rest } = parsed.data;
    const cfg = { ...rest, fetchAllowedHosts: csv(FETCH_ALLOWED_HOSTS) };
    if (cfg.LLM_PROVIDER === 'openai' && !cfg.OPENAI_API_KEY)
        throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY');
    if (cfg.LLM_PROVIDER === 'anthropic' && !cfg.ANTHROPIC_API_KEY)
        throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
    return cfg;
}
