import Link from 'next/link';
import { AlertTriangle, Clock, MapPin, User } from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';

import type { KanbanCardModel, KanbanStage } from '../_lib/view-model';

const columns: Array<{ id: KanbanStage; title: string; tone: 'blue' | 'amber' | 'emerald' | 'neutral' }> = [
  { id: 'scheduled', title: 'Scheduled', tone: 'blue' },
  { id: 'in_progress', title: 'In Progress', tone: 'neutral' },
  { id: 'on_hold', title: 'On Hold', tone: 'amber' },
  { id: 'completed', title: 'Completed', tone: 'emerald' },
];

export function TodayBoard({ cards }: { cards: KanbanCardModel[] }) {
  return (
    <section className="space-y-4" aria-labelledby="board-heading">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Work board</p>
        <h1 id="board-heading" className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Today&apos;s Kanban
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Jobs and site visits grouped by their real Premier workflow status.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {columns.map((column) => {
          const columnCards = cards.filter((card) => card.stage === column.id);
          return (
            <section key={column.id} className="min-w-0 rounded-2xl border bg-card shadow-sm">
              <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" aria-hidden="true" />
                  <h2 className="truncate text-sm font-bold uppercase tracking-wide text-card-foreground">{column.title}</h2>
                </div>
                <StatusPill tone={column.tone}>{columnCards.length}</StatusPill>
              </header>
              <div className="space-y-3 p-3">
                {columnCards.length === 0 ? (
                  <div className="grid min-h-24 place-items-center rounded-xl border border-dashed text-xs font-semibold text-muted-foreground">
                    No work here
                  </div>
                ) : (
                  columnCards.map((card) => <BoardCard key={card.id} card={card} />)
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function BoardCard({ card }: { card: KanbanCardModel }) {
  const priorityClass =
    card.priority === 'high' ? 'bg-destructive' : card.priority === 'normal' ? 'bg-primary' : 'bg-muted-foreground';

  return (
    <Link
      href={card.href}
      className="group relative block rounded-xl border bg-background p-3 pl-4 shadow-sm transition hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`${card.title} — ${card.customer}`}
    >
      <span className={`absolute bottom-3 left-0 top-3 w-1 rounded-full ${priorityClass}`} aria-hidden="true" />
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold leading-snug text-foreground">{card.title}</h3>
        {card.priority === 'high' ? <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /> : null}
      </div>
      <div className="mt-2 space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <User className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {card.customer}
        </p>
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="line-clamp-1">{card.property}</span>
        </p>
        {card.assignment ? <p className="text-xs font-semibold text-muted-foreground">{card.assignment}</p> : null}
      </div>
      {(card.timeLabel || card.flag) ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {card.timeLabel ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {card.timeLabel}
            </span>
          ) : null}
          {card.flag ? <StatusPill tone="amber">{card.flag}</StatusPill> : null}
        </div>
      ) : null}
    </Link>
  );
}
