import Link from 'next/link';

import { Button } from '@/components/ui/button';

export interface QuickActionItem {
  href: string;
  id: string;
  label: string;
}

// Presentation-only — the action list itself stays defined in page.tsx
// (static routes, no data dependency), this component only renders it.
export function QuickActions({ actions }: { actions: QuickActionItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Button
            key={action.id}
            asChild
            variant="outline"
            className="h-16 justify-start px-4 text-left text-sm sm:text-base"
          >
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
