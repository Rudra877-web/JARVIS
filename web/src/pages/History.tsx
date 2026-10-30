import { History as HistoryIcon, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, EmptyState, ErrorBanner, Input, MockBadge, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { execDuration, fmtDuration, fmtNum, fmtTime } from '../lib/format';
import type { Agent, Execution } from '../lib/types';

const STATUSES = ['PENDING', 'PLANNING', 'AWAITING_APPROVAL', 'RUNNING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED'];

export default function History() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [agent, setAgent] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [page, setPage] = useState(1); const pageSize = 15;
  const [data, setData] = useState<{ items: Execution[]; total: number } | null>(null); const [agents, setAgents] = useState<Agent[]>([]);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api.get<{ agents: Agent[] }>('/agents').then((r) => setAgents(r.agents)).catch(() => undefined); }, []);
  const load = () => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q.trim()) p.set('q', q.trim()); if (status) p.set('status', status); if (agent) p.set('agent', agent);
    if (from) p.set('from', new Date(from).toISOString()); if (to) p.set('to', new Date(`${to}T23:59:59`).toISOString());
    return api.get<{ items: Execution[]; total: number }>(`/executions?${p}`).then((r) => { setData(r); setErr(null); }).catch((e) => setErr(e.message));
  };
  useEffect(() => { const t = setTimeout(() => void load(), 250); return () => clearTimeout(t); }, [q, status, agent, from, to, page]);
  useEffect(() => { setPage(1); }, [q, status, agent, from, to]);
  const retry = async (id: string) => { setBusy(id); try { await api.post(`/executions/${id}/retry`); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Retry failed'); } finally { setBusy(null); } };
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const sel = 'h-9 rounded-lg border border-line bg-ink-900 px-2.5 text-xs text-zinc-200 focus:border-accent focus:outline-none';
  return (
    <>
      <PageHeader title="Execution History" description="Search and inspect every run, plan, tool call and error" />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <div className="relative min-w-[200px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-600" aria-hidden /><Input aria-label="Search executions" placeholder="Search by task title…" className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Agent" className={sel} value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">All agents</option>{agents.map((a) => <option key={a.slug} value={a.slug}>{a.name}</option>)}</select>
        <input aria-label="From date" type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="To date" type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
      </Card>
      {err && <div className="mb-3"><ErrorBanner message={err} onRetry={load} /></div>}
      <Card className="overflow-hidden">
        {!data ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9" />)}</div> : data.items.length === 0 ? <EmptyState icon={<HistoryIcon className="h-5 w-5" />} title="No executions match" description="Adjust the filters or submit a new task." /> : (
          <div className="overflow-x-auto"><table className="w-full text-left text-xs">
            <thead className="border-b border-line text-[11px] uppercase tracking-wider text-zinc-500"><tr><th className="px-4 py-2.5 font-medium">Task</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Started</th><th className="px-3 font-medium">Duration</th><th className="px-3 font-medium">Tokens</th><th className="px-3" /></tr></thead>
            <tbody className="divide-y divide-line">{data.items.map((e) => (
              <tr key={e.id} className="hover:bg-white/[0.03]">
                <td className="max-w-[320px] px-4 py-2.5"><Link to={`/workspace/${e.id}`} className="block truncate text-[13px] text-zinc-100 hover:text-accent">{e.taskTitle ?? 'Task'}</Link>{e.error && <p className="truncate text-[11px] text-red-300/80">{e.error}</p>}</td>
                <td className="px-3"><span className="flex items-center gap-1.5"><StatusBadge status={e.status} />{e.mock && <MockBadge />}</span></td>
                <td className="px-3 text-zinc-400">{fmtTime(e.startedAt ?? e.createdAt)}</td><td className="px-3 text-zinc-400">{fmtDuration(execDuration(e))}</td><td className="px-3 tabular-nums text-zinc-400">{fmtNum(e.tokensIn + e.tokensOut)}</td>
                <td className="px-3 text-right">{['FAILED', 'CANCELLED'].includes(e.status) && <Button size="sm" loading={busy === e.id} onClick={() => retry(e.id)}><RotateCcw className="h-3 w-3" aria-hidden />Retry</Button>}</td>
              </tr>))}</tbody></table></div>
        )}
        {data && data.total > 0 && <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-zinc-500"><span>{data.total} total</span><div className="flex items-center gap-2"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page} / {pages}</span><Button size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div></div>}
      </Card>
    </>
  );
}
