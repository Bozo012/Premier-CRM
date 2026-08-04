// Shared design-system token — the single source of truth for the
// status-color vocabulary across Forge (Forge V1.1 UX modernization,
// Batch UX-A). Promoted from the Base44 compatibility spike
// (spike/base44-today-compat), where it was proven on /today, generalized
// with a `red` tone for error/destructive/denied states per the V1.1 plan.
// Color is never the sole signal — every pill carries a text label.
import { cn } from '@/lib/utils';

const TONES = {
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
  red: 'border-red-200 bg-red-50 text-red-800',
  neutral: 'border-border bg-muted text-muted-foreground',
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONES[tone],
        className
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
