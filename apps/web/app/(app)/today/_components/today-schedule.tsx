import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';

import type { ScheduleEntry } from '../_lib/view-model';

// Presentation-only (Layer 3). `entries` is a pre-merged, pre-sorted list
// of today's jobs and today's site visits (Layer 2's buildTodaySchedule) —
// this component performs no data access or ordering decisions itself.
export function TodaySchedule({ entries }: { entries: ScheduleEntry[] }) {
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s work</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length > 0 ? (
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={`${entry.kind}-${entry.id}`}>
                  <Link href={entry.href} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 space-y-0.5">
                      <span className="block truncate text-sm font-medium text-foreground">{entry.title}</span>
                      {entry.subtitle ? <span className="block truncate text-xs text-muted-foreground">{entry.subtitle}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusPill tone={entry.kind === 'site_visit' ? 'blue' : 'neutral'}>{entry.kind === 'site_visit' ? 'Site visit' : 'Job'}</StatusPill>
                      <span className="text-xs text-muted-foreground">{entry.timeLabel}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No jobs or site visits scheduled for today" />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
