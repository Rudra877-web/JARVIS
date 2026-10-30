import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  MinusCircle,
  ShieldQuestion,
  X,
  XCircle,
} from 'lucide-react';
import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { jarvisSound } from '../lib/sound';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/** Floating Holographic Panel with cyber corner reticles */
export function Card({
  className,
  children,
  ...p
}: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'relative rounded-xl border border-cyan-500/25 bg-[#040919]/80 backdrop-blur-md shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8),0_0_15px_rgba(0,242,254,0.05)] transition-all hover:border-cyan-500/40 hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.8),0_0_20px_rgba(0,242,254,0.12)]',
        className
      )}
      {...p}
    >
      {/* Corner reticles */}
      <span className="pointer-events-none absolute left-1.5 top-1.5 font-mono text-[9px] text-cyan-500/50 leading-none select-none">
        ┌
      </span>
      <span className="pointer-events-none absolute right-1.5 top-1.5 font-mono text-[9px] text-cyan-500/50 leading-none select-none">
        ┐
      </span>
      <span className="pointer-events-none absolute left-1.5 bottom-1.5 font-mono text-[9px] text-cyan-500/50 leading-none select-none">
        └
      </span>
      <span className="pointer-events-none absolute right-1.5 bottom-1.5 font-mono text-[9px] text-cyan-500/50 leading-none select-none">
        ┘
      </span>

      {/* Top subtle cyan energy hairline */}
      <div className="pointer-events-none absolute inset-x-4 top-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />

      {children}
    </div>
  );
}

export function CardHeader({
  title,
  action,
  subtitle,
}: {
  title: ReactNode;
  action?: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-cyan-900/40 px-4 py-3">
      <div>
        <h2 className="text-[13px] font-mono font-semibold tracking-wide text-cyan-100 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 font-mono text-[11px] text-cyan-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-cyan-900/30 pb-3">
      <div>
        <h1 className="font-mono text-lg font-bold tracking-[0.12em] text-cyan-100 uppercase flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-sm bg-cyan-400 shadow-[0_0_8px_#00f2fe]" />
          {title}
        </h1>
        {description && <p className="mt-0.5 font-mono text-xs text-cyan-600">{description}</p>}
      </div>
      <div className="flex items-center gap-2">{actions}</div>
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  onClick,
  ...p
}: BtnProps) {
  const v = {
    primary:
      'bg-cyan-500 text-black hover:bg-cyan-400 border-cyan-300 shadow-[0_0_15px_rgba(0,242,254,0.35)] font-semibold',
    secondary:
      'bg-[#061026] text-cyan-200 hover:bg-[#0c1a3b] hover:text-white border-cyan-800/60 shadow-[0_0_10px_rgba(0,242,254,0.08)]',
    ghost:
      'bg-transparent text-cyan-400 hover:text-cyan-100 hover:bg-cyan-950/30 border-transparent',
    danger:
      'bg-red-950/40 text-red-300 hover:bg-red-900/50 border-red-500/40 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
  }[variant];

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !loading) {
      jarvisSound.playClick();
    }
    if (onClick) onClick(e);
  };

  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg border font-mono tracking-wider transition-all disabled:cursor-not-allowed disabled:opacity-50 select-none',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
        v,
        className
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      {...p}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const fieldCls =
  'w-full rounded-lg border border-cyan-900/60 bg-[#02050f]/80 px-3 py-2 font-mono text-[13px] text-cyan-100 placeholder:text-cyan-900/60 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 aria-[invalid=true]:border-red-500/60 transition-colors';

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block font-mono text-xs font-medium text-cyan-400/80">
        {label}
      </label>
      {children(id, error || hint ? msgId : undefined)}
      {(error || hint) && (
        <p
          id={msgId}
          role={error ? 'alert' : undefined}
          className={cx('mt-1 font-mono text-xs', error ? 'text-red-400' : 'text-cyan-600')}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...p} className={cx(fieldCls, p.className)} />
);
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea {...p} className={cx(fieldCls, 'font-[inherit]', p.className)} />
);

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        'animate-pulse rounded-md bg-cyan-950/30 border border-cyan-900/20',
        className
      )}
      aria-hidden
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center font-mono">
      {icon && (
        <div className="mb-1 rounded-full border border-cyan-900/60 bg-[#040919] p-3 text-cyan-400 shadow-[0_0_15px_rgba(0,242,254,0.15)]">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold tracking-wide text-cyan-100">{title}</p>
      {description && <p className="max-w-sm text-xs text-cyan-600">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/30 px-3 py-2 font-mono text-xs text-red-300 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" aria-hidden />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

const STATUS: Record<string, { cls: string; icon: ReactNode; label?: string }> = {
  PENDING: {
    cls: 'text-zinc-400 bg-zinc-900/40 border-zinc-700/40',
    icon: <CircleDashed className="h-3 w-3" />,
  },
  PLANNING: {
    cls: 'text-violet-300 bg-violet-950/40 border-violet-500/40 shadow-[0_0_8px_rgba(139,92,246,0.3)]',
    icon: <Loader2 className="h-3 w-3 animate-spin text-violet-400" />,
  },
  AWAITING_APPROVAL: {
    cls: 'text-amber-300 bg-amber-950/40 border-amber-500/40 shadow-[0_0_8px_rgba(245,158,11,0.3)]',
    icon: <ShieldQuestion className="h-3 w-3 text-amber-400" />,
    label: 'AWAITING APPROVAL',
  },
  RUNNING: {
    cls: 'text-cyan-300 bg-cyan-950/50 border-cyan-400/50 shadow-[0_0_10px_rgba(0,242,254,0.35)]',
    icon: <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />,
  },
  VERIFYING: {
    cls: 'text-violet-300 bg-violet-950/40 border-violet-500/40',
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  COMPLETED: {
    cls: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]',
    icon: <CheckCircle2 className="h-3 w-3 text-emerald-400" />,
  },
  FAILED: {
    cls: 'text-red-300 bg-red-950/40 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
    icon: <XCircle className="h-3 w-3 text-red-400" />,
  },
  CANCELLED: {
    cls: 'text-zinc-400 bg-zinc-900/40 border-zinc-700/40',
    icon: <Ban className="h-3 w-3" />,
  },
  SKIPPED: {
    cls: 'text-zinc-500 bg-zinc-900/30 border-zinc-800/40',
    icon: <MinusCircle className="h-3 w-3" />,
  },
  VERIFIED: {
    cls: 'text-emerald-300 bg-emerald-950/40 border-emerald-500/40',
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  NEEDS_HUMAN_REVIEW: {
    cls: 'text-amber-300 bg-amber-950/40 border-amber-500/40',
    icon: <ShieldQuestion className="h-3 w-3" />,
    label: 'NEEDS HUMAN REVIEW',
  },
  REJECTED: {
    cls: 'text-red-300 bg-red-950/40 border-red-500/40',
    icon: <XCircle className="h-3 w-3" />,
  },
  UNVERIFIED: {
    cls: 'text-zinc-400 bg-zinc-900/40 border-zinc-700/40',
    icon: <Clock className="h-3 w-3" />,
  },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.PENDING!;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase',
        s.cls
      )}
    >
      {s.icon}
      {s.label ?? status}
    </span>
  );
}

export const Chip = ({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'violet' | 'warn';
}) => (
  <span
    className={cx(
      'inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] tracking-wide',
      {
        default: 'border-cyan-900/50 bg-cyan-950/20 text-cyan-400',
        accent: 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200 shadow-[0_0_8px_rgba(0,242,254,0.2)]',
        violet: 'border-violet-500/40 bg-violet-950/30 text-violet-300',
        warn: 'border-amber-500/40 bg-amber-950/30 text-amber-300',
      }[tone]
    )}
  >
    {children}
  </span>
);

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative max-h-[90vh] w-full overflow-auto rounded-xl border border-cyan-500/40 bg-[#030714] p-5 shadow-[0_0_60px_rgba(0,242,254,0.25)]',
          wide ? 'max-w-2xl' : 'max-w-lg'
        )}
      >
        {/* Reticles */}
        <span className="pointer-events-none absolute left-2 top-2 font-mono text-xs text-cyan-400 select-none">
          ┌
        </span>
        <span className="pointer-events-none absolute right-2 top-2 font-mono text-xs text-cyan-400 select-none">
          ┐
        </span>
        <span className="pointer-events-none absolute left-2 bottom-2 font-mono text-xs text-cyan-400 select-none">
          └
        </span>
        <span className="pointer-events-none absolute right-2 bottom-2 font-mono text-xs text-cyan-400 select-none">
          ┘
        </span>

        <div className="flex items-center justify-between border-b border-cyan-900/60 pb-3">
          <h2 className="font-mono text-sm font-semibold tracking-wider text-cyan-100 uppercase">
            {title}
          </h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded p-1 text-cyan-500 hover:bg-cyan-950/60 hover:text-cyan-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'accent' | 'good' | 'bad';
}) {
  return (
    <Card className="p-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-cyan-500">{label}</p>
      <p
        className={cx(
          'mt-1.5 font-mono text-2xl font-bold tabular-nums tracking-wide',
          tone === 'accent' && 'text-cyan-300 drop-shadow-[0_0_10px_rgba(0,242,254,0.4)]',
          tone === 'good' && 'text-emerald-300 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]',
          tone === 'bad' && 'text-red-300 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]',
          !tone && 'text-zinc-100'
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1 font-mono text-xs text-cyan-700">{sub}</p>}
    </Card>
  );
}

export const MockBadge = () => (
  <span
    className="inline-flex items-center gap-1 rounded border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.25)]"
    title="Deterministic mock provider — no language model was used"
  >
    MOCK
  </span>
);
