import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, ExternalLink, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { execDuration, fmtDuration, fmtNum, fmtUsd, isActive } from '../lib/format';
import type { ExecEvent, ExecutionDetail } from '../lib/types';
import { ApprovalCard } from './ApprovalCard';
import { ReportView } from './ReportView';
import { StepPanel } from './StepPanel';
import { Timeline } from './Timeline';
import { COORDINATOR_ID, WorkflowGraph } from './WorkflowGraph';
import { Button, Card, CardHeader, Chip, ErrorBanner, MockBadge, StatusBadge } from './ui';

/** Shared live execution view: header, graph, step inspector, approvals, report, timeline. */
export function ExecutionView({ detail, events, reload, graphHeight = 420, showLink }: { detail: ExecutionDetail; events: ExecEvent[]; reload: () => void; graphHeight?: number; showLink?: boolean }) {
  const { execution: ex } = detail;
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setSelected(null); }, [ex.id]);
  const act = async (kind: 'cancel' | 'retry') => {
    setBusy(kind); setErr(null);
    try { await api.post(`/executions/${ex.id}/${kind}`); reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };
  const pending = detail.approvals.filter((a) => a.status === 'pending');
  const retryable = ['FAILED', 'CANCELLED'].includes(ex.status);
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold">{detail.task.title}</h2><StatusBadge status={ex.status} />{ex.mock && <MockBadge />}{ex.verificationStatus && <StatusBadge status={ex.verificationStatus} />}</div>
          <p className="mt-1 text-[11px] text-zinc-500">{ex.provider}{ex.model ? ` · ${ex.model}` : ''} · {fmtDuration(execDuration(ex))} · {fmtNum(ex.tokensIn + ex.tokensOut)} tokens · {fmtUsd(ex.costUsd)}{ex.retryOf ? ' · retry' : ''}</p>
        </div>
        {showLink && <Link to={`/workspace/${ex.id}`} className="text-xs text-accent hover:underline"><ExternalLink className="mr-1 inline h-3 w-3" aria-hidden />Open in workspace</Link>}
        {isActive(ex.status) || ex.status === 'AWAITING_APPROVAL' ? <Button size="sm" variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel')}><Ban className="h-3.5 w-3.5" aria-hidden />Cancel</Button> : null}
        {retryable && <Button size="sm" loading={busy === 'retry'} onClick={() => act('retry')}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Retry</Button>}
      </Card>
      {err && <ErrorBanner message={err} />}
      {ex.error && <ErrorBanner message={ex.error} />}
      {pending.map((a) => <ApprovalCard key={a.id} approval={a} onDone={reload} />)}
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card className="overflow-hidden">
          <CardHeader title="Workflow" subtitle="Click a node to inspect its tool calls, output and errors" action={<div className="flex gap-1.5"><Chip tone="accent">{ex.plan?.steps.length ?? 0} steps</Chip></div>} />
          <WorkflowGraph plan={ex.plan} steps={detail.steps} execStatus={ex.status} selectedId={selected} onSelect={setSelected} height={graphHeight} />
        </Card>
        <div style={{ minHeight: 320, maxHeight: graphHeight + 50 }}><StepPanel detail={detail} selectedId={selected ?? COORDINATOR_ID} /></div>
      </div>
      {ex.finalReport && <Card className="p-4"><ReportView report={ex.finalReport} /></Card>}
      <Card><CardHeader title="Execution timeline" subtitle={`${events.length} persisted events`} /><div className="max-h-72 overflow-auto p-3"><Timeline events={events} /></div></Card>
    </div>
  );
}
