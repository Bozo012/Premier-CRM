import { KanbanSquare, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';

export function TodayViewToggle({ activeView }: { activeView: 'today' | 'board' }) {
  return (
    <div
      className="order-1 flex shrink-0 items-center self-start rounded-lg border bg-card p-1 sm:order-2"
      role="group"
      aria-label="Dashboard view"
    >
      <Link
        href="/today"
        aria-current={activeView === 'today' ? 'page' : undefined}
        className={
          activeView === 'today'
            ? 'flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground'
            : 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground'
        }
      >
        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
        Today
      </Link>
      <Link
        href="/today?view=board"
        aria-current={activeView === 'board' ? 'page' : undefined}
        className={
          activeView === 'board'
            ? 'flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground'
            : 'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground'
        }
      >
        <KanbanSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Board
      </Link>
    </div>
  );
}
