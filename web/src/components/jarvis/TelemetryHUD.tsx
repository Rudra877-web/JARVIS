import { Camera, Command, Flame, Image, Play, Volume2, VolumeX, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { jarvisSound } from '../../lib/sound';

interface TelemetryHUDProps {
  onOpenVoiceCommand: () => void;
  onOpenOpticalSensor: () => void;
  onOpenMediaGallery: () => void;
  onOpenReactorChamber: () => void;
  onReplayBoot: () => void;
}

export function TelemetryHUD({
  onOpenVoiceCommand,
  onOpenOpticalSensor,
  onOpenMediaGallery,
  onOpenReactorChamber,
  onReplayBoot,
}: TelemetryHUDProps) {
  const [timeStr, setTimeStr] = useState('');
  const [stardate, setStardate] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cpuLoad, setCpuLoad] = useState(24);
  const [memLoad, setMemLoad] = useState(48);

  useEffect(() => {
    setSoundEnabled(jarvisSound.isEnabled());

    const updateClock = () => {
      const now = new Date();
      setTimeStr(now.toTimeString().split(' ')[0] + ' UTC');
      const startYear = new Date(now.getFullYear(), 0, 1).getTime();
      const stardateCalc = (now.getFullYear() + (now.getTime() - startYear) / (365.25 * 86400000)).toFixed(2);
      setStardate(`STARDATE ${stardateCalc}`);
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);

    const jitterInterval = setInterval(() => {
      setCpuLoad(Math.floor(22 + Math.random() * 8));
      setMemLoad(Math.floor(46 + Math.random() * 5));
    }, 1800);

    return () => {
      clearInterval(clockInterval);
      clearInterval(jitterInterval);
    };
  }, []);

  const toggleSound = () => {
    const next = jarvisSound.toggle();
    setSoundEnabled(next);
  };

  return (
    <header className="relative z-20 flex h-11 items-center justify-between border-b border-cyan-900/60 bg-[#030712]/90 backdrop-blur-md px-4 font-mono text-xs text-cyan-400 select-none">
      {/* Left: Telemetry & Stark Identity */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00f2fe] animate-ping" />
          <span className="font-semibold tracking-[0.25em] text-cyan-200">
            JARVIS // MK-85
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-3 text-[11px] text-cyan-600 border-l border-cyan-900/60 pl-3">
          <span>{stardate}</span>
          <span className="text-cyan-400">{timeStr}</span>
        </div>

        <div className="hidden xl:flex items-center gap-3 text-[11px] text-cyan-600 border-l border-cyan-900/60 pl-3">
          <span>
            CORE_BUS: <strong className="text-cyan-300">{cpuLoad}%</strong>
          </span>
          <span>
            NEURAL_MEM: <strong className="text-cyan-300">{memLoad}%</strong>
          </span>
        </div>
      </div>

      {/* Right: Quick Action Controls */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Holographic Arc Reactor Chamber */}
        <button
          onClick={() => {
            jarvisSound.playChirp();
            onOpenReactorChamber();
          }}
          className="flex items-center gap-1.5 rounded border border-cyan-500/50 bg-cyan-950/40 px-2.5 py-1 text-[11px] text-cyan-200 hover:border-cyan-400 hover:bg-cyan-900/50 shadow-[0_0_10px_rgba(0,242,254,0.2)] transition-all"
          title="Open Primary Holographic Reactor Chamber"
        >
          <Flame className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
          <span className="hidden sm:inline">ARC REACTOR</span>
        </button>

        {/* Optical Sensor (Camera) */}
        <button
          onClick={() => {
            jarvisSound.playScan();
            onOpenOpticalSensor();
          }}
          className="flex items-center gap-1.5 rounded border border-cyan-900/80 bg-cyan-950/30 px-2 py-1 text-[11px] text-cyan-400 hover:border-cyan-600 hover:text-cyan-200 transition-colors"
          title="Open Optical Sensor (Camera HUD)"
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="hidden md:inline">OPTICAL</span>
        </button>

        {/* Artifact Gallery */}
        <button
          onClick={() => {
            jarvisSound.playClick();
            onOpenMediaGallery();
          }}
          className="flex items-center gap-1.5 rounded border border-cyan-900/80 bg-cyan-950/30 px-2 py-1 text-[11px] text-cyan-400 hover:border-cyan-600 hover:text-cyan-200 transition-colors"
          title="Open Artifact Vault / Gallery"
        >
          <Image className="h-3.5 w-3.5" />
          <span className="hidden md:inline">VAULT</span>
        </button>

        {/* Voice & Command Console */}
        <button
          onClick={() => {
            jarvisSound.playChirp();
            onOpenVoiceCommand();
          }}
          className="flex items-center gap-1.5 rounded border border-cyan-500/60 bg-cyan-600/20 px-2.5 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/30 hover:text-white transition-all shadow-[0_0_8px_rgba(0,242,254,0.25)]"
          title="Open Neural Command Console (Ctrl+K)"
        >
          <Command className="h-3.5 w-3.5" />
          <span>CONSOLE</span>
        </button>

        {/* Audio Toggle */}
        <button
          onClick={toggleSound}
          className="rounded border border-cyan-900/80 bg-cyan-950/30 p-1 text-cyan-400 hover:border-cyan-600 hover:text-cyan-200 transition-colors"
          title={soundEnabled ? 'Mute Interface Sound' : 'Enable Interface Sound'}
        >
          {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5 text-zinc-500" />}
        </button>

        {/* Replay Boot */}
        <button
          onClick={() => {
            jarvisSound.playClick();
            onReplayBoot();
          }}
          className="rounded border border-cyan-900/80 bg-cyan-950/30 p-1 text-cyan-400 hover:border-cyan-600 hover:text-cyan-200 transition-colors"
          title="Replay Cinematic Initialization Boot Sequence"
        >
          <Play className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  );
}
