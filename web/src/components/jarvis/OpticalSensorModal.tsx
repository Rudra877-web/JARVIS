import { AnimatePresence, motion } from 'framer-motion';
import { Camera, Eye, Radio, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { jarvisSound } from '../../lib/sound';

interface OpticalSensorModalProps {
  open: boolean;
  onClose: () => void;
  onSnapshotSaved?: (dataUrl: string) => void;
}

export function OpticalSensorModal({ open, onClose, onSnapshotSaved }: OpticalSensorModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(60);
  const [scanPos, setScanPos] = useState(50);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');

  // Start real webcam stream
  const startCamera = async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Webcam media API not supported in this browser environment.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setActive(true);
      jarvisSound.playScan();
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setError(err?.message || 'Permission denied or optical sensor unavailable.');
      setActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setActive(false);
  };

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [open, facing]);

  // Optical scanning bar telemetry loop
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => {
      setScanPos((p) => (p >= 95 ? 5 : p + 1.5));
      setFps(Math.floor(58 + Math.random() * 4));
    }, 50);
    return () => clearInterval(interval);
  }, [open]);

  // Capture holographic snapshot
  const takeSnapshot = () => {
    if (!videoRef.current) return;
    jarvisSound.playChirp();

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Apply subtle holographic timestamp & stamp
    ctx.strokeStyle = '#00f2fe';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = '#00f2fe';
    ctx.font = '14px JetBrains Mono, monospace';
    ctx.fillText(`NEXUS // OPTICAL CAPTURE · ${new Date().toISOString()}`, 24, canvas.height - 24);

    const dataUrl = canvas.toDataURL('image/png');

    // Save to localStorage vault
    try {
      const existing = JSON.parse(localStorage.getItem('nexus_holographic_gallery') || '[]');
      existing.unshift({
        id: `snap-${Date.now()}`,
        url: dataUrl,
        title: `Optical Scan #${existing.length + 1}`,
        date: new Date().toLocaleTimeString(),
        type: 'snapshot',
      });
      localStorage.setItem('nexus_holographic_gallery', JSON.stringify(existing.slice(0, 20)));
    } catch {
      // ignore
    }

    if (onSnapshotSaved) onSnapshotSaved(dataUrl);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-3xl rounded-xl border border-cyan-500/50 bg-[#020612] p-5 shadow-[0_0_60px_rgba(0,242,254,0.25)] overflow-hidden"
        >
          {/* Cyber Corner Marks */}
          <span className="pointer-events-none absolute left-2 top-2 text-cyan-400 font-mono text-xs">┌</span>
          <span className="pointer-events-none absolute right-2 top-2 text-cyan-400 font-mono text-xs">┐</span>
          <span className="pointer-events-none absolute left-2 bottom-2 text-cyan-400 font-mono text-xs">└</span>
          <span className="pointer-events-none absolute right-2 bottom-2 text-cyan-400 font-mono text-xs">┘</span>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-3">
            <div className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-red-500 animate-ping' : 'bg-zinc-600'}`} />
              <div>
                <h2 className="font-mono text-xs font-semibold tracking-[0.25em] text-cyan-300 uppercase">
                  OPTICAL SURVEILLANCE // SENSOR STREAM
                </h2>
                <p className="font-mono text-[10px] text-cyan-600">
                  {active ? `LIVE FEED · ${fps} FPS · EXPOSURE: AUTO` : 'SENSOR OFFLINE'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
                className="rounded border border-cyan-900 bg-cyan-950/40 p-1.5 text-cyan-400 hover:text-cyan-200 transition-colors"
                title="Toggle Sensor Orientation"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="rounded border border-cyan-900 bg-cyan-950/40 p-1.5 text-cyan-400 hover:text-cyan-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Video Viewport with Holographic Overlays */}
          <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-lg border border-cyan-800/80 bg-black flex items-center justify-center">
            {error ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <Eye className="h-10 w-10 text-cyan-700 mb-2 animate-pulse" />
                <p className="font-mono text-xs text-red-400">{error}</p>
                <button
                  onClick={startCamera}
                  className="mt-3 rounded border border-cyan-500/50 bg-cyan-950/50 px-3 py-1 font-mono text-xs text-cyan-300 hover:bg-cyan-900/50"
                >
                  RETRY OPTICAL LINK
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover filter contrast-110 brightness-95"
                />

                {/* Scanline Sweep Line */}
                <div
                  className="pointer-events-none absolute left-0 right-0 h-0.5 bg-cyan-400 shadow-[0_0_12px_#00f2fe]"
                  style={{ top: `${scanPos}%` }}
                />

                {/* Holographic Framing Brackets */}
                <div className="pointer-events-none absolute inset-6 border border-cyan-400/30">
                  <div className="absolute -top-1 -left-1 h-4 w-4 border-t-2 border-l-2 border-cyan-400" />
                  <div className="absolute -top-1 -right-1 h-4 w-4 border-t-2 border-r-2 border-cyan-400" />
                  <div className="absolute -bottom-1 -left-1 h-4 w-4 border-b-2 border-l-2 border-cyan-400" />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 border-b-2 border-r-2 border-cyan-400" />
                </div>

                {/* Center Targeting Reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative h-20 w-20 rounded-full border border-dashed border-cyan-400/60 animate-spin-slow flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-cyan-400" />
                  </div>
                </div>

                {/* Real-time HUD Telemetry Overlays */}
                <div className="pointer-events-none absolute top-3 left-3 font-mono text-[10px] text-cyan-400/90 space-y-0.5">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Radio className="h-3 w-3 text-red-400 animate-pulse" /> SENSOR_01 // ACTIVE
                  </p>
                  <p>TARGET LOCK: CONTINUOUS</p>
                  <p>COORD: 40°42'N 74°00'W</p>
                </div>

                <div className="pointer-events-none absolute bottom-3 right-3 font-mono text-[10px] text-cyan-400/90 text-right space-y-0.5">
                  <p>OPTICAL ZOOM: 1.0X</p>
                  <p>FLUX SENSITIVITY: 94%</p>
                  <p>STARK_NET // SECURE LINK</p>
                </div>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 flex items-center justify-between border-t border-cyan-900/60 pt-3">
            <span className="font-mono text-xs text-cyan-600">
              FRAME CAPTURES SAVE DIRECTLY TO HOLOGRAPHIC ARTIFACT VAULT
            </span>
            <button
              onClick={takeSnapshot}
              disabled={!active}
              className="flex items-center gap-2 rounded-lg border border-cyan-400 bg-cyan-500/20 px-4 py-2 font-mono text-xs font-semibold text-cyan-200 hover:bg-cyan-500/40 hover:text-white transition-all shadow-[0_0_15px_rgba(0,242,254,0.3)] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Camera className="h-4 w-4" />
              <span>CAPTURE SNAPSHOT</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
