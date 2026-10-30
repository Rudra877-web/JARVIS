export const fmtDuration = (ms: number | null | undefined) => {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
};
export const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
export const fmtNum = (n: number) => new Intl.NumberFormat().format(n);
export const fmtUsd = (n: number) => (n === 0 ? '$0' : n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);
export const execDuration = (e: { startedAt: string | null; finishedAt: string | null }) =>
  e.startedAt ? (e.finishedAt ? new Date(e.finishedAt).getTime() : Date.now()) - new Date(e.startedAt).getTime() : null;
export const isActive = (s: string) => ['PENDING', 'PLANNING', 'RUNNING', 'VERIFYING'].includes(s);
export const isTerminal = (s: string) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(s);
