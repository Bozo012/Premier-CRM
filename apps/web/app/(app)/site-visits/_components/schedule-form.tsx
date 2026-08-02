'use client';

// Client component: form submission with pending state + toast feedback.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { scheduleSiteVisitAction, rescheduleSiteVisitAction, cancelSiteVisitAppointmentAction } from '../actions';

interface ScheduleFormProps {
  siteVisitId: string;
  mode: 'schedule' | 'reschedule';
  currentAppointmentId: string | null;
}

export function ScheduleForm({ siteVisitId, mode, currentAppointmentId }: ScheduleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(mode === 'schedule');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('siteVisitId', siteVisitId);
    startTransition(async () => {
      const result = mode === 'schedule' ? await scheduleSiteVisitAction(null, fd) : await rescheduleSiteVisitAction(null, fd);
      if (result.success) {
        toast.success(mode === 'schedule' ? 'Site visit scheduled.' : 'Site visit rescheduled.');
        setExpanded(false);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to schedule.');
      }
    });
  };

  const handleCancelAppointment = () => {
    if (!currentAppointmentId) return;
    const reason = window.prompt('Reason for cancelling this appointment?');
    if (!reason) return;
    const fd = new FormData();
    fd.set('appointmentId', currentAppointmentId);
    fd.set('siteVisitId', siteVisitId);
    fd.set('reason', reason);
    startTransition(async () => {
      const result = await cancelSiteVisitAppointmentAction(null, fd);
      if (result.success) {
        toast.success('Appointment cancelled.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to cancel appointment.');
      }
    });
  };

  if (!expanded) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Reschedule
        </button>
        <button
          type="button"
          onClick={handleCancelAppointment}
          disabled={isPending}
          className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Cancel appointment
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1">
        <label htmlFor="start" className="text-xs font-medium text-muted-foreground">
          Start
        </label>
        <input
          id="start"
          name="start"
          type="datetime-local"
          required
          className="flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="end" className="text-xs font-medium text-muted-foreground">
          End
        </label>
        <input
          id="end"
          name="end"
          type="datetime-local"
          required
          className="flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      {mode === 'reschedule' ? (
        <div className="space-y-1">
          <label htmlFor="reason" className="text-xs font-medium text-muted-foreground">
            Reason
          </label>
          <input
            id="reason"
            name="reason"
            type="text"
            className="flex h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      ) : null}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-8 items-center rounded-md bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {isPending ? 'Saving…' : 'Confirm'}
      </button>
      {mode === 'reschedule' ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Close
        </button>
      ) : null}
    </form>
  );
}
