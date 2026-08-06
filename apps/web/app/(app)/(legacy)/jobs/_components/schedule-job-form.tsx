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
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<
    ScheduleJobActionState | null,
    FormData
  >(scheduleJobAction, null);

  useEffect(() => {
    if (!state) return;

    if (state.success) {
      toast.success(
        state.data.notificationSent ? 'Job scheduled and customer notified.' : 'Job scheduled.'
      );
      router.refresh();
      return;
    }

    toast.error(state.error ?? 'Could not schedule the job.');
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

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

        const nextFormData = new FormData();
        nextFormData.append('jobId', jobId);
        nextFormData.append('scheduledStart', scheduledStart);
        nextFormData.append('scheduledEnd', scheduledEnd ?? '');

        startTransition(() => {
          formAction(nextFormData);
        });
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
