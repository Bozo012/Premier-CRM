import { KanbanSquare, LayoutDashboard } from 'lucide-react';

export function TodayViewToggle() {
  return (
    <div
      className="order-1 flex shrink-0 items-center self-start rounded-lg border bg-card p-1 sm:order-2"
      role="group"
      aria-label="Dashboard view"
    >
      <button
        type="button"
        aria-pressed="true"
        className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
      >
        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
        Today
      </button>
      <button
        type="button"
        aria-pressed="false"
        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground"
        disabled
      >
        <KanbanSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Board
      </button>
    </div>
  );
}
