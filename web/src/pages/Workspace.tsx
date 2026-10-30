import { Check, Folder, Play, RefreshCw, Sparkles, X, Zap } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExecutionView } from '../components/ExecutionView';
import { Button, Card, CardHeader, Chip, ErrorBanner, Field, Input, PageHeader, Skeleton, Textarea } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useExecution } from '../hooks/useExecution';
import type { Agent, DiscoveredFolder, Execution, Limits, Tool } from '../lib/types';

const LIMIT_FIELDS: { key: keyof Limits; label: string; min: number; max: number }[] = [
  { key: 'maxPlanSteps', label: 'Max plan steps', min: 1, max: 20 }, { key: 'maxRetries', label: 'Retries per step', min: 0, max: 5 },
  { key: 'maxRevisions', label: 'Reviewer revisions', min: 0, max: 3 }, { key: 'maxToolCallsPerStep', label: 'Tool calls per step', min: 1, max: 10 },
  { key: 'stepTimeoutMs', label: 'Step timeout (ms)', min: 500, max: 300000 }, { key: 'maxTokens', label: 'Token budget', min: 1000, max: 2000000 },
];

function Composer() {
  const nav = useNavigate();
  const [agents, setAgents] = useState<Agent[] | null>(null); const [tools, setTools] = useState<Tool[] | null>(null);
  const [folders, setFolders] = useState<DiscoveredFolder[] | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [syncingFolders, setSyncingFolders] = useState(false);
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [context, setContext] = useState('');
  const [pickedAgents, setPickedAgents] = useState<string[]>([]); const [pickedTools, setPickedTools] = useState<string[]>([]);
  const [limits, setLimits] = useState<Partial<Limits>>({});
  const [errs, setErrs] = useState<Record<string, string>>({}); const [formErr, setFormErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const loadFolders = () => {
    api.get<{ folders: DiscoveredFolder[] }>('/folders')
      .then((r) => setFolders(r.folders))
      .catch(() => undefined);
  };

  useEffect(() => {
    loadFolders();
    api.get<{ agents: Agent[] }>('/agents').then((r) => { setAgents(r.agents); setPickedAgents(r.agents.filter((a) => a.enabled && a.role !== 'coordinator').map((a) => a.slug)); }).catch((e) => setFormErr(e.message));
    api.get<{ tools: (Tool & { sensitive: boolean })[] }>('/tools').then((r) => { setTools(r.tools); setPickedTools(r.tools.filter((t) => t.enabled && !t.sensitive).map((t) => t.name)); }).catch((e) => setFormErr(e.message));
  }, []);

  const handleFolderClick = (f: DiscoveredFolder) => {
    setSelectedFolder(f.folderPath);
    if (!title || title.startsWith('Work on ')) {
      setTitle(`Work on ${f.folderPath}`);
    }
    // Auto-focus agent
    if (!pickedAgents.includes(f.slug)) {
      setPickedAgents((prev) => [...prev, f.slug]);
    }
    // Auto-enable folder tools
    const folderTools = ['folder_list', 'folder_read_file', 'folder_write_file', 'folder_search'];
    setPickedTools((prev) => [...new Set([...prev, ...folderTools])]);
  };

  const handleSyncFolders = async () => {
    setSyncingFolders(true);
    try {
      await api.post('/folders/sync');
      loadFolders();
      const r = await api.get<{ agents: Agent[] }>('/agents');
      setAgents(r.agents);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingFolders(false);
    }
  };

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setFormErr(null);
    const v: Record<string, string> = {};
    if (title.trim().length < 3) v.title = 'Title must be at least 3 characters';
    if (description.trim().length < 10) v.description = 'Describe the task in at least 10 characters';
    for (const f of LIMIT_FIELDS) { const n = limits[f.key]; if (n !== undefined && (n < f.min || n > f.max)) v[f.key] = `${f.min}–${f.max}`; }
    if (pickedAgents.length === 0) v.agents = 'Select at least one agent';
    setErrs(v); if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const r = await api.post<{ execution: Execution }>('/tasks', { title: title.trim(), description: description.trim(), context, agentSlugs: pickedAgents, toolNames: pickedTools, limits });
      nav(`/workspace/${r.execution.id}`);
    } catch (x) { setFormErr(x instanceof ApiError ? x.message : 'Submission failed'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Agent Workspace" description="Describe a task or select a workspace folder agent. The coordinator will propose a plan before anything runs." />

      {/* Dedicated Workspace Folder Agents Quick Selector */}
      <div className="mb-4 rounded-xl border border-cyan-500/30 bg-[#040c1e]/80 p-3.5 shadow-[0_0_20px_rgba(0,242,254,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <Folder className="h-4 w-4 text-cyan-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
              Workspace Folder Agents
            </h3>
            <span className="text-[11px] text-zinc-400">
              — Click a folder to assign its agent &amp; filesystem tools
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleSyncFolders}
            loading={syncingFolders}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Rescan Folders
          </Button>
        </div>
        {!folders ? (
          <Skeleton className="h-14 w-full" />
        ) : folders.length === 0 ? (
          <p className="text-xs text-zinc-500">No folders discovered in workspace.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            {folders.map((f) => {
              const isSelected = selectedFolder === f.folderPath;
              return (
                <button
                  type="button"
                  key={f.slug}
                  onClick={() => handleFolderClick(f)}
                  className={`group flex items-start gap-2.5 rounded-lg border p-2 text-left transition-all ${
                    isSelected
                      ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,242,254,0.2)]'
                      : 'border-white/10 bg-white/[0.02] hover:border-cyan-500/40 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className={`mt-0.5 rounded p-1.5 ${isSelected ? 'bg-cyan-500/20 text-cyan-300' : 'bg-white/5 text-zinc-400 group-hover:text-cyan-400'}`}>
                    <Folder className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate font-mono text-xs font-medium text-zinc-200 group-hover:text-cyan-200">
                        {f.folderPath}
                      </span>
                      {isSelected && (
                        <span className="rounded bg-cyan-500/20 px-1 py-0.2 text-[9px] font-semibold text-cyan-300">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">{f.name}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {f.capabilities.slice(0, 2).map((cap) => (
                        <span key={cap} className="rounded bg-black/40 px-1 py-0.5 text-[9px] text-zinc-500">
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[1fr_340px]" noValidate>
        <Card className="space-y-4 p-4">
          <Field label="Title" error={errs.title}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errs.title} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Audit the checkout service for reliability risks" />}</Field>
          <Field label="Task description" error={errs.description} hint="What outcome do you need? Be specific about scope and constraints.">{(id, d) => <Textarea id={id} aria-describedby={d} aria-invalid={!!errs.description} rows={5} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={8000} />}</Field>
          <Field label="Context / source data (optional)" hint="Pasted files, logs or data for the Analyst. Treated as untrusted data, never as instructions.">{(id, d) => <Textarea id={id} aria-describedby={d} rows={6} className="font-mono text-xs" value={context} onChange={(e) => setContext(e.target.value)} />}</Field>
          {formErr && <ErrorBanner message={formErr} />}
          <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy}><Sparkles className="h-4 w-4" aria-hidden />Generate plan preview</Button></div>
        </Card>
        <div className="space-y-4">
          <Card><CardHeader title="Agents" />
            <fieldset className="space-y-1.5 p-3">{!agents ? <Skeleton className="h-20" /> : agents.filter((a) => a.role !== 'coordinator').map((a) => (
              <label key={a.slug} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-[#4f8cff]" disabled={!a.enabled} checked={pickedAgents.includes(a.slug)} onChange={() => toggle(pickedAgents, setPickedAgents, a.slug)} /><span><span className="font-medium text-zinc-200">{a.name}</span>{!a.enabled && <span className="ml-1 text-zinc-600">(disabled)</span>}<span className="block text-zinc-500">{a.capabilities.join(' · ')}</span></span></label>))}
              {errs.agents && <p role="alert" className="text-xs text-red-400">{errs.agents}</p>}</fieldset></Card>
          <Card><CardHeader title="Tools" subtitle="Sensitive tools need per-call approval" />
            <fieldset className="space-y-1.5 p-3">{!tools ? <Skeleton className="h-20" /> : tools.map((t) => (
              <label key={t.name} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-[#4f8cff]" disabled={!t.enabled} checked={pickedTools.includes(t.name)} onChange={() => toggle(pickedTools, setPickedTools, t.name)} /><span><span className="font-mono text-zinc-200">{t.name}</span> {t.sensitive && <Chip tone="warn">approval</Chip>} {t.external && <Chip>external</Chip>}<span className="block text-zinc-500">{t.description}</span></span></label>))}</fieldset></Card>
          <Card><CardHeader title="Execution limits" subtitle="Leave blank for server defaults" />
            <div className="grid grid-cols-2 gap-2.5 p-3">{LIMIT_FIELDS.map((f) => (
              <Field key={f.key} label={f.label} error={errs[f.key]}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errs[f.key]} type="number" min={f.min} max={f.max} value={limits[f.key] ?? ''} placeholder="default" onChange={(e) => setLimits((l) => { const n = { ...l }; if (e.target.value === '') delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })} />}</Field>))}</div></Card>
        </div>
      </form>
    </>
  );
}

function Run({ id }: { id: string }) {
  const nav = useNavigate();
  const { detail, events, error, loading, reload } = useExecution(id);
  const [busy, setBusy] = useState<'approve' | 'cancel' | null>(null); const [err, setErr] = useState<string | null>(null);
  const act = async (k: 'approve' | 'cancel') => { setBusy(k); setErr(null); try { await api.post(`/executions/${id}/${k}`); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); } };
  if (error && !detail) return <><PageHeader title="Execution" /><ErrorBanner message={error} onRetry={reload} /></>;
  if (loading || !detail) return <div className="space-y-3" aria-busy="true"><Skeleton className="h-8 w-64" /><Skeleton className="h-96" /></div>;
  const ex = detail.execution;
  return (
    <>
      <PageHeader title="Agent Workspace" description="Live execution" actions={<Button onClick={() => nav('/workspace')}>New task</Button>} />
      {ex.status === 'AWAITING_APPROVAL' && ex.plan && (
        <Card className="mb-4 border-accent/40">
          <CardHeader title="Proposed plan — review before execution" subtitle={ex.plan.summary} action={<div className="flex gap-2"><Button size="sm" variant="danger" loading={busy === 'cancel'} onClick={() => act('cancel')}><X className="h-3.5 w-3.5" aria-hidden />Cancel</Button><Button size="sm" variant="primary" loading={busy === 'approve'} onClick={() => act('approve')}><Check className="h-3.5 w-3.5" aria-hidden /><Play className="h-3 w-3" aria-hidden />Approve &amp; run</Button></div>} />
          {err && <div className="p-3"><ErrorBanner message={err} /></div>}
          <ol className="divide-y divide-line">{ex.plan.steps.map((s, i) => (
            <li key={s.id} className="flex gap-3 px-4 py-2.5 text-xs"><span className="mt-0.5 font-mono text-zinc-600">{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="font-medium text-zinc-100">{s.title} <Chip tone="violet">{s.agent ?? s.capability}</Chip>{s.condition && <Chip tone="warn">if {s.condition.stepId} ≥ {s.condition.minSeverity}</Chip>}</p><p className="mt-0.5 text-zinc-500">{s.instruction}</p>{s.dependsOn.length > 0 && <p className="mt-0.5 text-[11px] text-zinc-600">after: {s.dependsOn.join(', ')}</p>}</div></li>))}</ol>
        </Card>
      )}
      {err && ex.status !== 'AWAITING_APPROVAL' && <ErrorBanner message={err} />}
      <ExecutionView detail={detail} events={events} reload={reload} />
    </>
  );
}

export default function Workspace() { const { id } = useParams(); return id ? <Run id={id} /> : <Composer />; }
