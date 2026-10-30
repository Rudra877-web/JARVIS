import { Network, ShieldCheck, Terminal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ArcReactor } from '../components/jarvis/ArcReactor';
import { ParticleField } from '../components/jarvis/ParticleField';
import { Button, Card, ErrorBanner, Field, Input } from '../components/ui';
import { useAuth } from '../lib/auth';
import { jarvisSound } from '../lib/sound';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    jarvisSound.playScan();
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      jarvisSound.playChirp();
    } catch (x) {
      jarvisSound.playAlert();
      setErr(x instanceof Error ? x.message : 'Access denied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative grid h-full place-items-center bg-[#02050e] p-4 select-none overflow-hidden">
      {/* Background Interactive Particles */}
      <ParticleField intensity={0.6} />

      <Card className="relative z-10 w-full max-w-sm border border-cyan-500/40 bg-[#030717]/90 p-6 shadow-[0_0_60px_rgba(0,242,254,0.25)]">
        {/* Top Arc Core Badge */}
        <div className="flex flex-col items-center justify-center mb-4">
          <ArcReactor size="sm" status="RUNNING" interactive={true} showTelemetry={false} />
          <div className="mt-2 text-center">
            <span className="font-mono text-sm font-bold tracking-[0.3em] text-cyan-200 uppercase">
              STARK PROTOCOL // NEXUS
            </span>
            <p className="font-mono text-[10px] text-cyan-500 tracking-wider">
              MULTI-AGENT NEURAL TERMINAL ACCESS
            </p>
          </div>
        </div>

        <div className="mb-4 border-b border-cyan-900/60 pb-2">
          <h1 className="font-mono text-xs font-semibold tracking-wider text-cyan-300 uppercase flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            {mode === 'login' ? 'NEURAL CLEARANCE AUTH' : 'GENERATE NEW OPERATOR KEY'}
          </h1>
        </div>

        <form onSubmit={submit} className="space-y-3.5" noValidate>
          {mode === 'register' && (
            <Field label="OPERATOR IDENTIFIER">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  placeholder="e.g. Tony Stark"
                  required
                />
              )}
            </Field>
          )}

          <Field label="QUANTUM COMM EMAIL">
            {(id) => (
              <Input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                placeholder="operator@stark.nexus"
                required
              />
            )}
          </Field>

          <Field
            label="SECURITY PASSPHRASE"
            hint={mode === 'register' ? 'Minimum 8 alphanumeric characters' : undefined}
          >
            {(id, d) => (
              <Input
                id={id}
                aria-describedby={d}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
              />
            )}
          </Field>

          {err && <ErrorBanner message={err} />}

          <Button
            type="submit"
            variant="primary"
            className="w-full mt-2"
            loading={busy}
          >
            <ShieldCheck className="h-4 w-4 mr-1.5" />
            {mode === 'login' ? 'AUTHENTICATE ACCESS' : 'ENROLL OPERATOR CREDENTIALS'}
          </Button>
        </form>

        <button
          className="mt-4 w-full text-center font-mono text-xs text-cyan-600 hover:text-cyan-300 transition-colors"
          onClick={() => {
            jarvisSound.playClick();
            setMode(mode === 'login' ? 'register' : 'login');
            setErr(null);
          }}
        >
          {mode === 'login'
            ? '>> NO CLEARANCE? ENROLL OPERATOR'
            : '>> HAVE CREDENTIALS? AUTHENTICATE'}
        </button>
      </Card>
    </div>
  );
}
