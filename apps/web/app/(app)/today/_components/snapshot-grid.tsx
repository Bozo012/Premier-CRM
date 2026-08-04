import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import type { SnapshotItem } from '../_lib/view-model';

// Presentation-only (Layer 3). Operational/actionable counts only — no
// accounting totals or revenue figures (Kevin decision,
// docs/ux/forge-v1.1-ux-modernization-plan.md §10 item 4). Values are
// computed in page.tsx (Layer 1 fetch) and _lib/view-model.ts (Layer 2
// shaping) — this component performs no data access of its own.
export function SnapshotGrid({ items }: { items: SnapshotItem[] }) {
  // BASE44-REPLACEABLE: markup/classNames below are representative only —
  // real Base44 output would replace this JSX 1:1, same props in/out.
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Operational snapshot</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <Card key={item.label} className="border-t-4 border-t-primary/40 transition-colors hover:bg-muted/30">
            <Link href={item.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-4xl font-bold leading-none tracking-tight">{item.value}</p>
                <p className="text-sm text-muted-foreground">{item.helper}</p>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
