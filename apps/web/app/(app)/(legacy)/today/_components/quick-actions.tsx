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
    <nav className="order-2 flex flex-wrap items-center gap-2 sm:order-1" aria-label="Quick actions">
      {actions.map((action) => (
        <Link
          key={action.id}
          href={action.href}
          className="flex min-h-12 items-center gap-2 rounded-lg border bg-card px-3 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="text-sm font-bold text-card-foreground">{action.label}</span>
        </Link>
      ))}
    </nav>
  );
}
