import { AlertTriangle, CheckCircle2, CircleDot, GitBranch, Hand, Play, RefreshCw, Wrench, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ExecEvent } from '../lib/types';

function describe(e: ExecEvent): { icon: ReactNode; text: string } {
  const p = e.payload as Record<string, string | number | undefined>;
  const I = 'h-3.5 w-3.5';
  switch (e.type) {
    case 'execution.created': return { icon: <Play className={I} />, text: 'Task submitted' };
    case 'execution.status': return { icon: p.status === 'COMPLETED' ? <CheckCircle2 className={`${I} text-emerald-400`} /> : p.status === 'FAILED' ? <XCircle className={`${I} text-red-400`} /> : <CircleDot className={`${I} text-accent`} />, text: `Execution → ${p.status}${p.error ? `: ${p.error}` : ''}${p.verification ? ` (${p.verification})` : ''}` };
    case 'plan.ready': return { icon: <GitBranch className={`${I} text-violet-300`} />, text: `Plan ready (${p.steps} steps)` };
    case 'plan.retry': return { icon: <RefreshCw className={`${I} text-amber-300`} />, text: `Plan rejected, retrying: ${p.error}` };
    case 'step.status': return { icon: <CircleDot className={I} />, text: `${p.stepKey} → ${p.status}${p.reason ? ` (${p.reason})` : ''}${p.error ? `: ${p.error}` : ''}` };
    case 'step.retry': return { icon: <RefreshCw className={`${I} text-amber-300`} />, text: `${p.stepKey} retry after attempt ${p.attempt}: ${p.error}` };
    case 'step.revision': return { icon: <RefreshCw className={`${I} text-violet-300`} />, text: `${p.stepKey} revision #${p.revision} requested: ${p.request}` };
    case 'tool.call': return { icon: <Wrench className={I} />, text: `${p.stepKey} called ${p.tool} → ${p.status}` };
    case 'approval.requested': return { icon: <Hand className={`${I} text-amber-300`} />, text: `Approval requested for ${p.tool} (${p.stepKey})` };
    case 'approval.decided': return { icon: <Hand className={I} />, text: `Approval ${p.decision}` };
    default: return { icon: <AlertTriangle className={I} />, text: e.type };
  }
}

export function Timeline({ events }: { events: ExecEvent[] }) {
  if (!events.length) return <p className="px-4 py-6 text-center text-xs text-zinc-500">No events yet.</p>;
  const t0 = new Date(events[0]!.createdAt).getTime();
  return (
    <ol className="max-h-[320px] space-y-0 overflow-auto px-4 py-2" aria-label="Execution timeline">
      {events.map((e) => { const d = describe(e); return (
        <li key={e.seq} className="flex items-start gap-2.5 border-b border-line/50 py-1.5 text-xs last:border-0">
          <span className="mt-0.5 text-zinc-500">{d.icon}</span>
          <span className="min-w-0 flex-1 break-words text-zinc-300">{d.text}</span>
          <time className="shrink-0 font-mono text-[10px] text-zinc-600" dateTime={e.createdAt}>+{((new Date(e.createdAt).getTime() - t0) / 1000).toFixed(1)}s</time>
        </li>); })}
    </ol>
  );
}
