import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Card, CardHeader, Chip, ErrorBanner, MockBadge, PageHeader, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { fmtNum, fmtUsd } from '../lib/format';
import type { Limits } from '../lib/types';

interface S {
  provider: { name: string; model: string; mock: boolean; configured: boolean }; defaultLimits: Limits;
  policies: { maxParallelSteps: number; approvalTimeoutMs: number; maxRetryChain: number; maxConcurrentExecutionsPerUser: number; rateLimitPerMinute: number };
  integrations: { fetchAllowedHosts: string[] }; cost: { per1kInputUsd: number; per1kOutputUsd: number; totals: { tokensIn: number; tokensOut: number; cost: number } }; health: { api: string; database: string };
}
const Row = ({ k, children }: { k: string; children: ReactNode }) => <div className="flex items-center justify-between gap-4 border-b border-line/60 py-2 text-xs last:border-0"><dt className="text-zinc-500">{k}</dt><dd className="text-right text-zinc-200">{children}</dd></div>;
const Health = ({ ok }: { ok: boolean }) => ok ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />ok</span> : <span className="inline-flex items-center gap-1 text-red-300"><XCircle className="h-3.5 w-3.5" aria-hidden />down</span>;

export default function Settings() {
  const [s, setS] = useState<S | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = () => api.get<S>('/settings').then((r) => { setS(r); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, []);
  return (
    <>
      <PageHeader title="Settings" description="Read-only view of the server configuration. Secrets never leave the server; change values via environment variables." />
      {err && <ErrorBanner message={err} onRetry={load} />}
      {!s ? <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-48" />)}</div> : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card><CardHeader title="LLM provider" action={s.provider.mock ? <MockBadge /> : undefined} /><dl className="px-4 py-2">
            <Row k="Provider"><span className="font-mono">{s.provider.name}</span></Row><Row k="Model"><span className="font-mono">{s.provider.model || '—'}</span></Row>
            <Row k="API key">{s.provider.mock ? <Chip tone="warn">not used (mock mode)</Chip> : s.provider.configured ? <Chip tone="accent">configured (server-side)</Chip> : <Chip tone="warn">missing</Chip>}</Row></dl>
            {s.provider.mock && <p className="px-4 pb-3 text-[11px] text-amber-200/80">Mock mode produces deterministic template results. Set LLM_PROVIDER=openai or anthropic with a key for real execution.</p>}</Card>
          <Card><CardHeader title="API health" /><dl className="px-4 py-2"><Row k="API"><Health ok={s.health.api === 'ok'} /></Row><Row k="PostgreSQL"><Health ok={s.health.database === 'ok'} /></Row></dl></Card>
          <Card><CardHeader title="Default execution limits" subtitle="Overridable per task within server bounds" /><dl className="px-4 py-2">
            <Row k="Max plan steps">{s.defaultLimits.maxPlanSteps}</Row><Row k="Retries per step">{s.defaultLimits.maxRetries}</Row><Row k="Reviewer revisions">{s.defaultLimits.maxRevisions}</Row><Row k="Tool calls per step">{s.defaultLimits.maxToolCallsPerStep}</Row><Row k="Step timeout">{s.defaultLimits.stepTimeoutMs} ms</Row><Row k="Max turns">{s.defaultLimits.maxTurns}</Row><Row k="Token budget">{fmtNum(s.defaultLimits.maxTokens)}</Row></dl></Card>
          <Card><CardHeader title="Policies" /><dl className="px-4 py-2">
            <Row k="Parallel steps">{s.policies.maxParallelSteps}</Row><Row k="Concurrent executions / user">{s.policies.maxConcurrentExecutionsPerUser}</Row><Row k="Retry chain limit">{s.policies.maxRetryChain}</Row><Row k="Approval timeout">{Math.round(s.policies.approvalTimeoutMs / 1000)} s</Row><Row k="Rate limit">{s.policies.rateLimitPerMinute} req/min</Row></dl></Card>
          <Card><CardHeader title="Usage & cost" /><dl className="px-4 py-2">
            <Row k="Tokens (in / out)">{fmtNum(s.cost.totals.tokensIn)} / {fmtNum(s.cost.totals.tokensOut)}</Row><Row k="Estimated cost">{fmtUsd(s.cost.totals.cost)}</Row>
            <Row k="Price per 1K in / out">${s.cost.per1kInputUsd} / ${s.cost.per1kOutputUsd}</Row></dl>
            {s.cost.per1kInputUsd === 0 && s.cost.per1kOutputUsd === 0 && <p className="px-4 pb-3 text-[11px] text-zinc-500">Set COST_PER_1K_INPUT_USD / COST_PER_1K_OUTPUT_USD to enable cost estimates.</p>}</Card>
          <Card><CardHeader title="Integrations" subtitle="http_fetch tool allow-list" /><div className="flex flex-wrap gap-1.5 p-4">{s.integrations.fetchAllowedHosts.length ? s.integrations.fetchAllowedHosts.map((h) => <Chip key={h}>{h}</Chip>) : <p className="text-xs text-zinc-500">No hosts allowed — external fetches are denied by default.</p>}</div></Card>
        </div>
      )}
    </>
  );
}
