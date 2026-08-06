'use client';

// Client component: buttons trigger server actions and refresh on success.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { startSiteVisitAction, undoSiteVisitStartAction, cancelSiteVisitAction } from '../actions';

interface LifecycleButtonsProps {
  siteVisitId: string;
  status: string;
  hideStart?: boolean;
}

export function LifecycleButtons({ siteVisitId, status, hideStart = false }: LifecycleButtonsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (fn: () => Promise<{ success: boolean; error?: string }>, successMessage: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.success) {
        toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error ?? 'Action failed.');
      }
    });
  };

  const handleStart = () => {
    const fd = new FormData();
    fd.set('siteVisitId', siteVisitId);
    run(() => startSiteVisitAction(null, fd), 'Site visit started.');
  };

  const handleUndoStart = () => {
    const fd = new FormData();
    fd.set('siteVisitId', siteVisitId);
    run(() => undoSiteVisitStartAction(null, fd), 'Start undone.');
  };

  const handleCancel = () => {
    const reason = window.prompt('Reason for cancelling this site visit?');
    if (!reason) return;
    const fd = new FormData();
    fd.set('siteVisitId', siteVisitId);
    fd.set('reason', reason);
    run(() => cancelSiteVisitAction(null, fd), 'Site visit cancelled.');
  };

  const buttons: React.ReactNode[] = [];

  if (status === 'scheduled' && !hideStart) {
    buttons.push(
      <button
        key="start"
        type="button"
        onClick={handleStart}
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        Start visit
      </button>
    );
  }

  if (status === 'in_progress') {
    buttons.push(
      <button
        key="undo"
        type="button"
        onClick={handleUndoStart}
        disabled={isPending}
        className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        Undo start
      </button>
    );
  }

  if (status === 'awaiting_scheduling' || status === 'scheduled') {
    buttons.push(
      <button
        key="cancel"
        type="button"
        onClick={handleCancel}
        disabled={isPending}
        className="inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        Cancel visit
      </button>
    );
  }

  if (buttons.length === 0) return null;
  return <>{buttons}</>;
}
