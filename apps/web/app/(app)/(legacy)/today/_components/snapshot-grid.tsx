import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import type { SnapshotItem } from '../_lib/view-model';

// Presentation-only (Layer 3). Operational/actionable counts only — no
// accounting totals or revenue figures (Kevin decision,
// docs/ux/forge-v1.1-ux-modernization-plan.md §10 item 4). Values are
// computed in page.tsx (Layer 1 fetch) and _lib/view-model.ts (Layer 2
// shaping) — this component performs no data access of its own.
export function SnapshotGrid({ items }: { items: SnapshotItem[] }) {
  // BASE44-REPLACEABLE: markup/classNames below are representative only —
  // real Base44 output would replace this JSX 1:1, same props in/out.
  // Layout adapted from Base44's OperationalSnapshot.tsx (approved Today
  // visual reference), flexes to the item count already supplied by Layer
  // 2 rather than assuming a fixed number of cards.
  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Actionable workload</p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Operational snapshot</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className="min-h-32 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-start justify-between">
              <span className="text-3xl font-bold tracking-tight text-card-foreground">{item.value}</span>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <span className="mt-2 block text-sm font-bold text-card-foreground">{item.label}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{item.helper}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
