// Presentation-only design-system token: a single source of truth for the
// status-color vocabulary used across the redesigned Today page (handoff
// doc §13). Color is never the sole signal — every pill carries a text
// label alongside its color (handoff doc §12).
const TONES = {
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  blue: 'border-blue-200 bg-blue-50 text-blue-800',
} as const;

export type StatusTone = keyof typeof TONES;

export function StatusPill({ tone, children }: { tone: StatusTone; children: React.ReactNode }) {
  // BASE44-REPLACEABLE: markup/classNames below are representative only —
  // real Base44 output would replace this JSX 1:1, same props in/out.
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
