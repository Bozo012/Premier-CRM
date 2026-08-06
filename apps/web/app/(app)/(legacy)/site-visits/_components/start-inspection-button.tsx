'use client';

// Client component: starts the guarded site-visit lifecycle RPC, then moves to the dedicated inspection route.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { startSiteVisitAction } from '../actions';

export function StartInspectionButton({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleStart = () => {
    const formData = new FormData();
    formData.set('siteVisitId', siteVisitId);

    startTransition(async () => {
      const result = await startSiteVisitAction(null, formData);
      if (result.success) {
        toast.success('Inspection started.');
        router.push(`/site-visits/${siteVisitId}/inspection`);
      } else {
        toast.error(result.error ?? 'Could not start inspection.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={isPending}
      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
    >
      {isPending ? 'Starting…' : 'Start inspection'}
    </button>
  );
}
