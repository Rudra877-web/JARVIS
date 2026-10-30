import { AnimatePresence, motion } from 'framer-motion';
import { Download, Eye, Maximize2, Sparkles, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { jarvisSound } from '../../lib/sound';

interface MediaItem {
  id: string;
  url: string;
  title: string;
  date: string;
  type: string;
  desc?: string;
}

const DEFAULT_ARTIFACTS: MediaItem[] = [
  {
    id: 'art-1',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    title: 'Arc Reactor Core Circuitry',
    date: 'SCHEMATIC // MK-85',
    type: 'blueprint',
    desc: 'High-energy palladium flux pathways and quantum micro-inductors.',
  },
  {
    id: 'art-2',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    title: 'Neural Network Synapse Matrix',
    date: 'TOPOLOGY // 4-AGENT',
    type: 'neural',
    desc: 'Coordinator, Researcher, Analyst, and Reviewer entanglement mesh.',
  },
  {
    id: 'art-3',
    url: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=1200&q=80',
    title: 'Holographic Projection Grid',
    date: 'OPTICAL // CALIBRATION',
    type: 'hologram',
    desc: 'Phase-coherent spatial interference pattern for HUD depth rendering.',
  },
];

export function MediaGalleryModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>(DEFAULT_ARTIFACTS);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  useEffect(() => {
    if (!open) return;
    try {
      const saved = JSON.parse(localStorage.getItem('nexus_holographic_gallery') || '[]');
      if (saved.length > 0) {
        setItems([...saved, ...DEFAULT_ARTIFACTS]);
      }
    } catch {
      // ignore
    }
  }, [open]);

  const selectItem = (item: MediaItem) => {
    jarvisSound.playClick();
    setSelected(item);
    setZoomLevel(1);
  };

  const deleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    jarvisSound.playAlert();
    const filtered = items.filter((i) => i.id !== id);
    setItems(filtered);
    if (selected?.id === id) setSelected(null);
    try {
      const saved = JSON.parse(localStorage.getItem('nexus_holographic_gallery') || '[]');
      localStorage.setItem('nexus_holographic_gallery', JSON.stringify(saved.filter((i: any) => i.id !== id)));
    } catch {
      // ignore
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative flex h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-cyan-500/40 bg-[#030712] p-5 shadow-[0_0_60px_rgba(0,242,254,0.2)] overflow-hidden"
        >
          {/* Cyber Corner Marks */}
          <span className="pointer-events-none absolute left-2 top-2 text-cyan-400 font-mono text-xs">┌</span>
          <span className="pointer-events-none absolute right-2 top-2 text-cyan-400 font-mono text-xs">┐</span>
          <span className="pointer-events-none absolute left-2 bottom-2 text-cyan-400 font-mono text-xs">└</span>
          <span className="pointer-events-none absolute right-2 bottom-2 text-cyan-400 font-mono text-xs">┘</span>

          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-900/60 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-cyan-400" />
              <h2 className="font-mono text-xs font-semibold tracking-[0.25em] text-cyan-300 uppercase">
                HOLOGRAPHIC ARTIFACT VAULT // GALLERY
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded border border-cyan-900 bg-cyan-950/40 p-1.5 text-cyan-400 hover:text-cyan-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Main Body */}
          <div className="mt-4 flex flex-1 gap-4 overflow-hidden">
            {/* Thumbnails Sidebar */}
            <div className="w-72 shrink-0 space-y-2.5 overflow-y-auto pr-1">
              <p className="font-mono text-[10px] text-cyan-500 uppercase tracking-wider mb-1">
                Archived Visual Artifacts ({items.length})
              </p>
              {items.map((item) => (
                <div
                  key={item.id}
                  onClick={() => selectItem(item)}
                  className={`group relative flex cursor-pointer gap-2.5 rounded-lg border p-2 transition-all ${
                    selected?.id === item.id
                      ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_15px_rgba(0,242,254,0.3)]'
                      : 'border-cyan-950 bg-black/40 hover:border-cyan-800 hover:bg-cyan-950/20'
                  }`}
                >
                  <img
                    src={item.url}
                    alt={item.title}
                    className="h-16 w-20 rounded object-cover filter contrast-125 brightness-90 border border-cyan-900/50"
                  />
                  <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
                    <div>
                      <p className="truncate font-mono text-xs font-medium text-cyan-200 group-hover:text-cyan-100">
                        {item.title}
                      </p>
                      <p className="truncate font-mono text-[10px] text-cyan-600">{item.date}</p>
                    </div>
                    {item.type === 'snapshot' && (
                      <button
                        onClick={(e) => deleteItem(item.id, e)}
                        className="self-end text-zinc-600 hover:text-red-400 transition-colors"
                        title="Delete snapshot"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Main Holographic Viewing Frame */}
            <div className="relative flex flex-1 flex-col items-center justify-center rounded-lg border border-cyan-900/80 bg-black/70 p-4 overflow-hidden">
              {selected ? (
                <>
                  {/* Framing Brackets */}
                  <div className="pointer-events-none absolute inset-4 border border-cyan-500/20 z-10">
                    <div className="absolute -top-1 -left-1 h-3 w-3 border-t-2 border-l-2 border-cyan-400" />
                    <div className="absolute -top-1 -right-1 h-3 w-3 border-t-2 border-r-2 border-cyan-400" />
                    <div className="absolute -bottom-1 -left-1 h-3 w-3 border-b-2 border-l-2 border-cyan-400" />
                    <div className="absolute -bottom-1 -right-1 h-3 w-3 border-b-2 border-r-2 border-cyan-400" />
                  </div>

                  {/* Zoom Controls */}
                  <div className="absolute top-6 right-6 z-20 flex gap-1.5 rounded-lg border border-cyan-800/80 bg-black/80 p-1">
                    <button
                      onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.25))}
                      className="rounded p-1 text-cyan-400 hover:text-white"
                      title="Zoom In"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setZoomLevel((z) => Math.max(0.75, z - 0.25))}
                      className="rounded p-1 text-cyan-400 hover:text-white"
                      title="Zoom Out"
                    >
                      <ZoomOut className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setZoomLevel(1)}
                      className="rounded p-1 text-cyan-400 hover:text-white"
                      title="Reset Zoom"
                    >
                      <Maximize2 className="h-4 w-4" />
                    </button>
                    <a
                      href={selected.url}
                      download={`nexus-artifact-${selected.id}.png`}
                      className="rounded p-1 text-cyan-400 hover:text-white"
                      title="Download Artifact"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>

                  {/* Image with dynamic zoom */}
                  <div className="relative flex flex-1 items-center justify-center overflow-hidden w-full h-full">
                    <motion.img
                      src={selected.url}
                      alt={selected.title}
                      style={{ scale: zoomLevel }}
                      transition={{ duration: 0.2 }}
                      className="max-h-[80%] max-w-[90%] rounded-lg object-contain shadow-[0_0_40px_rgba(0,242,254,0.25)] border border-cyan-500/30 filter contrast-110"
                    />
                  </div>

                  {/* Description Footer */}
                  <div className="w-full border-t border-cyan-900/60 pt-3 flex justify-between items-end z-20">
                    <div>
                      <h3 className="font-mono text-sm font-semibold text-cyan-200">
                        {selected.title}
                      </h3>
                      {selected.desc && (
                        <p className="font-mono text-xs text-cyan-600 mt-0.5">{selected.desc}</p>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-cyan-500">
                      MAGNIFICATION: {(zoomLevel * 100).toFixed(0)}%
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center text-center">
                  <Eye className="h-10 w-10 text-cyan-800 mb-2 animate-pulse" />
                  <p className="font-mono text-xs text-cyan-500">
                    SELECT AN ARTIFACT OR CAPTURE AN OPTICAL SNAPSHOT TO INSPECT
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
