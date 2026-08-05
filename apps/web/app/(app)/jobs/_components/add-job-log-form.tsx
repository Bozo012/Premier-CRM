'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { addJobLogAction, type AddJobLogActionState, type JobLogType } from '../actions';

const LOG_TYPE_OPTIONS: Array<{ value: JobLogType; label: string }> = [
  { value: 'job_note_general', label: 'General note' },
  { value: 'job_note_material', label: 'Material note' },
  { value: 'job_note_safety', label: 'Safety note' },
];

export function AddJobLogForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isTransitionPending, startTransition] = useTransition();
  const [state, formAction, isActionPending] = useActionState<AddJobLogActionState | null, FormData>(
    addJobLogAction,
    null
  );

  useEffect(() => {
    if (!state) return;

    if (state.success) {
      toast.success('Job log added.');
      router.refresh();
      return;
    }

    toast.error(state.error ?? 'Could not add job log.');
  }, [router, state]);

  const isPending = isActionPending || isTransitionPending;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        startTransition(() => {
          formAction(formData);
          (event.target as HTMLFormElement).reset();
        });
      }}
      className="space-y-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <div className="space-y-1">
        <label htmlFor={`log-type-${jobId}`} className="text-xs font-medium text-muted-foreground">
          Log type
        </label>
        <select
          id={`log-type-${jobId}`}
          name="logType"
          defaultValue="job_note_general"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {LOG_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor={`log-message-${jobId}`} className="text-xs font-medium text-muted-foreground">
          Note
        </label>
        <textarea
          id={`log-message-${jobId}`}
          name="message"
          required
          maxLength={2000}
          rows={3}
          placeholder="What happened on this job?"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? 'Adding…' : 'Add log'}
        </Button>
        <p className="text-xs text-muted-foreground">Staff-only — never shown to the customer.</p>
      </div>
    </form>
  );
}
