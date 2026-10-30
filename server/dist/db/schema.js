import { sql } from 'drizzle-orm';
import { bigserial, boolean, check, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, } from 'drizzle-orm/pg-core';
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
export const EXECUTION_STATUSES = ['PENDING', 'PLANNING', 'AWAITING_APPROVAL', 'RUNNING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED'];
export const STEP_STATUSES = ['PENDING', 'RUNNING', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED'];
export const VERIFICATION_STATUSES = ['VERIFIED', 'NEEDS_HUMAN_REVIEW', 'REJECTED', 'UNVERIFIED'];
export const AGENT_ROLES = ['coordinator', 'researcher', 'analyst', 'reviewer', 'custom'];
export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'expired'];
export const ARTIFACT_KINDS = ['evidence', 'report', 'note'];
const list = (vals) => vals.map((v) => `'${v}'`).join(', ');
const inList = (col, vals) => sql.raw(`${col} in (${list(vals)})`);
export const users = pgTable('users', {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
}, (t) => [uniqueIndex('users_email_uq').on(t.email)]);
export const agents = pgTable('agents', {
    id: id(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    role: text('role').notNull(),
    capabilities: text('capabilities').array().notNull().default(sql `'{}'::text[]`),
    allowedTools: text('allowed_tools').array().notNull().default(sql `'{}'::text[]`),
    systemPrompt: text('system_prompt').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    uniqueIndex('agents_slug_uq').on(t.slug),
    index('agents_owner_idx').on(t.ownerId),
    check('agents_role_chk', inList('role', AGENT_ROLES)),
]);
export const tools = pgTable('tools', {
    id: id(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    sensitive: boolean('sensitive').notNull().default(false),
    external: boolean('external').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
}, (t) => [uniqueIndex('tools_name_uq').on(t.name)]);
export const tasks = pgTable('tasks', {
    id: id(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    context: text('context').notNull().default(''),
    createdAt: createdAt(),
}, (t) => [index('tasks_user_idx').on(t.userId)]);
export const executions = pgTable('executions', {
    id: id(),
    taskId: uuid('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('PENDING'),
    plan: jsonb('plan'),
    limits: jsonb('limits').notNull(),
    selectedAgents: text('selected_agents').array().notNull().default(sql `'{}'::text[]`),
    selectedTools: text('selected_tools').array().notNull().default(sql `'{}'::text[]`),
    verificationStatus: text('verification_status'),
    finalReport: jsonb('final_report'),
    error: text('error'),
    mock: boolean('mock').notNull().default(false),
    provider: text('provider').notNull().default('mock'),
    model: text('model').notNull().default(''),
    retryOf: uuid('retry_of'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('executions_user_created_idx').on(t.userId, t.createdAt),
    index('executions_status_idx').on(t.status),
    check('executions_status_chk', inList('status', EXECUTION_STATUSES)),
    check('executions_verification_chk', sql.raw(`verification_status is null or verification_status in (${list(VERIFICATION_STATUSES)})`)),
]);
export const executionSteps = pgTable('execution_steps', {
    id: id(),
    executionId: uuid('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    title: text('title').notNull(),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    agentSlug: text('agent_slug').notNull(),
    agentRole: text('agent_role').notNull(),
    capability: text('capability').notNull(),
    instruction: text('instruction').notNull(),
    dependsOn: text('depends_on').array().notNull().default(sql `'{}'::text[]`),
    status: text('status').notNull().default('PENDING'),
    attempt: integer('attempt').notNull().default(0),
    revision: integer('revision').notNull().default(0),
    output: jsonb('output'),
    toolCalls: jsonb('tool_calls').notNull().default(sql `'[]'::jsonb`),
    error: text('error'),
    skipReason: text('skip_reason'),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex('steps_exec_key_uq').on(t.executionId, t.stepKey),
    index('steps_exec_idx').on(t.executionId),
    check('steps_status_chk', inList('status', STEP_STATUSES)),
]);
export const executionEvents = pgTable('execution_events', {
    id: id(),
    executionId: uuid('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
    seq: bigserial('seq', { mode: 'number' }).notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default(sql `'{}'::jsonb`),
    createdAt: createdAt(),
}, (t) => [index('events_exec_seq_idx').on(t.executionId, t.seq)]);
export const approvalRequests = pgTable('approval_requests', {
    id: id(),
    executionId: uuid('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
    stepKey: text('step_key').notNull(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    toolName: text('tool_name').notNull(),
    arguments: jsonb('arguments').notNull(),
    reason: text('reason').notNull().default(''),
    status: text('status').notNull().default('pending'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
}, (t) => [
    index('approvals_user_status_idx').on(t.userId, t.status),
    index('approvals_exec_idx').on(t.executionId),
    check('approvals_status_chk', inList('status', APPROVAL_STATUSES)),
]);
export const executionArtifacts = pgTable('execution_artifacts', {
    id: id(),
    executionId: uuid('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
    stepKey: text('step_key'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    content: jsonb('content').notNull(),
    createdAt: createdAt(),
}, (t) => [
    index('artifacts_exec_idx').on(t.executionId),
    check('artifacts_kind_chk', inList('kind', ARTIFACT_KINDS)),
]);
export const providerUsageRecords = pgTable('provider_usage_records', {
    id: id(),
    executionId: uuid('execution_id').notNull().references(() => executions.id, { onDelete: 'cascade' }),
    stepKey: text('step_key'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    purpose: text('purpose').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: createdAt(),
}, (t) => [index('usage_exec_idx').on(t.executionId)]);
