import { ShieldCheck } from 'lucide-react';
import type { FinalReport } from '../lib/types';
import { Chip, StatusBadge, MockBadge } from './ui';

export function ReportView({ report, compact }: { report: FinalReport; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-100">{report.title}</h3>
        <StatusBadge status={report.verification.status} />
        {report.mock && <MockBadge />}
      </div>
      <p className="text-xs leading-relaxed text-zinc-300">{report.summary}</p>
      {!compact && report.sections.map((s, i) => (
        <section key={i}><h4 className="mb-1 text-xs font-medium text-zinc-200">{s.heading}</h4><p className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{s.body}</p></section>
      ))}
      {report.openIssues.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-amber-300">Open issues</p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-100/80">{report.openIssues.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </div>
      )}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500"><ShieldCheck className="h-3 w-3" />Verification (computed from reviewer verdicts)</p>
        <div className="flex flex-wrap gap-1.5">{report.verification.verdicts.map((v) => <Chip key={v.stepId} tone={v.verdict === 'verified' ? 'accent' : 'warn'}>{v.stepId}: {v.verdict.replaceAll('_', ' ')}</Chip>)}</div>
      </div>
    </div>
  );
}
