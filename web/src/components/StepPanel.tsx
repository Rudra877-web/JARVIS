import { AlertTriangle, ChevronDown, ChevronRight, Clock, Cpu, Network, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { fmtDuration, fmtNum, fmtTime } from '../lib/format';
import type { ExecutionDetail, Step } from '../lib/types';
import { COORDINATOR_ID } from './WorkflowGraph';
import { Card, Chip, StatusBadge, cx } from './ui';
import { ReportView } from './ReportView';

const SEV: Record<string, string> = { critical: 'text-red-300 border-red-500/40 bg-red-500/10', high: 'text-red-300 border-red-500/30 bg-red-500/10', medium: 'text-amber-300 border-amber-500/30 bg-amber-500/10', low: 'text-sky-300 border-sky-500/30 bg-sky-500/10', info: 'text-zinc-400 border-line' };
const TOOL_TONE: Record<string, string> = { ok: 'text-emerald-300', error: 'text-red-300', denied: 'text-red-300', rejected: 'text-amber-300', invalid: 'text-amber-300' };

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon?: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-line first:border-t-0">
      <button className="flex w-full items-center gap-1.5 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}{icon}{title}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function OutputView({ output }: { output: Record<string, unknown> }) {
  const facts = output.facts as { claim: string; source: string }[] | undefined;
  const assumptions = output.assumptions as string[] | undefined;
  const findings = output.findings as { title: string; severity: string; reasoning: string; evidence?: string }[] | undefined;
  const verdicts = output.verdicts as { stepId: string; verdict: string; reasoning: string; revisionRequest?: string }[] | undefined;
  return (
    <div className="space-y-2.5 text-xs">
      <p className="text-zinc-200">{String(output.summary ?? '')}</p>
      {facts && <div><p className="mb-1 text-[11px] font-medium text-emerald-300">Retrieved facts ({facts.length})</p><ul className="space-y-1">{facts.map((f, i) => <li key={i} className="rounded-md bg-ink-900 p-2"><p>{f.claim}</p><p className="mt-0.5 font-mono text-[10px] text-zinc-500">source: {f.source}</p></li>)}</ul></div>}
      {assumptions && assumptions.length > 0 && <div><p className="mb-1 text-[11px] font-medium text-amber-300">Assumptions (not verified)</p><ul className="list-inside list-disc space-y-0.5 text-zinc-400">{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
      {findings && <div><p className="mb-1 text-[11px] font-medium text-zinc-400">Findings ({findings.length})</p><ul className="space-y-1">{findings.map((f, i) => <li key={i} className="rounded-md bg-ink-900 p-2"><div className="flex items-center gap-2"><span className={cx('rounded border px-1 py-px text-[10px] uppercase', SEV[f.severity])}>{f.severity}</span><span className="font-medium">{f.title}</span></div><p className="mt-1 text-zinc-400">{f.reasoning}</p>{f.evidence && <p className="mt-1 font-mono text-[10px] text-zinc-500">{f.evidence}</p>}</li>)}</ul></div>}
      {verdicts && <div><p className="mb-1 text-[11px] font-medium text-zinc-400">Verdicts</p><ul className="space-y-1">{verdicts.map((v, i) => <li key={i} className="rounded-md bg-ink-900 p-2"><div className="flex items-center gap-2"><Chip>{v.stepId}</Chip><StatusBadge status={v.verdict === 'verified' ? 'VERIFIED' : v.verdict === 'rejected' ? 'REJECTED' : 'NEEDS_HUMAN_REVIEW'} /></div><p className="mt-1 text-zinc-400">{v.reasoning}</p>{v.revisionRequest && <p className="mt-1 text-amber-300/90">Revision requested: {v.revisionRequest}</p>}</li>)}</ul></div>}
      <details className="text-[11px] text-zinc-500"><summary className="cursor-pointer hover:text-zinc-300">Raw JSON</summary><pre className="mt-1 max-h-60 overflow-auto rounded-md bg-ink-900 p-2 font-mono text-[10px]">{JSON.stringify(output, null, 2)}</pre></details>
    </div>
  );
}

function StepDetails({ step, detail }: { step: Step; detail: ExecutionDetail }) {
  const approvals = detail.approvals.filter((a) => a.stepKey === step.stepKey);
  return (
    <>
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={step.status} /><Chip tone="accent">{step.agentSlug}</Chip><Chip>{step.capability}</Chip>{step.attempt > 1 && <Chip tone="warn">attempt {step.attempt}</Chip>}{step.revision > 0 && <Chip tone="violet">revision {step.revision}</Chip>}</div>
        <p className="text-xs text-zinc-400">{step.instruction}</p>
        {step.dependsOn.length > 0 && <p className="text-[11px] text-zinc-500">Depends on: {step.dependsOn.map((d) => <Chip key={d}>{d}</Chip>)}</p>}
        <dl className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
          <div><dt className="flex items-center gap-1 text-zinc-500"><Clock className="h-3 w-3" />Duration</dt><dd className="tabular-nums text-zinc-200">{fmtDuration(step.durationMs)}</dd></div>
          <div><dt className="flex items-center gap-1 text-zinc-500"><Cpu className="h-3 w-3" />Tokens</dt><dd className="tabular-nums text-zinc-200">{fmtNum(step.tokensIn + step.tokensOut)}</dd></div>
          <div><dt className="text-zinc-500">Started</dt><dd className="text-zinc-200">{fmtTime(step.startedAt)}</dd></div>
        </dl>
      </div>
      {step.skipReason && <Section title="Skipped"><p className="text-xs text-zinc-400">{step.skipReason}</p></Section>}
      {step.error && <Section title="Error" icon={<AlertTriangle className="h-3 w-3 text-red-400" />}><pre className="whitespace-pre-wrap rounded-md border border-red-500/20 bg-red-500/5 p-2 font-mono text-[11px] text-red-300">{step.error}</pre></Section>}
      <Section title={`Tool calls (${step.toolCalls.length})`} icon={<Wrench className="h-3 w-3" />}>
        {step.toolCalls.length === 0 ? <p className="text-xs text-zinc-500">No tools were called.</p> : (
          <ul className="space-y-1.5">{step.toolCalls.map((c, i) => (
            <li key={i} className="rounded-md bg-ink-900 p-2 text-xs">
              <div className="flex items-center justify-between"><span className="font-mono text-zinc-200">{c.tool}</span><span className={cx('text-[10px] uppercase', TOOL_TONE[c.status])}>{c.status} · {fmtDuration(c.durationMs)}</span></div>
              <p className="mt-1 break-all font-mono text-[10px] text-zinc-500">args: {typeof c.args === 'string' ? c.args : JSON.stringify(c.args)}</p>
              <p className="mt-1 line-clamp-3 break-all text-[11px] text-zinc-400">{c.resultSummary}</p>
            </li>))}
          </ul>)}
        {approvals.length > 0 && <p className="mt-2 text-[11px] text-zinc-500">Approvals: {approvals.map((a) => `${a.toolName} → ${a.status}`).join(', ')}</p>}
      </Section>
      {step.output && <Section title="Output"><OutputView output={step.output} /></Section>}
    </>
  );
}

export function StepPanel({ detail, selectedId, onClose }: { detail: ExecutionDetail | null; selectedId: string | null; onClose?: () => void }) {
  if (!detail) return <Card className="grid h-full place-items-center p-6 text-xs text-zinc-500">Select an execution to inspect.</Card>;
  const { execution } = detail;
  const step = selectedId && selectedId !== COORDINATOR_ID ? detail.steps.find((s) => s.stepKey === selectedId) : undefined;
  const planStep = selectedId ? execution.plan?.steps.find((s) => s.id === selectedId) : undefined;
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {selectedId === COORDINATOR_ID || !selectedId ? <Network className="h-4 w-4 text-violet-300" /> : null}
          <h2 className="truncate text-[13px] font-medium">{selectedId === COORDINATOR_ID || !selectedId ? 'Coordinator' : (planStep?.title ?? selectedId)}</h2>
        </div>
        {onClose && selectedId && <button onClick={onClose} className="text-[11px] text-zinc-500 hover:text-zinc-200">Clear</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {step ? <StepDetails step={step} detail={detail} /> : planStep && !step ? (
          <div className="space-y-2 px-4 py-3 text-xs"><StatusBadge status="PENDING" /><p className="text-zinc-400">{planStep.instruction}</p><p className="text-zinc-500">Routed by capability <Chip>{planStep.capability}</Chip> to <Chip tone="accent">{planStep.agent}</Chip>. Not started yet.</p></div>
        ) : (
          <div className="space-y-3 px-4 py-3 text-xs">
            <div className="flex items-center gap-2"><StatusBadge status={execution.status} />{execution.verificationStatus && <StatusBadge status={execution.verificationStatus} />}</div>
            {execution.plan && <div><p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-zinc-500">Plan</p><p className="text-zinc-300">{execution.plan.summary}</p></div>}
            {execution.error && <pre className="whitespace-pre-wrap rounded-md border border-red-500/20 bg-red-500/5 p-2 font-mono text-[11px] text-red-300">{execution.error}</pre>}
            {execution.finalReport && <ReportView report={execution.finalReport} compact />}
            <dl className="grid grid-cols-2 gap-2 border-t border-line pt-3 text-[11px]">
              <div><dt className="text-zinc-500">Provider</dt><dd>{execution.provider} {execution.model && `· ${execution.model}`}</dd></div>
              <div><dt className="text-zinc-500">Tokens in/out</dt><dd className="tabular-nums">{fmtNum(execution.tokensIn)} / {fmtNum(execution.tokensOut)}</dd></div>
            </dl>
            <p className="text-[11px] text-zinc-600">Click a node to inspect an agent step.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
