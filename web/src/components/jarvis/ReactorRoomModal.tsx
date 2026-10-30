import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Cpu, Flame, Power, Shield, Sliders, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { jarvisSound } from '../../lib/sound';
import { ArcReactor } from './ArcReactor';

interface ReactorRoomModalProps {
  open: boolean;
  onClose: () => void;
}

export function ReactorRoomModal({ open, onClose }: ReactorRoomModalProps) {
  const [outputPower, setOutputPower] = useState(98.4);
  const [magneticContainment, setMagneticContainment] = useState(99.9);
  const [soundOn, setSoundOn] = useState(true);
  const [mode, setMode] = useState<'nominal' | 'overdrive' | 'defensive'>('nominal');

  useEffect(() => {
    setSoundOn(jarvisSound.isEnabled());
  }, [open]);

  const toggleSound = () => {
    const next = jarvisSound.toggle();
    setSoundOn(next);
  };

  const handleModeChange = (m: 'nominal' | 'overdrive' | 'defensive') => {
    jarvisSound.playChirp();
    setMode(m);
    if (m === 'overdrive') {
      setOutputPower(112.5);
      setMagneticContainment(97.2);
    } else if (m === 'defensive') {
      setOutputPower(75.0);
      setMagneticContainment(100.0);
    } else {
      setOutputPower(98.4);
      setMagneticContainment(99.9);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 overflow-y-auto"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative flex min-h-[90vh] w-full max-w-6xl flex-col rounded-2xl border border-cyan-500/50 bg-[#02050f]/95 p-6 text-zinc-100 shadow-[0_0_80px_rgba(0,242,254,0.3)] overflow-hidden"
        >
          {/* Cyber Framing Lines & Reticles */}
          <span className="pointer-events-none absolute left-3 top-3 text-cyan-400 font-mono text-sm">┌</span>
          <span className="pointer-events-none absolute right-3 top-3 text-cyan-400 font-mono text-sm">┐</span>
          <span className="pointer-events-none absolute left-3 bottom-3 text-cyan-400 font-mono text-sm">└</span>
          <span className="pointer-events-none absolute right-3 bottom-3 text-cyan-400 font-mono text-sm">┘</span>

          {/* Top Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-4">
            <div className="flex items-center gap-3">
              <Flame className="h-6 w-6 text-cyan-400 animate-pulse" />
              <div>
                <h1 className="font-mono text-sm font-bold tracking-[0.3em] text-cyan-300 uppercase">
                  STARK INDUSTRIES ARC REACTOR // PRIMARY CHAMBER
                </h1>
                <p className="font-mono text-xs text-cyan-600">
                  MARK-85 QUANTUM ENERGY GENERATION & ORCHESTRATION NEXUS
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSound}
                className="flex items-center gap-1.5 rounded-lg border border-cyan-900 bg-cyan-950/40 px-3 py-1.5 font-mono text-xs text-cyan-400 hover:text-cyan-200"
              >
                {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                <span>{soundOn ? 'AUDIO ON' : 'AUDIO OFF'}</span>
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-cyan-900 bg-cyan-950/40 p-2 text-cyan-400 hover:text-cyan-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Main Chamber Grid */}
          <div className="mt-6 grid flex-1 gap-6 lg:grid-cols-[280px_1fr_280px] items-center">
            {/* Left Telemetry Pillar */}
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-900/70 bg-black/60 p-4">
                <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 font-semibold mb-2">
                  <Cpu className="h-4 w-4" /> QUANTUM FLUX STATUS
                </div>
                <div className="space-y-3 font-mono text-xs">
                  <div>
                    <div className="flex justify-between text-[11px] text-cyan-500 mb-1">
                      <span>CORE OUTPUT</span>
                      <span className="text-cyan-200">{outputPower}%</span>
                    </div>
                    <div className="h-2 w-full rounded bg-cyan-950 overflow-hidden border border-cyan-800/40">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-300 shadow-[0_0_10px_#00f2fe]"
                        style={{ width: `${Math.min(100, outputPower)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-cyan-500 mb-1">
                      <span>MAGNETIC CONTAINMENT</span>
                      <span className="text-cyan-200">{magneticContainment}%</span>
                    </div>
                    <div className="h-2 w-full rounded bg-cyan-950 overflow-hidden border border-cyan-800/40">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-300"
                        style={{ width: `${magneticContainment}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Reactor Modes */}
              <div className="rounded-xl border border-cyan-900/70 bg-black/60 p-4">
                <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 font-semibold mb-3">
                  <Sliders className="h-4 w-4" /> OPERATIONAL DIRECTIVE
                </div>
                <div className="space-y-2">
                  {[
                    { id: 'nominal', label: 'NOMINAL FLUX (1.21 GW)', icon: Power },
                    { id: 'overdrive', label: 'OVERDRIVE MATRIX (1.45 GW)', icon: Zap },
                    { id: 'defensive', label: 'DEFENSIVE LOCKDOWN (0.90 GW)', icon: Shield },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleModeChange(m.id as any)}
                      className={`flex w-full items-center gap-2 rounded-lg border p-2.5 font-mono text-xs transition-all ${
                        mode === m.id
                          ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200 shadow-[0_0_12px_rgba(0,242,254,0.3)]'
                          : 'border-cyan-950 bg-cyan-950/20 text-cyan-500 hover:border-cyan-800 hover:text-cyan-300'
                      }`}
                    >
                      <m.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Central Hero Arc Reactor */}
            <div className="relative flex flex-col items-center justify-center py-6">
              <ArcReactor
                size="hero"
                status={mode === 'overdrive' ? 'RUNNING' : mode === 'defensive' ? 'AWAITING_APPROVAL' : 'COMPLETED'}
                interactive={true}
                showTelemetry={true}
              />
            </div>

            {/* Right Telemetry Pillar: Connected Agents */}
            <div className="space-y-4">
              <div className="rounded-xl border border-cyan-900/70 bg-black/60 p-4">
                <div className="flex items-center gap-2 font-mono text-xs text-cyan-400 font-semibold mb-3">
                  <Activity className="h-4 w-4" /> ENTANGLED AGENTS
                </div>
                <div className="space-y-2.5 font-mono text-xs">
                  {[
                    { name: 'Coordinator', role: 'Executive Planner', status: 'SYNCHRONIZED', freq: '1.42 GHz' },
                    { name: 'Researcher', role: 'Knowledge Extraction', status: 'SYNCHRONIZED', freq: '1.20 GHz' },
                    { name: 'Analyst', role: 'Structured Synthesis', status: 'SYNCHRONIZED', freq: '1.38 GHz' },
                    { name: 'Reviewer', role: 'Verification & Safety', status: 'SYNCHRONIZED', freq: '1.45 GHz' },
                  ].map((agent) => (
                    <div
                      key={agent.name}
                      className="rounded border border-cyan-950/80 bg-cyan-950/20 p-2 text-cyan-300"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-cyan-200">{agent.name}</span>
                        <span className="text-[10px] text-emerald-400">● {agent.status}</span>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-cyan-600 mt-1">
                        <span>{agent.role}</span>
                        <span>{agent.freq}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Thermal Dissipation */}
              <div className="rounded-xl border border-cyan-900/70 bg-black/60 p-4 font-mono text-xs text-cyan-400">
                <p className="text-[10px] text-cyan-600 uppercase tracking-wider mb-1">
                  Thermal Dissipation
                </p>
                <p className="text-xl font-bold text-cyan-200">294.15 K // ROOM AMBIENT</p>
                <p className="text-[10px] text-cyan-500 mt-1">SUPERCONDUCTING CRYO-CHAMBER: SEALED</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
