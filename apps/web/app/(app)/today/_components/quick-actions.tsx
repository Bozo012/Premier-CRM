import Link from 'next/link';

import { Button } from '@/components/ui/button';

export interface QuickActionItem {
  href: string;
  id: string;
  label: string;
}

// Presentation-only (Layer 3). The list passed in is already
// capability-filtered by page.tsx (Layer 1, the only layer allowed to call
// hasCapability()) — this component never decides which actions the
// current user can perform, it only renders whatever it's given. If the
// list is empty (e.g. a viewer with zero write capabilities), the section
// renders nothing rather than an empty grid.
export function QuickActions({ actions }: { actions: QuickActionItem[] }) {
  if (actions.length === 0) return null;

  // BASE44-REPLACEABLE: markup/classNames below are representative only —
  // real Base44 output would replace this JSX 1:1, same props in/out. The
  // capability-filtered `actions` list itself must never be re-derived here.
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Button key={action.id} asChild variant="outline" className="h-16 justify-start px-4 text-left text-sm sm:text-base">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
