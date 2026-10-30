import { GitBranch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExecutionView } from '../components/ExecutionView';
import { Card, EmptyState, ErrorBanner, MockBadge, PageHeader, Skeleton, StatusBadge } from '../components/ui';
import { useExecution } from '../hooks/useExecution';
import { api } from '../lib/api';
import { fmtTime } from '../lib/format';
import { onUserEvents } from '../lib/socket';
import type { Execution } from '../lib/types';

export default function Explorer() {
  const { id } = useParams(); const nav = useNavigate();
  const [list, setList] = useState<Execution[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = () => api.get<{ items: Execution[] }>('/executions?pageSize=30').then((r) => { setList(r.items); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); let t: ReturnType<typeof setTimeout>; const off = onUserEvents(() => { clearTimeout(t); t = setTimeout(() => void load(), 600); }); return () => { off(); clearTimeout(t); }; }, []);
  useEffect(() => { if (!id && list?.length) nav(`/explorer/${(list.find((e) => ['RUNNING', 'VERIFYING', 'PLANNING'].includes(e.status)) ?? list[0]!).id}`, { replace: true }); }, [id, list, nav]);
  const { detail, events, error, reload } = useExecution(id);
  return (
    <>
      <PageHeader title="Workflow Explorer" description="Inspect plans, dependencies, branching and live state" />
      {err && <ErrorBanner message={err} onRetry={load} />}
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <Card className="max-h-[calc(100vh-10rem)] overflow-auto p-1.5">
          {!list ? <Skeleton className="m-2 h-32" /> : list.length === 0 ? <EmptyState icon={<GitBranch className="h-5 w-5" />} title="No executions" description="Run a task to explore its workflow." /> : (
            <ul>{list.map((e) => (<li key={e.id}><button onClick={() => nav(`/explorer/${e.id}`)} aria-current={e.id === id} className={`w-full rounded-lg px-2.5 py-2 text-left hover:bg-white/5 ${e.id === id ? 'bg-accent/10' : ''}`}>
              <p className="truncate text-xs text-zinc-100">{e.taskTitle ?? 'Task'}</p><div className="mt-1 flex items-center gap-1.5"><StatusBadge status={e.status} />{e.mock && <MockBadge />}</div><p className="mt-1 text-[10px] text-zinc-600">{fmtTime(e.createdAt)}</p></button></li>))}</ul>
          )}
        </Card>
        <div className="min-w-0">
          {error && !detail ? <ErrorBanner message={error} onRetry={reload} /> : !id ? null : !detail ? <Skeleton className="h-96" /> : <ExecutionView detail={detail} events={events} reload={reload} graphHeight={460} showLink />}
        </div>
      </div>
    </>
  );
}
