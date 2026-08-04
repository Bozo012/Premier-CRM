import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface ScheduleJob {
  id: string;
  scheduledTimeLabel: string;
  title: string;
}

// Presentation-only. Job list and formatted time labels are computed in
// page.tsx from the existing today-window jobs query — no data access here.
export function TodaySchedule({ jobs }: { jobs: ScheduleJob[] }) {
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s work</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobs.length > 0 ? (
            <ul className="divide-y">
              {jobs.map((job) => (
                <li key={job.id}>
                  <Link href={`/jobs/${job.id}`} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium text-foreground">{job.title}</span>
                    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {job.scheduledTimeLabel}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No jobs scheduled for today yet.</p>
          )}
          <Button asChild variant="outline">
            <Link href="/jobs">Review jobs</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
