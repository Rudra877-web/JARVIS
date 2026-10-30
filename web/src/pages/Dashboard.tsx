import { Flame, Play, Plus, Radio, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArcReactor } from '../components/jarvis/ArcReactor';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorBanner,
  MockBadge,
  PageHeader,
  Skeleton,
  Stat,
  StatusBadge,
} from '../components/ui';
import { api } from '../lib/api';
import { execDuration, fmtDuration, fmtNum, fmtTime, fmtUsd } from '../lib/format';
import { jarvisSound } from '../lib/sound';
import { onUserEvents } from '../lib/socket';
import type { Agent, Execution } from '../lib/types';

interface Dash {
  byStatus: Record<string, number>;
  totals: { tokensIn: number; tokensOut: number; cost: number; avgDurationMs: number };
  agents:
    | (Agent['stats'] & { slug: string }[])
    | { slug: string; runs: number; completed: number; failed: number; avgMs: number }[];
  recent: Execution[];
}

export default function Dashboard() {
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  const load = () =>
    api
      .get<Dash>('/dashboard')
      .then((r) => {
        setD(r);
        setErr(null);
      })
      .catch((e) => setErr(e.message));

  useEffect(() => {
    void load();
    let t: ReturnType<typeof setTimeout>;
    const off = onUserEvents(() => {
      clearTimeout(t);
      t = setTimeout(() => void load(), 500);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, []);

  const s = d?.byStatus ?? {};
  const active =
    (s.PENDING ?? 0) +
    (s.PLANNING ?? 0) +
    (s.RUNNING ?? 0) +
    (s.VERIFYING ?? 0) +
    (s.AWAITING_APPROVAL ?? 0);
  const agents = (d?.agents ?? []) as {
    slug: string;
    runs: number;
    completed: number;
    failed: number;
    avgMs: number;
  }[];

  const reactorStatus = active > 0 ? (s.AWAITING_APPROVAL ? 'AWAITING_APPROVAL' : 'RUNNING') : (s.FAILED ? 'FAILED' : 'COMPLETED');

  return (
    <>
      <PageHeader
        title="Tactical Command Overview"
        description="Telemetry feed & multi-agent neural dispatch matrix"
        actions={
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                jarvisSound.playChirp();
                nav('/workspace');
              }}
            >
              <Plus className="h-4 w-4" aria-hidden />
              DISPATCH TASK
            </Button>
          </div>
        }
      />

      {err && <ErrorBanner message={err} onRetry={load} />}

      {/* Top Holographic Arc Reactor Banner & Core Telemetry */}
      <Card className="mb-4 overflow-hidden p-5">
        <div className="grid gap-6 lg:grid-cols-[auto_1fr] items-center">
          {/* Centered Holographic Arc Reactor */}
          <div className="flex flex-col items-center justify-center p-2 border-b lg:border-b-0 lg:border-r border-cyan-900/40 lg:pr-8">
            <ArcReactor
              size="md"
              status={reactorStatus}
              interactive={true}
              showTelemetry={true}
            />
          </div>

          {/* Core Telemetry Stats Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-cyan-900/40 pb-2">
              <span className="font-mono text-xs font-semibold text-cyan-200 tracking-wider flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
                NEURAL COORDINATOR STATUS: {active > 0 ? 'PROCESSING PIPELINE' : 'MONITORING STANDBY'}
              </span>
              <span className="font-mono text-[10px] text-cyan-500 uppercase">
                SECURITY: ENCRYPTED // 256-BIT
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-cyan-950 bg-black/40 p-3 font-mono">
                <p className="text-[10px] text-cyan-600 uppercase">Active Threads</p>
                <p className="mt-1 text-xl font-bold text-cyan-300">{active}</p>
                <p className="text-[10px] text-cyan-700 mt-0.5">In flight / review</p>
              </div>

              <div className="rounded-lg border border-cyan-950 bg-black/40 p-3 font-mono">
                <p className="text-[10px] text-cyan-600 uppercase">Successful Runs</p>
                <p className="mt-1 text-xl font-bold text-emerald-400">{s.COMPLETED ?? 0}</p>
                <p className="text-[10px] text-cyan-700 mt-0.5">Verified outputs</p>
              </div>

              <div className="rounded-lg border border-cyan-950 bg-black/40 p-3 font-mono">
                <p className="text-[10px] text-cyan-600 uppercase">Anomalies</p>
                <p className="mt-1 text-xl font-bold text-red-400">{s.FAILED ?? 0}</p>
                <p className="text-[10px] text-cyan-700 mt-0.5">{s.CANCELLED ?? 0} cancelled</p>
              </div>

              <div className="rounded-lg border border-cyan-950 bg-black/40 p-3 font-mono">
                <p className="text-[10px] text-cyan-600 uppercase">Quantum Tokens</p>
                <p className="mt-1 text-xl font-bold text-cyan-200">
                  {d ? fmtNum(d.totals.tokensIn + d.totals.tokensOut) : '0'}
                </p>
                <p className="text-[10px] text-cyan-700 mt-0.5">{d ? fmtUsd(d.totals.cost) : '$0.00'}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Grid: Recent Executions & Agent Telemetry */}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Recent Executions Panel */}
        <Card>
          <CardHeader
            title="EXECUTION TIMELINE"
            subtitle="Live orchestrations & autonomous runs"
            action={
              <Link
                to="/history"
                className="font-mono text-xs text-cyan-400 hover:text-cyan-200 hover:underline"
              >
                VIEW FULL ARCHIVE &gt;&gt;
              </Link>
            }
          />
          {!d ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          ) : d.recent.length === 0 ? (
            <EmptyState
              title="NO EXECUTIONS RECORDED"
              description="Dispatch your first instruction to initiate coordinator planning."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    jarvisSound.playChirp();
                    nav('/workspace');
                  }}
                >
                  DISPATCH TASK
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-cyan-950/60">
              {d.recent.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/workspace/${e.id}`}
                    onClick={() => jarvisSound.playClick()}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-cyan-950/25 transition-colors group"
                  >
                    <div className="min-w-0 flex-1 font-mono">
                      <p className="truncate text-xs font-semibold text-cyan-100 group-hover:text-cyan-300">
                        {e.taskTitle ?? 'Autonomous Task'}
                      </p>
                      <p className="text-[10px] text-cyan-600 mt-0.5">
                        {fmtTime(e.createdAt)} · {fmtDuration(execDuration(e))}
                      </p>
                    </div>
                    {e.mock && <MockBadge />}
                    <StatusBadge status={e.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Agent Activity Telemetry */}
        <Card>
          <CardHeader
            title="AGENT FLUX CAPACITY"
            subtitle="Step throughput per cognitive worker"
          />
          {!d ? (
            <div className="p-4">
              <Skeleton className="h-24" />
            </div>
          ) : agents.filter((a) => a.runs > 0).length === 0 ? (
            <EmptyState
              title="NO AGENT METRICS"
              description="Telemetry will materialize upon execution dispatch."
            />
          ) : (
            <ul className="space-y-4 p-4 font-mono text-xs">
              {agents
                .filter((a) => a.runs > 0)
                .map((a) => (
                  <li key={a.slug} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-cyan-200 uppercase">{a.slug}</span>
                      <span className="text-cyan-500 text-[11px]">
                        {a.runs} RUNS · {fmtDuration(a.avgMs || null)}
                      </span>
                    </div>
                    {/* Glowing Flux Meter Bar */}
                    <div
                      className="flex h-2 overflow-hidden rounded bg-black border border-cyan-950"
                      role="img"
                      aria-label={`${a.completed} completed, ${a.failed} failed of ${a.runs}`}
                    >
                      <div
                        className="bg-cyan-400 shadow-[0_0_8px_#00f2fe]"
                        style={{ width: `${(a.completed / a.runs) * 100}%` }}
                      />
                      <div
                        className="bg-red-500/80 shadow-[0_0_8px_#ef4444]"
                        style={{ width: `${(a.failed / a.runs) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
