'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { updateEstimateStatusAction } from '../actions';

interface AdvanceStatusButtonProps {
  estimateId: string;
  currentStatus: string;
}

interface Transition {
  buttonLabel: string;
  newStatus: string;
  showDatePicker: boolean;
}

const TRANSITIONS: Record<string, Transition> = {
  draft: {
    buttonLabel: 'Schedule site visit',
    newStatus: 'site_visit_scheduled',
    showDatePicker: true,
  },
  site_visit_scheduled: {
    buttonLabel: 'Mark site visit complete',
    newStatus: 'site_visit_complete',
    showDatePicker: false,
  },
};

export function AdvanceStatusButton({ estimateId, currentStatus }: AdvanceStatusButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const transition = TRANSITIONS[currentStatus];
  if (!transition) return null;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('estimateId', estimateId);
    fd.set('newStatus', transition.newStatus);
    startTransition(async () => {
      const result = await updateEstimateStatusAction(null, fd);
      if (result.success) {
        toast.success('Estimate status updated.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to update status.');
      }
    });
  };

  if (!transition.showDatePicker) {
    return (
      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          {isPending ? 'Updating…' : transition.buttonLabel}
        </button>
      </form>
    );
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        {transition.buttonLabel}
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3"
    >
      <div className="space-y-1">
        <label htmlFor="siteVisitAt" className="text-xs font-medium text-muted-foreground">
          Site visit date <span className="font-normal">(optional)</span>
        </label>
        <input
          id="siteVisitAt"
          name="siteVisitAt"
          type="date"
          className="flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {isPending ? 'Scheduling…' : 'Confirm'}
      </button>
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
