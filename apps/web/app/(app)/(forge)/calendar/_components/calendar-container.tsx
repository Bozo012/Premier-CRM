'use client'; // Wires the ported CalendarView to router navigation (period/view URL params, event/schedule-work navigation).

// Layer 2 adapter — connects the portable, ported CalendarView presentation
// to real navigation: prev/next/today/view-mode change re-query the server
// via URL params (?start=YYYY-MM-DD&view=week|month) consumed by
// page.tsx's real listJobsScheduledInRange/getTodaySiteVisits calls — not
// client-side recomputation over a fixed fetch.
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { CalendarView, type CalendarCallbacks } from './calendar-view';
import type { CalendarEventModel } from '../_lib/forge-calendar-view-model';

function toDateParam(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function CalendarContainer({
  events,
  weekStart,
  viewMode,
}: {
  events: CalendarEventModel[];
  weekStart: Date;
  viewMode: 'week' | 'month';
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const callbacks = useMemo<CalendarCallbacks>(() => {
    const navigate = (nextStart: Date, nextView: 'week' | 'month') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('start', toDateParam(nextStart));
      params.set('view', nextView);
      router.push(`/calendar?${params.toString()}`);
    };

    return {
      onOpenEvent: (route) => router.push(route),
      onChangeView: (view) => navigate(weekStart, view),
      onPrevPeriod: () => {
        const next = new Date(weekStart);
        if (viewMode === 'week') next.setDate(next.getDate() - 7);
        else next.setMonth(next.getMonth() - 1);
        navigate(next, viewMode);
      },
      onNextPeriod: () => {
        const next = new Date(weekStart);
        if (viewMode === 'week') next.setDate(next.getDate() + 7);
        else next.setMonth(next.getMonth() + 1);
        navigate(next, viewMode);
      },
      onToday: () => navigate(new Date(), viewMode),
      // Real "Schedule Work" reuses the existing job-creation-with-schedule
      // flow (jobs/new, this slice's createJobWithScheduleAction) rather
      // than duplicating a second scheduling form on Calendar — matching
      // the task's explicit instruction to reuse scheduleJobAction/
      // scheduling forms, not build a parallel mechanism.
      onScheduleWork: () => router.push('/jobs/new'),
    };
  }, [router, searchParams, weekStart, viewMode]);

  return <CalendarView events={events} weekStart={weekStart} viewMode={viewMode} callbacks={callbacks} />;
}
