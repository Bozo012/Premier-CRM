import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface SnapshotItem {
  helper: string;
  href: string;
  label: string;
  value: string;
}

// Presentation-only. Values are computed in page.tsx from data already
// fetched there (customer/property/job/request counts) — this component
// performs no data access of its own.
export function SnapshotGrid({ items }: { items: SnapshotItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Business snapshot
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {items.map((item) => (
          <Card key={item.label} className="border-t-4 border-t-primary/40 transition-colors hover:bg-muted/30">
            <Link
              href={item.href}
              className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <CardHeader className="pb-1">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">{item.value}</p>
                <p className="text-sm text-muted-foreground">{item.helper}</p>
              </CardContent>
            </Link>
          </Card>
        ))}
      </div>
    </section>
  );
}
