import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import type { Approval } from '../lib/types';
import { Button, Card } from './ui';

export function ApprovalCard({ approval, onDone }: { approval: Approval; onDone: () => void }) {
  const [busy, setBusy] = useState<'approved' | 'rejected' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const decide = async (decision: 'approved' | 'rejected') => {
    setBusy(decision); setErr(null);
    try { await api.post(`/approvals/${approval.id}/decision`, { decision }); onDone(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  };
  return (
    <Card className="border-amber-500/40 bg-amber-500/5 p-3" role="alert">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-medium text-amber-100">Approval required: <span className="font-mono">{approval.toolName}</span> <span className="text-amber-200/60">(step {approval.stepKey})</span></p>
          <p className="text-[11px] text-amber-100/70">{approval.reason}</p>
          <pre className="max-h-28 overflow-auto rounded-md bg-ink-900 p-2 font-mono text-[10px] text-zinc-300">{JSON.stringify(approval.arguments, null, 2)}</pre>
          {err && <p role="alert" className="text-[11px] text-red-300">{err}</p>}
          <div className="flex gap-2 pt-0.5"><Button size="sm" variant="primary" loading={busy === 'approved'} disabled={!!busy} onClick={() => decide('approved')}>Approve call</Button><Button size="sm" variant="danger" loading={busy === 'rejected'} disabled={!!busy} onClick={() => decide('rejected')}>Reject</Button></div>
        </div>
      </div>
    </Card>
  );
}
