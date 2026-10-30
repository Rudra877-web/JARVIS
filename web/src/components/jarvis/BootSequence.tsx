import { AnimatePresence, motion } from 'framer-motion';
import { Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { jarvisSound } from '../../lib/sound';

interface BootSequenceProps {
  onComplete: () => void;
  forcePlay?: boolean;
}

const BOOT_LOGS = [
  'INITIALIZING STARK INDUSTRIES NEURAL PROTOCOL MK-VII...',
  'CALIBRATING MULTI-AGENT COORDINATOR CORE...',
  'CHECKING QUANTUM ENTANGLEMENT BUS // 4000:PORT... [OK]',
  'MOUNTING HOLOGRAPHIC CANVAS SUBSYSTEMS...',
  'ARC REACTOR FLUX STABILIZED AT 100% (1.21 GW)...',
  'LOADING ENCRYPTED AGENT REGISTRY & TOOL PERMISSIONS...',
  '>> JARVIS ONLINE. ALL SYSTEMS NOMINAL.',
];

export function BootSequence({ onComplete, forcePlay = false }: BootSequenceProps) {
  const [stage, setStage] = useState<number>(1);
  const [currentLogIdx, setCurrentLogIdx] = useState<number>(0);
  const [skipped, setSkipped] = useState<boolean>(false);

  useEffect(() => {
    // Check if user already booted this session
    if (!forcePlay) {
      try {
        const booted = sessionStorage.getItem('jarvis_booted');
        if (booted) {
          onComplete();
          return;
        }
      } catch {
        // ignore
      }
    }

    // Play boot audio
    jarvisSound.playBootSound();

    // Stage progression timings
    const timers = [
      setTimeout(() => setStage(2), 600),   // Point expands to ring
      setTimeout(() => setStage(3), 1300),  // Concentric HUD assembles
      setTimeout(() => setStage(4), 2100),  // Technical markings & radar
      setTimeout(() => setStage(5), 3000),  // Core ignition & logs start
      setTimeout(() => setStage(6), 4600),  // Final ready state
      setTimeout(() => finish(), 5400),     // Auto complete
    ];

    const logInterval = setInterval(() => {
      setCurrentLogIdx((prev) => Math.min(prev + 1, BOOT_LOGS.length - 1));
    }, 450);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        finish();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      timers.forEach(clearTimeout);
      clearInterval(logInterval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [forcePlay]);

  const finish = () => {
    try {
      sessionStorage.setItem('jarvis_booted', 'true');
    } catch {
      // ignore
    }
    setSkipped(true);
    jarvisSound.playChirp();
    setTimeout(onComplete, 400);
  };

  return (
    <AnimatePresence>
      {!skipped && (
        <motion.div
          key="boot-screen"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#020408] text-cyan-400 select-none overflow-hidden"
        >
          {/* Subtle background coordinate matrix */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,242,254,0.08)_0%,transparent_70%)] pointer-events-none" />

          {/* Central Holographic Animation */}
          <div className="relative flex items-center justify-center w-80 h-80 md:w-96 md:h-96">
            {/* Stage 1: Point of light */}
            {stage === 1 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0.8] }}
                transition={{ duration: 0.6 }}
                className="w-3 h-3 rounded-full bg-white shadow-[0_0_20px_#00f2fe]"
              />
            )}

            {/* Stage 2 & up: Expanding luminous ring */}
            {stage >= 2 && (
              <motion.div
                initial={{ scale: 0.1, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="absolute inset-4 rounded-full border border-cyan-400/60 shadow-[0_0_30px_rgba(0,242,254,0.4)]"
              />
            )}

            {/* Stage 3 & up: Concentric rotating HUD rings */}
            {stage >= 3 && (
              <>
                <motion.div
                  initial={{ rotate: -90, opacity: 0 }}
                  animate={{ rotate: 360, opacity: 1 }}
                  transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-8 rounded-full border border-dashed border-cyan-300/40"
                />
                <motion.div
                  initial={{ rotate: 90, opacity: 0 }}
                  animate={{ rotate: -360, opacity: 0.8 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-16 rounded-full border-2 border-cyan-500/50 border-t-transparent border-b-transparent"
                />
              </>
            )}

            {/* Stage 4 & up: Radar sweep & technical ticks */}
            {stage >= 4 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(0,242,254,0.3) 360deg)',
                  animation: 'spin-cw 3s linear infinite',
                  maskImage: 'radial-gradient(circle, transparent 30%, black 70%)',
                  WebkitMaskImage: 'radial-gradient(circle, transparent 30%, black 70%)',
                }}
              />
            )}

            {/* Stage 5 & up: Arc Reactor Core Ignition */}
            {stage >= 5 && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-600 via-cyan-400 to-white flex items-center justify-center shadow-[0_0_50px_#00f2fe]"
              >
                <div className="w-16 h-16 rounded-full bg-[#020617] border border-cyan-300/80 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-white animate-ping opacity-75" />
                </div>
              </motion.div>
            )}
          </div>

          {/* Typewriter System Diagnostics */}
          <div className="mt-8 w-full max-w-md px-6">
            <div className="rounded-lg border border-cyan-500/30 bg-black/60 backdrop-blur-md p-4 font-mono text-xs shadow-2xl">
              <div className="mb-2 flex items-center justify-between border-b border-cyan-900/60 pb-2 text-[10px] text-cyan-500 tracking-widest">
                <span className="flex items-center gap-1.5">
                  <Terminal className="h-3 w-3" /> STARK_OS // BOOT_LOADER
                </span>
                <span>STAGE 0{stage} / 06</span>
              </div>
              <div className="space-y-1 text-cyan-300/90 min-h-[4rem]">
                {BOOT_LOGS.slice(0, currentLogIdx + 1).map((log, i) => (
                  <p key={i} className="truncate leading-relaxed">
                    <span className="text-cyan-600 mr-2">&gt;</span>
                    {log}
                  </p>
                ))}
              </div>
            </div>
          </div>

          {/* Skip prompt */}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={finish}
              className="group flex items-center gap-2 rounded border border-cyan-500/40 bg-cyan-950/40 px-3 py-1 font-mono text-xs tracking-wider text-cyan-300 hover:border-cyan-400 hover:bg-cyan-900/60 transition-colors"
            >
              <span>BYPASS SEQUENCE</span>
              <kbd className="rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-cyan-500 group-hover:text-cyan-300">
                ESC
              </kbd>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
