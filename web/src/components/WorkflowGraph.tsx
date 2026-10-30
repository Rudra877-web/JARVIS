import { Background, BackgroundVariant, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Bot, Eye, FlaskConical, Network, Search, ShieldQuestion, Microscope, Loader2, CheckCircle2, XCircle, MinusCircle, CircleDashed, Ban } from 'lucide-react';
import { memo, useMemo } from 'react';
import { fmtDuration } from '../lib/format';
import type { Plan, Step, StepStatus } from '../lib/types';
import { cx } from './ui';

export const COORDINATOR_ID = '__coordinator';
const ROLE_ICON: Record<string, typeof Bot> = { coordinator: Network, researcher: Search, analyst: Microscope, reviewer: Eye, custom: Bot };
const BORDER: Record<string, string> = {
  PENDING: 'border-line', RUNNING: 'border-accent shadow-[0_0_0_1px_#4f8cff55]', AWAITING_APPROVAL: 'border-amber-400 shadow-[0_0_0_1px_#fbbf2455]',
  COMPLETED: 'border-emerald-500/50', FAILED: 'border-red-500/60', SKIPPED: 'border-dashed border-zinc-600', CANCELLED: 'border-zinc-600',
};
const STATUS_ICON: Record<string, JSX.Element> = {
  PENDING: <CircleDashed className="h-3.5 w-3.5 text-zinc-500" />, RUNNING: <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />,
  AWAITING_APPROVAL: <ShieldQuestion className="h-3.5 w-3.5 text-amber-300" />, COMPLETED: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  FAILED: <XCircle className="h-3.5 w-3.5 text-red-400" />, SKIPPED: <MinusCircle className="h-3.5 w-3.5 text-zinc-500" />, CANCELLED: <Ban className="h-3.5 w-3.5 text-zinc-500" />,
};

interface NodeData extends Record<string, unknown> { title: string; agent: string; role: string; status: string; duration: number | null; retries: number; selected: boolean }

const AgentNode = memo(function AgentNode({ data }: NodeProps<Node<NodeData>>) {
  const Icon = ROLE_ICON[data.role] ?? Bot;
  return (
    <div role="button" aria-label={`${data.title}, ${data.status}`} className={cx('w-[210px] rounded-xl border bg-ink-700 px-3 py-2.5 text-left transition-shadow', BORDER[data.status] ?? 'border-line', data.selected && 'ring-2 ring-violet', data.status === 'SKIPPED' && 'opacity-60')}>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-zinc-600" />
      <div className="flex items-center gap-2">
        <div className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-md', data.role === 'coordinator' ? 'bg-violet/20 text-violet-300' : 'bg-accent/15 text-accent')}><Icon className="h-3.5 w-3.5" aria-hidden /></div>
        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-zinc-100">{data.title}</p><p className="truncate text-[10px] text-zinc-500">{data.agent}</p></div>
        {STATUS_ICON[data.status]}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-500">
        <span>{data.status.replace('_', ' ')}</span>
        <span className="tabular-nums">{data.retries > 1 && <span className="mr-1.5 text-amber-400">×{data.retries}</span>}{data.duration != null ? fmtDuration(data.duration) : ''}</span>
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-zinc-600" />
    </div>
  );
});
const nodeTypes = { agent: AgentNode };

export function layoutPlan(plan: Plan) {
  const level = new Map<string, number>();
  const calc = (id: string): number => {
    if (level.has(id)) return level.get(id)!;
    const s = plan.steps.find((x) => x.id === id)!;
    const l = s.dependsOn.length ? 1 + Math.max(...s.dependsOn.map(calc)) : 0;
    level.set(id, l); return l;
  };
  plan.steps.forEach((s) => calc(s.id));
  const cols = new Map<number, string[]>();
  plan.steps.forEach((s) => { const l = level.get(s.id)!; cols.set(l, [...(cols.get(l) ?? []), s.id]); });
  const maxRows = Math.max(...[...cols.values()].map((c) => c.length));
  const pos = new Map<string, { x: number; y: number }>();
  for (const [l, ids] of cols) ids.forEach((id, i) => pos.set(id, { x: (l + 1) * 290, y: (i + (maxRows - ids.length) / 2) * 110 }));
  return { pos, maxRows };
}

export function WorkflowGraph({ plan, steps, execStatus, selectedId, onSelect, height = 480 }: {
  plan: Plan | null; steps: Step[]; execStatus: string; selectedId: string | null; onSelect: (id: string) => void; height?: number;
}) {
  const { nodes, edges } = useMemo(() => {
    if (!plan) return { nodes: [] as Node<NodeData>[], edges: [] as Edge[] };
    const byKey = new Map(steps.map((s) => [s.stepKey, s]));
    const { pos, maxRows } = layoutPlan(plan);
    const status = (id: string): StepStatus => byKey.get(id)?.status ?? 'PENDING';
    const coordStatus = execStatus === 'PLANNING' ? 'RUNNING' : execStatus === 'VERIFYING' ? 'RUNNING' : ['AWAITING_APPROVAL', 'RUNNING'].includes(execStatus) ? 'COMPLETED' : execStatus === 'COMPLETED' ? 'COMPLETED' : execStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    const nodes: Node<NodeData>[] = [
      { id: COORDINATOR_ID, type: 'agent', position: { x: 0, y: ((maxRows - 1) * 110) / 2 }, data: { title: 'Coordinator', agent: 'plans · delegates · reports', role: 'coordinator', status: coordStatus, duration: null, retries: 0, selected: selectedId === COORDINATOR_ID } },
      ...plan.steps.map((s): Node<NodeData> => {
        const st = byKey.get(s.id);
        return { id: s.id, type: 'agent', position: pos.get(s.id)!, data: { title: s.title, agent: st?.agentSlug ?? s.agent ?? s.capability, role: st?.agentRole ?? roleFromSlug(s.agent), status: status(s.id), duration: st?.durationMs ?? null, retries: st?.attempt ?? 0, selected: selectedId === s.id } };
      }),
    ];
    const edges: Edge[] = [];
    for (const s of plan.steps) {
      const sources = s.dependsOn.length ? s.dependsOn : [COORDINATOR_ID];
      for (const src of sources) {
        const live = ['RUNNING', 'AWAITING_APPROVAL'].includes(status(s.id));
        const done = status(s.id) === 'COMPLETED';
        const conditional = s.condition?.stepId === src;
        const color = live ? '#4f8cff' : done ? '#10b981' : status(s.id) === 'FAILED' ? '#ef4444' : '#3a4150';
        edges.push({
          id: `${src}->${s.id}`, source: src, target: s.id, className: live ? 'edge-live' : undefined, animated: false,
          label: conditional ? `if ≥ ${s.condition!.minSeverity}` : undefined, labelStyle: { fill: '#a1a1aa', fontSize: 10 }, labelBgStyle: { fill: '#0c0d10' },
          style: { stroke: color, strokeWidth: live ? 2 : 1.5, strokeDasharray: conditional && !live ? '5 4' : undefined },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
        });
      }
    }
    return { nodes, edges };
  }, [plan, steps, execStatus, selectedId]);

  if (!plan) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-line text-xs text-zinc-500" style={{ height }}>
        <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4" aria-hidden />No plan yet — the Coordinator will build the workflow here.</div>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-ink-900" style={{ height }}>
      <ReactFlow key={plan.steps.map((s) => s.id).join('|')} nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode="dark" fitView fitViewOptions={{ padding: 0.2 }}
        nodesDraggable nodesConnectable={false} elementsSelectable minZoom={0.3} proOptions={{ hideAttribution: true }} onNodeClick={(_, n) => onSelect(n.id)}>
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#262b36" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(n) => ((n.data as NodeData).status === 'COMPLETED' ? '#10b981' : (n.data as NodeData).status === 'RUNNING' ? '#4f8cff' : (n.data as NodeData).status === 'FAILED' ? '#ef4444' : '#3a4150')} maskColor="rgba(7,8,10,0.7)" />
      </ReactFlow>
    </div>
  );
}
const roleFromSlug = (slug: string | null) => (slug?.startsWith('custom') ? 'custom' : (slug ?? 'custom'));
