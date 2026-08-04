// Shared design-system token — the single source of truth for the
// status-color vocabulary across Forge (Forge V1.1 UX modernization,
// Batch UX-A). Promoted from the Base44 compatibility spike
// (spike/base44-today-compat), where it was proven on /today, generalized
// with a `red` tone for error/destructive/denied states per the V1.1 plan.
// Color is never the sole signal — every pill carries a text label.
//
// Tone->token mapping adopts the status-surface palette from the approved
// Base44 Today visual reference (forge-today.css) via Forge's own CSS
// variables (app/globals.css) rather than literal Tailwind colors — this
// makes every existing StatusPill consumer app-wide dark-mode-correct for
// free, without a per-tone rewrite (tone names are unchanged, so no call
// site elsewhere in the app needs to change).
import { cn } from '@/lib/utils';

const TONES = {
  amber: 'border-transparent bg-[hsl(var(--st-warning-bg))] text-[hsl(var(--st-warning-fg))]',
  emerald: 'border-transparent bg-[hsl(var(--st-success-bg))] text-[hsl(var(--st-success-fg))]',
  blue: 'border-transparent bg-[hsl(var(--st-scheduled-bg))] text-[hsl(var(--st-scheduled-fg))]',
  red: 'border-transparent bg-[hsl(var(--st-error-bg))] text-[hsl(var(--st-error-fg))]',
  neutral: 'border-transparent bg-[hsl(var(--st-neutral-bg))] text-[hsl(var(--st-neutral-fg))]',
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
