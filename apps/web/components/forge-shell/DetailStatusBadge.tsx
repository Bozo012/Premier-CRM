// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/detail/DetailStatusBadge.tsx, unchanged except
// `forge-*` -> existing status tokens (bg-muted/text-muted-foreground plus
// the app's blue/emerald/amber/red literal Tailwind classes, matching what
// Base44 itself used — the app's `st-*` CSS variables back StatusPill's
// narrower 5-tone set (amber/emerald/blue/red/neutral) and don't have a
// distinct "warning" vs "danger" split the way DetailTone does, so this
// component keeps literal Tailwind color classes rather than reusing
// StatusPill).
import { AlertTriangle, CheckCircle2, CircleDot, Clock, XCircle } from 'lucide-react';

import type { DetailTone } from './recordDetail.types';

const map: Record<DetailTone, { cls: string; Icon: typeof CircleDot }> = {
  neutral: { cls: 'bg-muted text-muted-foreground', Icon: CircleDot },
  info: { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800', Icon: Clock },
  success: {
    cls: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800',
    Icon: CheckCircle2,
  },
  warning: {
    cls: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800',
    Icon: AlertTriangle,
  },
  danger: { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-800', Icon: XCircle },
};

/** Status is conveyed by text AND icon, never colour alone. */
export function DetailStatusBadge({ label, tone, size }: { label: string; tone: DetailTone; size?: 'sm' | 'md' }) {
  const { cls, Icon } = map[tone] || map.neutral;
  const pad = size === 'md' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold ${pad} ${cls}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
