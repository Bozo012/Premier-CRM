// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/calendar/CalendarView.tsx. Week/Month grid layout
// unchanged; `forge-*` tokens -> this app's existing shadcn tokens. Real
// data and real "today" (the actual current date, not Base44's hardcoded
// fixture date) — props-driven only, no Supabase/action/fixture/auth
// imports.
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus } from 'lucide-react';

import type { CalendarEventModel } from '../_lib/forge-calendar-view-model';

const WEEK_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_SLOTS = Array.from({ length: 13 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`); // 7am - 7pm

const typeDot: Record<CalendarEventModel['kind'], string> = {
  job: 'bg-primary',
  'site-visit': 'bg-blue-500',
};

const typeBg: Record<CalendarEventModel['kind'], string> = {
  job: 'border-l-primary bg-orange-50',
  'site-visit': 'border-l-blue-500 bg-blue-50',
};

function getWeekDates(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface CalendarCallbacks {
  onOpenEvent: (route: string) => void;
  onChangeView: (view: 'week' | 'month') => void;
  onPrevPeriod: () => void;
  onNextPeriod: () => void;
  onToday: () => void;
  onScheduleWork: () => void;
}

export function CalendarView({
  events,
  weekStart,
  viewMode,
  callbacks,
}: {
  events: CalendarEventModel[];
  weekStart: Date;
  viewMode: 'week' | 'month';
  callbacks: CalendarCallbacks;
}) {
  const today = new Date();
  const todayKey = dateKey(today);
  const weekDates = getWeekDates(weekStart);

  const eventsByDate = new Map<string, CalendarEventModel[]>();
  for (const event of events) {
    eventsByDate.set(event.date, [...(eventsByDate.get(event.date) ?? []), event]);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 md:pb-10 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Service Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Real scheduled jobs and site visits from Forge&apos;s schedule.</p>
        </div>
        <button
          type="button"
          onClick={callbacks.onScheduleWork}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Schedule work
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={callbacks.onPrevPeriod}
            aria-label="Previous period"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={callbacks.onNextPeriod}
            aria-label="Next period"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={callbacks.onToday} className="ml-1 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted">
            Today
          </button>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => callbacks.onChangeView('week')}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-card-foreground'}`}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => callbacks.onChangeView('month')}
            className={`rounded-md px-3 py-1.5 text-xs font-bold transition ${viewMode === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-card-foreground'}`}
          >
            Month
          </button>
        </div>
        <div className="ml-auto hidden items-center gap-3 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" /> Job
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Site visit
          </span>
        </div>
      </div>

      {viewMode === 'week' ? (
        <WeekView weekDates={weekDates} todayKey={todayKey} eventsByDate={eventsByDate} onOpenEvent={callbacks.onOpenEvent} />
      ) : (
        <MonthView weekStart={weekStart} todayKey={todayKey} eventsByDate={eventsByDate} onOpenEvent={callbacks.onOpenEvent} />
      )}
    </main>
  );
}

function WeekView({
  weekDates,
  todayKey,
  eventsByDate,
  onOpenEvent,
}: {
  weekDates: Date[];
  todayKey: string;
  eventsByDate: Map<string, CalendarEventModel[]>;
  onOpenEvent: (route: string) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm md:block">
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/50">
          <div className="px-2 py-2" />
          {weekDates.map((d, i) => (
            <div key={i} className={`border-l border-border px-2 py-2 text-center ${dateKey(d) === todayKey ? 'bg-orange-50' : ''}`}>
              <div className="text-xs font-bold text-muted-foreground">{WEEK_DAY_LABELS[i]}</div>
              <div className={`text-lg font-bold ${dateKey(d) === todayKey ? 'text-primary' : 'text-card-foreground'}`}>{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {TIME_SLOTS.map((time) => (
            <div key={time} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
              <div className="px-2 py-3 text-right text-[10px] font-bold text-muted-foreground">{time}</div>
              {weekDates.map((d, di) => {
                const dayEvents = (eventsByDate.get(dateKey(d)) ?? []).filter((e) => e.startTime.slice(0, 2) === time.slice(0, 2));
                return (
                  <div key={di} className={`min-h-[3rem] border-l border-border p-1 ${dateKey(d) === todayKey ? 'bg-orange-50/30' : ''}`}>
                    {dayEvents.map((e) => (
                      <button
                        key={`${e.kind}-${e.id}`}
                        type="button"
                        onClick={() => onOpenEvent(e.route)}
                        className={`mb-1 block w-full truncate rounded-md border-l-4 px-2 py-1 text-left text-[11px] font-semibold transition hover:shadow-sm ${typeBg[e.kind]}`}
                      >
                        <div className="truncate text-card-foreground">{e.title}</div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                          {e.startTime}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 md:hidden">
        {weekDates.map((d, i) => {
          const dayEvents = eventsByDate.get(dateKey(d)) ?? [];
          if (dayEvents.length === 0) return null;
          return (
            <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="text-sm font-bold text-card-foreground">
                  {WEEK_DAY_LABELS[i]}, {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                {dateKey(d) === todayKey ? <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">Today</span> : null}
              </div>
              <div className="space-y-2">
                {dayEvents.map((e) => (
                  <button
                    key={`${e.kind}-${e.id}`}
                    type="button"
                    onClick={() => onOpenEvent(e.route)}
                    className="flex w-full items-start gap-2 rounded-lg border border-border p-2 text-left transition hover:bg-muted/30"
                  >
                    <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${typeDot[e.kind]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-card-foreground">{e.title}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {e.startTime} · {e.endLabel}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden="true" />
                        {e.propertyName}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white ${e.kind === 'job' ? 'bg-primary' : 'bg-blue-500'}`}>{e.kindLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {weekDates.every((d) => (eventsByDate.get(dateKey(d)) ?? []).length === 0) ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">No scheduled work this week.</p>
        ) : null}
      </div>
    </>
  );
}

function MonthView({
  weekStart,
  todayKey,
  eventsByDate,
  onOpenEvent,
}: {
  weekStart: Date;
  todayKey: string;
  eventsByDate: Map<string, CalendarEventModel[]>;
  onOpenEvent: (route: string) => void;
}) {
  const monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((monthStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-7 border-b border-border bg-muted/50">
        {WEEK_DAY_LABELS.map((d) => (
          <div key={d} className="border-l border-border px-2 py-2 text-center text-xs font-bold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === monthStart.getMonth();
          const dayEvents = eventsByDate.get(dateKey(d)) ?? [];
          return (
            <div
              key={i}
              className={`min-h-[5rem] border-l border-t border-border p-1 ${dateKey(d) === todayKey ? 'bg-orange-50' : inMonth ? '' : 'bg-muted/20'}`}
            >
              <div className={`mb-1 text-xs font-bold ${dateKey(d) === todayKey ? 'text-primary' : inMonth ? 'text-card-foreground' : 'text-muted-foreground/50'}`}>{d.getDate()}</div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={`${e.kind}-${e.id}`}
                    type="button"
                    onClick={() => onOpenEvent(e.route)}
                    className={`block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-semibold text-white ${e.kind === 'job' ? 'bg-primary' : 'bg-blue-500'}`}
                  >
                    {e.startTime} {e.title}
                  </button>
                ))}
                {dayEvents.length > 3 ? <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 3} more</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
