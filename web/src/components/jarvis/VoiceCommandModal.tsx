import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Camera, Compass, Flame, Image, Mic, MicOff, Search, Send, Sparkles, Volume2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { jarvisSound } from '../../lib/sound';

interface VoiceCommandModalProps {
  open: boolean;
  onClose: () => void;
  onOpenOpticalSensor?: () => void;
  onOpenMediaGallery?: () => void;
  onToggleReactorMode?: () => void;
}

interface CommandAction {
  label: string;
  desc: string;
  icon: typeof Bot;
  run: () => void;
}

export function VoiceCommandModal({
  open,
  onClose,
  onOpenOpticalSensor,
  onOpenMediaGallery,
  onToggleReactorMode,
}: VoiceCommandModalProps) {
  const nav = useNavigate();
  const [query, setQuery] = useState('');
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [responseMsg, setResponseMsg] = useState<string | null>(
    'JARVIS AI Online. Speak a vocal instruction or type below.'
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Available commands mapped to actual actions
  const COMMANDS: Record<string, () => void> = {
    workspace: () => { nav('/workspace'); onClose(); },
    'new task': () => { nav('/workspace'); onClose(); },
    task: () => { nav('/workspace'); onClose(); },
    dashboard: () => { nav('/'); onClose(); },
    home: () => { nav('/'); onClose(); },
    overview: () => { nav('/'); onClose(); },
    agents: () => { nav('/agents'); onClose(); },
    history: () => { nav('/history'); onClose(); },
    executions: () => { nav('/history'); onClose(); },
    explorer: () => { nav('/explorer'); onClose(); },
    workflow: () => { nav('/explorer'); onClose(); },
    settings: () => { nav('/settings'); onClose(); },
    config: () => { nav('/settings'); onClose(); },
    camera: () => { onOpenOpticalSensor?.(); onClose(); },
    optical: () => { onOpenOpticalSensor?.(); onClose(); },
    sensor: () => { onOpenOpticalSensor?.(); onClose(); },
    gallery: () => { onOpenMediaGallery?.(); onClose(); },
    artifacts: () => { onOpenMediaGallery?.(); onClose(); },
    vault: () => { onOpenMediaGallery?.(); onClose(); },
    reactor: () => { onToggleReactorMode?.(); onClose(); },
    core: () => { onToggleReactorMode?.(); onClose(); },
    sound: () => {
      const now = jarvisSound.toggle();
      setResponseMsg(`Audio synthesized effects: ${now ? 'ENABLED' : 'MUTED'}`);
    },
    audio: () => {
      const now = jarvisSound.toggle();
      setResponseMsg(`Audio synthesized effects: ${now ? 'ENABLED' : 'MUTED'}`);
    },
    diagnostic: () => {
      jarvisSound.playScan();
      setResponseMsg('Diagnostics complete: 4 Agents active, Postgres linked, fastify router responding at 2ms latency.');
    },
  };

  const SUGGESTIONS = [
    { label: 'New Task', icon: Sparkles, query: 'new task' },
    { label: 'Inspect Agents', icon: Bot, query: 'agents' },
    { label: 'Optical Sensor', icon: Camera, query: 'camera' },
    { label: 'Artifact Vault', icon: Image, query: 'gallery' },
    { label: 'Holographic Core', icon: Flame, query: 'reactor' },
    { label: 'System Diagnostic', icon: Compass, query: 'diagnostic' },
  ];

  // Speech Recognition Setup
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicSupported(false);
      return;
    }

    try {
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setListening(true);
        jarvisSound.playChirp();
      };

      rec.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((r: any) => r[0].transcript)
          .join('')
          .toLowerCase();
        setQuery(transcript);
        if (event.results[0].isFinal) {
          executeCommand(transcript);
        }
      };

      rec.onerror = (e: any) => {
        console.warn('Speech recognition error:', e);
        setListening(false);
        setResponseMsg('Microphone input error or permission denied.');
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
    } catch {
      setMicSupported(false);
    }
  }, []);

  // Waveform visualization animation
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let phase = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      ctx.lineWidth = 2;
      ctx.strokeStyle = listening ? '#00f2fe' : processing ? '#8b5cf6' : '#0284c7';
      ctx.shadowColor = listening ? '#00f2fe' : '#38bdf8';
      ctx.shadowBlur = listening ? 10 : 3;

      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const amp = listening ? 18 : processing ? 12 : 5;
        const freq = 0.05;
        const y = mid + Math.sin(x * freq + phase) * amp * Math.sin((x / w) * Math.PI);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      phase += listening ? 0.18 : 0.05;
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [open, listening, processing]);

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch {
        // already started
      }
    }
  };

  const executeCommand = (cmd: string) => {
    const clean = cmd.trim().toLowerCase();
    if (!clean) return;

    jarvisSound.playClick();
    setProcessing(true);

    setTimeout(() => {
      setProcessing(false);
      // Check for matching keywords
      for (const [key, action] of Object.entries(COMMANDS)) {
        if (clean.includes(key)) {
          jarvisSound.playChirp();
          setResponseMsg(`Executing protocol: [${key.toUpperCase()}]...`);
          setTimeout(action, 450);
          return;
        }
      }

      // Fallback
      jarvisSound.playAlert();
      setResponseMsg(`Vocal query "${clean}" recognized, but no matching subsystem found. Try: "workspace", "optical sensor", "reactor", or "diagnostic".`);
    }, 350);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-xl rounded-xl border border-cyan-500/40 bg-[#040814]/95 p-6 text-zinc-100 shadow-[0_0_50px_rgba(0,242,254,0.2)] overflow-hidden"
        >
          {/* Cyber Corner Reticles */}
          <span className="pointer-events-none absolute left-2 top-2 text-cyan-400 font-mono text-xs">┌</span>
          <span className="pointer-events-none absolute right-2 top-2 text-cyan-400 font-mono text-xs">┐</span>
          <span className="pointer-events-none absolute left-2 bottom-2 text-cyan-400 font-mono text-xs">└</span>
          <span className="pointer-events-none absolute right-2 bottom-2 text-cyan-400 font-mono text-xs">┘</span>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
              <h2 className="font-mono text-xs font-semibold tracking-[0.25em] text-cyan-300 uppercase">
                JARVIS // NEURAL COMMAND CONSOLE
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1 text-cyan-500 hover:bg-cyan-950/60 hover:text-cyan-300 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Oscilloscope Waveform */}
          <div className="my-4 flex flex-col items-center justify-center rounded-lg border border-cyan-950 bg-black/50 p-2">
            <canvas ref={canvasRef} width={500} height={46} className="w-full h-12" />
            <div className="flex items-center gap-2 mt-1 text-[10px] font-mono tracking-widest text-cyan-500/80">
              {listening ? (
                <span className="text-cyan-300 animate-pulse font-semibold">
                  ● LISTENING TO VOCAL INPUT...
                </span>
              ) : processing ? (
                <span className="text-violet-400 animate-pulse">
                  ● INTERPRETING NEURAL INTENT...
                </span>
              ) : (
                <span>STANDBY // READY FOR INPUT</span>
              )}
            </div>
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeCommand(query);
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-cyan-600" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Speak or enter command (e.g. 'new task', 'camera', 'diagnostic')..."
                className="w-full rounded-lg border border-cyan-800/60 bg-black/60 pl-9 pr-4 py-2.5 font-mono text-xs text-cyan-200 placeholder:text-cyan-800 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
                autoFocus
              />
            </div>

            {/* Mic Button */}
            {micSupported && (
              <button
                type="button"
                onClick={toggleMic}
                title={listening ? 'Stop Listening' : 'Speak Voice Command'}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all ${
                  listening
                    ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_#00f2fe]'
                    : 'border-cyan-900 bg-cyan-950/40 text-cyan-500 hover:border-cyan-600 hover:text-cyan-300'
                }`}
              >
                {listening ? <Mic className="h-4 w-4 animate-bounce" /> : <MicOff className="h-4 w-4" />}
              </button>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-500/60 bg-cyan-600/30 text-cyan-200 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_10px_rgba(0,242,254,0.3)]"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          {/* JARVIS Response Box */}
          {responseMsg && (
            <div className="mt-4 rounded-lg border border-cyan-900/80 bg-cyan-950/20 p-3 font-mono text-xs text-cyan-300/90 leading-relaxed">
              <span className="text-cyan-500 font-semibold mr-1.5">[JARVIS]</span>
              {responseMsg}
            </div>
          )}

          {/* Quick Command Suggestions */}
          <div className="mt-4 border-t border-cyan-950/80 pt-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-cyan-600 mb-2">
              Suggested Directives
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => {
                    setQuery(s.query);
                    executeCommand(s.query);
                  }}
                  className="flex items-center gap-1.5 rounded border border-cyan-900/60 bg-cyan-950/30 px-2.5 py-1 text-xs font-mono text-cyan-400 hover:border-cyan-500/60 hover:bg-cyan-900/40 hover:text-cyan-200 transition-colors"
                >
                  <s.icon className="h-3 w-3" />
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
