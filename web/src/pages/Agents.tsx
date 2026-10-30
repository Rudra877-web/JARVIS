import { Bot, Folder, Lock, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Chip, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Skeleton, Textarea } from '../components/ui';
import { api } from '../lib/api';
import { fmtDuration } from '../lib/format';
import type { Agent, Tool } from '../lib/types';

function AgentForm({ agent, tools, onClose, onSaved }: { agent: Agent | null; tools: Tool[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(agent?.name ?? ''); const [description, setDescription] = useState(agent?.description ?? '');
  const [caps, setCaps] = useState((agent?.capabilities ?? []).join(', ')); const [allowed, setAllowed] = useState<string[]>(agent?.allowedTools ?? []);
  const [errs, setErrs] = useState<Record<string, string>>({}); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null);
    const capabilities = [...new Set(caps.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean))];
    const v: Record<string, string> = {};
    if (name.trim().length < 2) v.name = 'Name must be at least 2 characters';
    if (!capabilities.length) v.caps = 'Add at least one capability';
    else if (capabilities.some((c) => !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(c))) v.caps = 'Use lowercase letters, digits, - or _';
    setErrs(v); if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const body = { name: name.trim(), description: description.trim(), capabilities, allowedTools: allowed };
      if (agent) await api.patch(`/agents/${agent.id}`, body); else await api.post('/agents', body);
      onSaved(); onClose();
    } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field label="Name" error={errs.name}>{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errs.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />}</Field>
      <Field label="Description">{(id) => <Textarea id={id} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />}</Field>
      <Field label="Capabilities" error={errs.caps} hint="Comma-separated. The coordinator routes steps by capability. Built-in capabilities are reserved.">{(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!errs.caps} value={caps} onChange={(e) => setCaps(e.target.value)} placeholder="translation, summarization" />}</Field>
      <fieldset><legend className="mb-1.5 text-xs font-medium text-zinc-400">Permitted tools</legend>
        <div className="space-y-1.5">{tools.map((t) => (<label key={t.name} className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-[#4f8cff]" checked={allowed.includes(t.name)} onChange={() => setAllowed((a) => a.includes(t.name) ? a.filter((x) => x !== t.name) : [...a, t.name])} /><span><span className="font-mono">{t.name}</span> {t.sensitive && <Chip tone="warn">approval</Chip>}<span className="block text-zinc-500">{t.description}</span></span></label>))}</div>
        <p className="mt-1.5 text-[11px] text-zinc-600">Permissions are enforced server-side on every tool call.</p></fieldset>
      {err && <ErrorBanner message={err} />}
      <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" loading={busy}>{agent ? 'Save changes' : 'Create agent'}</Button></div>
    </form>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[] | null>(null); const [tools, setTools] = useState<Tool[]>([]); const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Agent | 'new' | null>(null);
  const [syncing, setSyncing] = useState(false);
  const load = () => api.get<{ agents: Agent[] }>('/agents').then((r) => { setAgents(r.agents); setErr(null); }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); api.get<{ tools: Tool[] }>('/tools').then((r) => setTools(r.tools)).catch(() => undefined); }, []);
  const syncFolders = async () => {
    setSyncing(true); setErr(null);
    try {
      await api.post('/folders/sync');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Folder sync failed');
    } finally {
      setSyncing(false);
    }
  };
  const toggle = async (a: Agent) => { try { await api.patch(`/agents/${a.id}`, { enabled: !a.enabled }); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };
  const del = async (a: Agent) => { if (!confirm(`Delete agent "${a.name}"?`)) return; try { await api.del(`/agents/${a.id}`); await load(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } };
  return (
    <>
      <PageHeader
        title="Agents"
        description="Built-in agents are read-only. Custom and folder-scoped agents empower project directories."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={syncFolders} loading={syncing}>
              <RefreshCw className="h-4 w-4" aria-hidden />
              Sync Folders
            </Button>
            <Button variant="primary" onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              New custom agent
            </Button>
          </div>
        }
      />
      {err && <div className="mb-3"><ErrorBanner message={err} onRetry={load} /></div>}
      {!agents ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}</div> : agents.length === 0 ? <Card><EmptyState icon={<Bot className="h-5 w-5" />} title="No agents" /></Card> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{agents.map((a) => {
          const isFolder = a.slug.startsWith('folder-');
          return (
            <Card key={a.id} className={`flex flex-col p-4 ${isFolder ? 'border-cyan-500/30 bg-cyan-950/10' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    {isFolder && <Folder className="h-4 w-4 text-cyan-400 shrink-0" />}
                    <h3 className="text-sm font-medium text-zinc-100">{a.name}</h3>
                  </div>
                  <p className="font-mono text-[10px] text-zinc-500 mt-0.5">{a.slug}</p>
                </div>
                {isFolder ? (
                  <Chip tone="accent">
                    <Folder className="mr-1 h-2.5 w-2.5" aria-hidden />
                    folder agent
                  </Chip>
                ) : a.isBuiltin ? (
                  <Chip tone="violet">
                    <Lock className="mr-1 h-2.5 w-2.5" aria-hidden />
                    built-in
                  </Chip>
                ) : (
                  <Chip tone="accent">custom</Chip>
                )}
              </div>
              <p className="mt-2 flex-1 text-xs text-zinc-400">{a.description || 'No description'}</p>
              <div className="mt-2 flex flex-wrap gap-1">{a.capabilities.map((c) => <Chip key={c}>{c}</Chip>)}</div>
              <p className="mt-2 text-[11px] text-zinc-500">Tools: {a.allowedTools.length ? a.allowedTools.join(', ') : 'none'}</p>
              <p className="mt-1 text-[11px] text-zinc-500">{a.stats.runs} runs · {a.stats.completed} ok · {a.stats.failed} failed · avg {fmtDuration(a.stats.avgMs || null)}</p>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    className="accent-[#4f8cff]"
                    checked={a.enabled}
                    disabled={a.isBuiltin && a.role === 'coordinator'}
                    onChange={() => toggle(a)}
                    aria-label={`Enable ${a.name}`}
                  />
                  Enabled
                </label>
                {!a.isBuiltin && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)} aria-label={`Edit ${a.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => del(a)} aria-label={`Delete ${a.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}</div>
      )}
      <Modal open={editing !== null} title={editing === 'new' ? 'New custom agent' : 'Edit agent'} onClose={() => setEditing(null)}>
        {editing !== null && <AgentForm agent={editing === 'new' ? null : editing} tools={tools} onClose={() => setEditing(null)} onSaved={load} />}
      </Modal>
    </>
  );
}
