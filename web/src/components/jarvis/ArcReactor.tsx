import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ArcReactorProps {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  status?: string;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
  showTelemetry?: boolean;
}

export function ArcReactor({
  size = 'md',
  status = 'COMPLETED',
  interactive = true,
  className = '',
  onClick,
  showTelemetry = true,
}: ArcReactorProps) {
  const [flux, setFlux] = useState(98.4);
  const [coreFreq, setCoreFreq] = useState(1420);
  const [entropy, setEntropy] = useState(0.042);

  // Dynamic telemetry jitter to feel organically alive
  useEffect(() => {
    const interval = setInterval(() => {
      setFlux((f) => +(98.0 + Math.sin(Date.now() / 1200) * 1.5 + (Math.random() - 0.5) * 0.4).toFixed(1));
      setCoreFreq((cf) => Math.floor(1420 + Math.cos(Date.now() / 1500) * 18 + (Math.random() - 0.5) * 6));
      setEntropy((e) => +(0.04 + Math.abs(Math.sin(Date.now() / 2000)) * 0.015).toFixed(3));
    }, 280);
    return () => clearInterval(interval);
  }, []);

  // Mouse Parallax 3D Perspective
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 120 };
  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [12, -12]), springConfig);
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-12, 12]), springConfig);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Dimensions
  const dim = {
    sm: { width: 140, height: 140, scale: 0.35 },
    md: { width: 280, height: 280, scale: 0.7 },
    lg: { width: 440, height: 440, scale: 1.0 },
    hero: { width: 560, height: 560, scale: 1.25 },
  }[size];

  // Status color theme
  const theme = {
    RUNNING: { primary: '#00f2fe', secondary: '#0284c7', glow: 'rgba(0, 242, 254, 0.65)', label: 'ACTIVE DISPATCH' },
    PLANNING: { primary: '#8b5cf6', secondary: '#6366f1', glow: 'rgba(139, 92, 246, 0.65)', label: 'COORDINATING' },
    AWAITING_APPROVAL: { primary: '#f59e0b', secondary: '#d97706', glow: 'rgba(245, 158, 11, 0.65)', label: 'NEURAL LOCK' },
    FAILED: { primary: '#ef4444', secondary: '#dc2626', glow: 'rgba(239, 68, 68, 0.65)', label: 'CORE ANOMALY' },
    COMPLETED: { primary: '#00f2fe', secondary: '#10b981', glow: 'rgba(0, 242, 254, 0.65)', label: 'SYSTEM OPTIMAL' },
  }[status] || { primary: '#00f2fe', secondary: '#0284c7', glow: 'rgba(0, 242, 254, 0.65)', label: 'ONLINE' };

  return (
    <motion.div
      style={{
        perspective: 1200,
        rotateX: interactive ? rotateX : 0,
        rotateY: interactive ? rotateY : 0,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`relative select-none flex flex-col items-center justify-center ${className}`}
    >
      <div
        style={{ width: dim.width, height: dim.height }}
        className="relative flex items-center justify-center"
      >
        {/* Ambient Core Lighting Glow */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full blur-3xl opacity-30 animate-pulse"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }}
        />

        {/* =========================================================================
            LAYER A: OUTER TECHNICAL RING (Measurement marks, ticks, labels)
            ========================================================================= */}
        <svg
          viewBox="0 0 500 500"
          className="absolute inset-0 h-full w-full pointer-events-none"
          style={{ animation: 'spin-cw 80s linear infinite' }}
        >
          {/* Outer hairline circle */}
          <circle cx="250" cy="250" r="236" fill="none" stroke={theme.primary} strokeWidth="1" strokeOpacity="0.25" />
          <circle cx="250" cy="250" r="228" fill="none" stroke={theme.primary} strokeWidth="1" strokeDasharray="4 6" strokeOpacity="0.4" />

          {/* 72 Measurement tick marks around perimeter */}
          {Array.from({ length: 72 }).map((_, i) => {
            const angle = (i * 360) / 72;
            const isMajor = i % 6 === 0;
            const r1 = isMajor ? 218 : 224;
            const r2 = 234;
            const rad = (angle * Math.PI) / 180;
            const x1 = 250 + r1 * Math.cos(rad);
            const y1 = 250 + r1 * Math.sin(rad);
            const x2 = 250 + r2 * Math.cos(rad);
            const y2 = 250 + r2 * Math.sin(rad);
            return (
              <line
                key={`tick-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={theme.primary}
                strokeWidth={isMajor ? 2 : 1}
                strokeOpacity={isMajor ? 0.8 : 0.35}
              />
            );
          })}

          {/* Cardinal degree labels */}
          <text x="250" y="28" fill={theme.primary} fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle" opacity="0.75" letterSpacing="2">
            000° // NORTH
          </text>
          <text x="474" y="253" fill={theme.primary} fontSize="9" fontFamily="JetBrains Mono" textAnchor="end" opacity="0.75" letterSpacing="2">
            090°
          </text>
          <text x="250" y="478" fill={theme.primary} fontSize="9" fontFamily="JetBrains Mono" textAnchor="middle" opacity="0.75" letterSpacing="2">
            180° // SOUTH
          </text>
          <text x="26" y="253" fill={theme.primary} fontSize="9" fontFamily="JetBrains Mono" textAnchor="start" opacity="0.75" letterSpacing="2">
            270°
          </text>
        </svg>

        {/* =========================================================================
            LAYER B: COUNTER-ROTATING LUMINOUS ARC SECTORS & CHEVRONS
            ========================================================================= */}
        <svg
          viewBox="0 0 500 500"
          className="absolute inset-0 h-full w-full pointer-events-none"
          style={{ animation: 'spin-ccw 38s linear infinite' }}
        >
          {/* Segmented heavy arc brackets */}
          <circle
            cx="250"
            cy="250"
            r="200"
            fill="none"
            stroke={theme.primary}
            strokeWidth="4"
            strokeDasharray="90 35 15 35"
            strokeOpacity="0.7"
            strokeLinecap="round"
          />
          <circle
            cx="250"
            cy="250"
            r="192"
            fill="none"
            stroke={theme.secondary}
            strokeWidth="1.5"
            strokeDasharray="40 15 10 15 60 20"
            strokeOpacity="0.5"
          />

          {/* Tri-chevron orbital markers */}
          {[0, 120, 240].map((deg) => (
            <g key={`chev-${deg}`} transform={`rotate(${deg} 250 250)`}>
              <polygon
                points="250,44 256,56 250,53 244,56"
                fill={theme.primary}
                opacity="0.9"
              />
              <circle cx="250" cy="62" r="2" fill={theme.primary} opacity="0.6" />
            </g>
          ))}
        </svg>

        {/* =========================================================================
            LAYER C: RADIAL SEGMENTED GAUGES & ORBITAL PARTICLES
            ========================================================================= */}
        <svg
          viewBox="0 0 500 500"
          className="absolute inset-0 h-full w-full pointer-events-none"
          style={{ animation: 'spin-cw 22s linear infinite' }}
        >
          {/* Segmented power meter ring */}
          <circle
            cx="250"
            cy="250"
            r="164"
            fill="none"
            stroke={theme.primary}
            strokeWidth="6"
            strokeDasharray="6 8"
            strokeOpacity="0.45"
          />
          <circle
            cx="250"
            cy="250"
            r="150"
            fill="none"
            stroke={theme.primary}
            strokeWidth="1"
            strokeDasharray="18 6 4 6"
            strokeOpacity="0.6"
          />

          {/* Orbiting data nodes */}
          <circle cx="250" cy="94" r="3.5" fill="#ffffff" filter="drop-shadow(0 0 4px #00f2fe)" />
          <circle cx="390" cy="310" r="2.5" fill={theme.primary} />
          <circle cx="110" cy="310" r="2.5" fill={theme.primary} />
        </svg>

        {/* =========================================================================
            LAYER E: 360° RADAR SWEEPING BEAM
            ========================================================================= */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ animation: 'spin-cw 5.5s linear infinite' }}
        >
          <div
            className="w-full h-full rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, transparent 280deg, ${theme.glow} 340deg, ${theme.primary} 360deg)`,
              maskImage: 'radial-gradient(circle, transparent 35%, black 65%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 35%, black 65%, transparent 75%)',
              opacity: 0.45,
            }}
          />
        </div>

        {/* =========================================================================
            LAYER D: CENTRAL PULSING ARC REACTOR CORE
            ========================================================================= */}
        <div className="relative flex items-center justify-center">
          {/* Geometric hexagonal energy mesh ring */}
          <svg
            viewBox="0 0 200 200"
            className="w-28 h-28 pointer-events-none"
            style={{ animation: 'spin-ccw 14s linear infinite' }}
          >
            <polygon
              points="100,10 178,55 178,145 100,190 22,145 22,55"
              fill="none"
              stroke={theme.primary}
              strokeWidth="1.5"
              strokeOpacity="0.6"
            />
            <polygon
              points="100,28 162,64 162,136 100,172 38,136 38,64"
              fill="none"
              stroke={theme.secondary}
              strokeWidth="1"
              strokeDasharray="6 4"
              strokeOpacity="0.5"
            />
          </svg>

          {/* Concentric core lens */}
          <div
            className="absolute rounded-full border border-cyan-400/80 flex items-center justify-center shadow-[0_0_25px_rgba(0,242,254,0.7)]"
            style={{
              width: size === 'sm' ? 44 : 76,
              height: size === 'sm' ? 44 : 76,
              background: 'radial-gradient(circle, #ffffff 0%, #00f2fe 35%, #0284c7 70%, #020617 100%)',
              animation: 'pulse-glow 2.8s ease-in-out infinite alternate',
            }}
          >
            {/* Inner crystalline triangular iris */}
            <div
              className="w-1/2 h-1/2 rounded-full border border-white/90 bg-white/40 backdrop-blur-sm shadow-[0_0_12px_#ffffff]"
              style={{ animation: 'spin-cw 8s linear infinite' }}
            />
          </div>
        </div>

        {/* =========================================================================
            LAYER F: MICRO TECHNICAL READOUTS & TELEMETRY LABELS
            ========================================================================= */}
        {size !== 'sm' && (
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 text-[9px] font-mono tracking-widest text-cyan-400/70">
            <div className="flex justify-between">
              <span className="bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                CORE: MK-85
              </span>
              <span className="bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded text-cyan-300">
                {flux}% FLUX
              </span>
            </div>
            <div className="flex justify-between">
              <span className="bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                FREQ: {coreFreq}MHZ
              </span>
              <span className="bg-cyan-950/40 border border-cyan-800/40 px-1.5 py-0.5 rounded">
                Δ: {entropy}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sub-label banner when telemetry is enabled */}
      {showTelemetry && size !== 'sm' && (
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
          <span className="font-mono text-[11px] tracking-[0.25em] font-semibold text-cyan-300 uppercase">
            ARC CORE // {theme.label}
          </span>
        </div>
      )}
    </motion.div>
  );
}
