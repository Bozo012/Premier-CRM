'use client';

// Client component: triggers estimate generation, then navigates to it.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { generateEstimateFromSiteVisitAction } from '../actions';

export function GenerateEstimateButton({ siteVisitId }: { siteVisitId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await generateEstimateFromSiteVisitAction(siteVisitId);
      if (result.success) {
        toast.success('Estimate generated.');
        router.push(`/estimates/${result.data}`);
      } else {
        toast.error(result.error ?? 'Failed to generate estimate.');
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
    >
      {isPending ? 'Generating…' : 'Generate estimate'}
    </button>
  );
}
