import Link from 'next/link';
import { Plus } from 'lucide-react';

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
  // capability-filtered `actions` list itself must never be re-derived
  // here. Visual treatment adopted from Base44's QuickActions.tsx.
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-[.14em] text-muted-foreground">Quick actions</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-3 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
              <Plus className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold text-card-foreground sm:text-base">{action.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
