import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bot,
  Camera,
  Flame,
  FlaskConical,
  GitBranch,
  History,
  Image,
  LayoutDashboard,
  LogOut,
  Network,
  Settings as SettingsIcon,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { jarvisSound } from '../lib/sound';
import { ArcReactor } from './jarvis/ArcReactor';
import { BootSequence } from './jarvis/BootSequence';
import { MediaGalleryModal } from './jarvis/MediaGalleryModal';
import { OpticalSensorModal } from './jarvis/OpticalSensorModal';
import { ParticleField } from './jarvis/ParticleField';
import { ReactorRoomModal } from './jarvis/ReactorRoomModal';
import { TelemetryHUD } from './jarvis/TelemetryHUD';
import { cx } from './ui';

const NAV = [
  { to: '/', label: 'DASHBOARD', icon: LayoutDashboard, end: true, code: 'SYS.01' },
  { to: '/workspace', label: 'WORKSPACE', icon: Sparkles, code: 'SYS.02' },
  { to: '/agents', label: 'AGENTS', icon: Bot, code: 'SYS.03' },
  { to: '/explorer', label: 'EXPLORER', icon: GitBranch, code: 'SYS.04' },
  { to: '/history', label: 'HISTORY', icon: History, code: 'SYS.05' },
  { to: '/settings', label: 'SETTINGS', icon: SettingsIcon, code: 'SYS.06' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const loc = useLocation();
  const [mock, setMock] = useState(false);

  // Subsystem modal states
  const [bootOpen, setBootOpen] = useState(false);
  const [forceBoot, setForceBoot] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [opticalOpen, setOpticalOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [reactorRoomOpen, setReactorRoomOpen] = useState(false);

  useEffect(() => {
    api
      .get<{ provider: { mock: boolean } }>('/settings')
      .then((s) => setMock(s.provider.mock))
      .catch(() => undefined);

    // Check if boot sequence should run
    try {
      const booted = sessionStorage.getItem('jarvis_booted');
      if (!booted) setBootOpen(true);
    } catch {
      setBootOpen(true);
    }

    // Global keyboard shortcuts (Ctrl+K or Slash to open console)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setVoiceOpen((v) => !v);
      } else if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setVoiceOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const triggerReplayBoot = () => {
    setForceBoot(true);
    setBootOpen(true);
  };

  return (
    <div className="relative flex h-full flex-col bg-[#02050e] text-zinc-200 overflow-hidden select-none">
      {/* Background Interactive Particle Field */}
      <ParticleField intensity={0.8} />

      {/* Ambient Central Arc Reactor Watermark in Background */}
      <div className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center opacity-10">
        <ArcReactor size="hero" status="RUNNING" interactive={false} showTelemetry={false} />
      </div>

      {/* Top Holographic Telemetry HUD Bar */}
      <TelemetryHUD
        onOpenVoiceCommand={() => setVoiceOpen(true)}
        onOpenOpticalSensor={() => setOpticalOpen(true)}
        onOpenMediaGallery={() => setGalleryOpen(true)}
        onOpenReactorChamber={() => setReactorRoomOpen(true)}
        onReplayBoot={triggerReplayBoot}
      />

      {/* Main Structural Layout */}
      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        {/* Left Tactical Navigation HUD */}
        <aside
          className="hidden w-64 shrink-0 flex-col border-r border-cyan-900/40 bg-[#020614]/85 backdrop-blur-md md:flex"
          aria-label="Tactical Navigation"
        >
          {/* Stark / Nexus Monogram */}
          <div className="flex h-16 items-center gap-3 border-b border-cyan-900/40 px-5">
            <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-cyan-400/60 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,242,254,0.3)]">
              <Network className="h-5 w-5 text-cyan-300 animate-pulse" aria-hidden />
              <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-cyan-400" />
            </div>
            <div>
              <span className="font-mono text-sm font-bold tracking-[0.25em] text-cyan-100">
                NEXUS // OS
              </span>
              <p className="font-mono text-[9px] text-cyan-500 tracking-widest uppercase">
                STARK PROTOCOL
              </p>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => jarvisSound.playClick()}
                className={({ isActive }) =>
                  cx(
                    'group relative flex items-center justify-between rounded-lg px-3 py-2.5 font-mono text-xs tracking-wider transition-all',
                    isActive
                      ? 'border border-cyan-400/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_15px_rgba(0,242,254,0.2)]'
                      : 'border border-transparent text-cyan-600 hover:border-cyan-900/60 hover:bg-cyan-950/30 hover:text-cyan-300'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <n.icon
                        className={cx(
                          'h-4 w-4 transition-transform group-hover:scale-110',
                          isActive ? 'text-cyan-300 shadow-[0_0_8px_#00f2fe]' : 'text-cyan-700'
                        )}
                        aria-hidden
                      />
                      <span>{n.label}</span>
                    </div>
                    <span className="text-[9px] text-cyan-700/80 group-hover:text-cyan-500">
                      {n.code}
                    </span>
                    {isActive && (
                      <div className="absolute right-0 top-1/2 h-4 w-1 -translate-y-1/2 rounded-l bg-cyan-400 shadow-[0_0_8px_#00f2fe]" />
                    )}
                  </>
                )}
              </NavLink>
            ))}

            {/* Quick Sci-Fi Tool Shortcuts */}
            <div className="pt-3 border-t border-cyan-950/80">
              <p className="px-3 pb-2 font-mono text-[9px] text-cyan-700 tracking-widest uppercase">
                QUICK ACCESS HUD
              </p>
              <div className="grid grid-cols-2 gap-1.5 px-1">
                <button
                  onClick={() => {
                    jarvisSound.playChirp();
                    setReactorRoomOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded border border-cyan-950 bg-cyan-950/20 px-2 py-1.5 font-mono text-[10px] text-cyan-400 hover:border-cyan-700 hover:text-cyan-200"
                >
                  <Flame className="h-3 w-3 text-cyan-400" />
                  <span>ARC CORE</span>
                </button>
                <button
                  onClick={() => {
                    jarvisSound.playScan();
                    setOpticalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded border border-cyan-950 bg-cyan-950/20 px-2 py-1.5 font-mono text-[10px] text-cyan-400 hover:border-cyan-700 hover:text-cyan-200"
                >
                  <Camera className="h-3 w-3 text-cyan-400" />
                  <span>OPTICAL</span>
                </button>
                <button
                  onClick={() => {
                    jarvisSound.playClick();
                    setGalleryOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded border border-cyan-950 bg-cyan-950/20 px-2 py-1.5 font-mono text-[10px] text-cyan-400 hover:border-cyan-700 hover:text-cyan-200"
                >
                  <Image className="h-3 w-3 text-cyan-400" />
                  <span>GALLERY</span>
                </button>
                <button
                  onClick={() => {
                    jarvisSound.playChirp();
                    setVoiceOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded border border-cyan-950 bg-cyan-950/20 px-2 py-1.5 font-mono text-[10px] text-cyan-400 hover:border-cyan-700 hover:text-cyan-200"
                >
                  <Sparkles className="h-3 w-3 text-cyan-400" />
                  <span>VOICE</span>
                </button>
              </div>
            </div>
          </nav>

          {/* User Status Bar */}
          <div className="border-t border-cyan-900/40 p-3 bg-black/40">
            <div className="flex items-center gap-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-800/60 bg-cyan-950/40 font-mono text-xs font-bold text-cyan-300">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 font-mono">
                <p className="truncate text-xs font-semibold text-cyan-200">{user?.name}</p>
                <p className="truncate text-[10px] text-cyan-600">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  jarvisSound.playAlert();
                  logout();
                }}
                aria-label="Sign out"
                title="Disconnect Neural Session"
                className="rounded p-1.5 text-cyan-600 hover:bg-cyan-950/50 hover:text-red-400 transition-colors"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Right Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile Navigation */}
          <nav
            className="flex gap-1 overflow-x-auto border-b border-cyan-900/40 bg-[#020614]/90 p-2 md:hidden"
            aria-label="Primary mobile"
          >
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => jarvisSound.playClick()}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-xs',
                    isActive
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-transparent text-cyan-600 hover:text-cyan-300'
                  )
                }
              >
                <n.icon className="h-3.5 w-3.5" aria-hidden />
                {n.label}
              </NavLink>
            ))}
          </nav>

          {/* Mock Mode Banner */}
          {mock && (
            <div
              role="status"
              className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-1.5 font-mono text-xs text-amber-200"
            >
              <FlaskConical className="h-3.5 w-3.5" aria-hidden />
              <strong className="font-semibold">[MOCK MODE ACTIVE]</strong>
              <span className="text-amber-200/80">
                — LLM_PROVIDER=mock. Results are deterministic simulations.
              </span>
            </div>
          )}

          {/* Page View with Spatial Entrance Transition */}
          <main className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="mx-auto h-full max-w-[1450px]"
            >
              <Outlet />
            </motion.div>
          </main>
        </div>
      </div>

      {/* Cinematic Boot Sequence Modal */}
      {bootOpen && (
        <BootSequence
          onComplete={() => setBootOpen(false)}
          forcePlay={forceBoot}
        />
      )}

      {/* Subsystem Modals */}
      <OpticalSensorModal
        open={opticalOpen}
        onClose={() => setOpticalOpen(false)}
        onSnapshotSaved={() => setGalleryOpen(true)}
      />

      <MediaGalleryModal
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
      />

      <ReactorRoomModal
        open={reactorRoomOpen}
        onClose={() => setReactorRoomOpen(false)}
      />

      {/* Voice & Command Console */}
      <VoiceCommandModalWrapper
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onOpenOpticalSensor={() => setOpticalOpen(true)}
        onOpenMediaGallery={() => setGalleryOpen(true)}
        onToggleReactorMode={() => setReactorRoomOpen(true)}
      />
    </div>
  );
}

// Lazy-loaded or inline VoiceCommandModal
import { VoiceCommandModal } from './jarvis/VoiceCommandModal';
function VoiceCommandModalWrapper(props: any) {
  return <VoiceCommandModal {...props} />;
}

export const ActivityDot = () => <Activity className="h-3 w-3 text-cyan-400 animate-pulse" />;
