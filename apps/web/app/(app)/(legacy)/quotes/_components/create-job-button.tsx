'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { createJobFromAcceptedQuoteAction } from '../../estimates/actions';

interface CreateJobButtonProps {
  quoteId: string;
}

export function CreateJobButton({ quoteId }: CreateJobButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('quoteId', quoteId);
    startTransition(async () => {
      const result = await createJobFromAcceptedQuoteAction(null, fd);
      if (result.success) {
        toast.success('Job created.');
        router.push(`/jobs/${result.data.jobId}`);
      } else {
        toast.error(result.error ?? 'Failed to create job.');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {isPending ? 'Creating job…' : 'Create job'}
      </button>
    </form>
  );
}
