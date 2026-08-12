'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { scheduleJobAction, type ScheduleJobActionState } from '../actions';

function toIsoString(localValue: string): string | null {
  if (!localValue) return null;

  const parsed = new Date(localValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

export function ScheduleJobForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [scheduledStartLocal, setScheduledStartLocal] = useState('');
  const [scheduledEndLocal, setScheduledEndLocal] = useState('');
  const [dismissedConflicts, setDismissedConflicts] = useState(false);
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    ScheduleJobActionState | null,
    FormData
  >(scheduleJobAction, null);

  useEffect(() => {
    if (!state || !state.success) return;
    if (state.data.status !== 'scheduled') return;

    toast.success(
      state.data.notificationSent ? 'Job scheduled and customer notified.' : 'Job scheduled.'
    );
    router.refresh();
  }, [router, state]);

  useEffect(() => {
    if (state && !state.success) {
      toast.error(state.error ?? 'Could not schedule the job.');
    }
  }, [state]);

  const isPending = isActionPending || isTransitionPending;
  const conflicts =
    !dismissedConflicts && state && state.success && state.data.status === 'conflicts' ? state.data.conflicts : null;

  function submitSchedule(overrideConflicts: boolean) {
    const scheduledStart = toIsoString(scheduledStartLocal);
    if (!scheduledStart) {
      toast.error('Enter a valid scheduled start.');
      return;
    }

    const scheduledEnd = scheduledEndLocal ? toIsoString(scheduledEndLocal) : null;
    if (scheduledEndLocal && !scheduledEnd) {
      toast.error('Enter a valid scheduled end.');
      return;
    }

    setDismissedConflicts(false);
    const nextFormData = new FormData();
    nextFormData.append('jobId', jobId);
    nextFormData.append('scheduledStart', scheduledStart);
    nextFormData.append('scheduledEnd', scheduledEnd ?? '');
    if (overrideConflicts) nextFormData.append('overrideConflicts', 'true');

    startTransition(() => {
      formAction(nextFormData);
    });
  }

  if (conflicts) {
    return (
      <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
        <p className="font-medium text-amber-900 dark:text-amber-200">Schedule conflict</p>
        <p className="text-amber-800 dark:text-amber-300">Assigned crew already has:</p>
        <ul className="space-y-1">
          {conflicts.map((c) => (
            <li key={`${c.recordType}-${c.recordId}`} className="text-amber-800 dark:text-amber-300">
              {c.title ?? 'Untitled'} · {new Date(c.conflictStart).toLocaleString()}–
              {new Date(c.conflictEnd).toLocaleTimeString()}
              {c.propertyAddress ? ` · ${c.propertyAddress}` : ''}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => setDismissedConflicts(true)}>
            Change schedule
          </Button>
          <Button type="button" disabled={isPending} onClick={() => submitSchedule(true)}>
            {isPending ? 'Scheduling…' : 'Schedule anyway'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitSchedule(false);
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label
            htmlFor={`scheduled-start-${jobId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Scheduled start
          </label>
          <input
            id={`scheduled-start-${jobId}`}
            type="datetime-local"
            value={scheduledStartLocal}
            onChange={(event) => setScheduledStartLocal(event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            required
          />
        </div>
        <div className="space-y-1">
          <label
            htmlFor={`scheduled-end-${jobId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Scheduled end <span className="font-normal">(optional)</span>
          </label>
          <input
            id={`scheduled-end-${jobId}`}
            type="datetime-local"
            value={scheduledEndLocal}
            onChange={(event) => setScheduledEndLocal(event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Scheduling…' : 'Schedule work'}
        </Button>
        <p className="text-xs text-muted-foreground">
          This moves the job to scheduled and emails the customer the work window.
        </p>
      </div>
    </form>
  );
}
