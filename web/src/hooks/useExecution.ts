import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { isTerminal } from '../lib/format';
import { watchExecution } from '../lib/socket';
import type { ExecEvent, ExecutionDetail } from '../lib/types';

/** Loads an execution and keeps it live: Socket.IO events trigger a debounced re-fetch (DB is the source of truth); a slow poll is the safety net. */
export function useExecution(id: string | undefined) {
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [events, setEvents] = useState<ExecEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const lastSeq = useRef(0);

  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const [d, ev] = await Promise.all([api.get<ExecutionDetail>(`/executions/${id}`), api.get<{ events: ExecEvent[] }>(`/executions/${id}/events?afterSeq=${lastSeq.current}`)]);
      setDetail(d); setError(null);
      if (ev.events.length) {
        lastSeq.current = Math.max(lastSeq.current, ...ev.events.map((e) => e.seq));
        setEvents((prev) => { const seen = new Set(prev.map((e) => e.seq)); return [...prev, ...ev.events.filter((e) => !seen.has(e.seq))].sort((a, b) => a.seq - b.seq); });
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load execution'); }
  }, [id]);

  useEffect(() => {
    setDetail(null); setEvents([]); setError(null); lastSeq.current = 0;
    if (!id) return;
    setLoading(true);
    void reload().finally(() => setLoading(false));
    const schedule = () => { clearTimeout(timer.current); timer.current = setTimeout(() => void reload(), 200); };
    const off = watchExecution(id, schedule, schedule);
    return () => { off(); clearTimeout(timer.current); };
  }, [id, reload]);

  const status = detail?.execution.status;
  useEffect(() => {
    if (!id || !status || isTerminal(status)) return;
    const h = setInterval(() => void reload(), 5000);
    return () => clearInterval(h);
  }, [id, status, reload]);

  return { detail, events, error, loading, reload };
}
