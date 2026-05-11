// "use client" — needs useActionState, useTransition, and clipboard API
'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { sendQuoteAction, type SendQuoteActionState } from '../actions';

interface SendQuoteButtonProps {
  quoteId: string;
  status: string;
}

export function SendQuoteButton({ quoteId, status }: SendQuoteButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState(
    async (prev: SendQuoteActionState | null, formData: FormData) => {
      const result = await sendQuoteAction(prev, formData);

      if (result.success) {
        const fullUrl = `${window.location.origin}${result.data.quoteUrl}`;

        startTransition(() => {
          router.refresh();
        });

        try {
          await navigator.clipboard.writeText(fullUrl);
          toast.success('Quote sent — customer link copied to clipboard.', {
            description: fullUrl,
            duration: 8000,
          });
        } catch {
          toast.success('Quote marked as sent.', {
            description: `Customer link: ${fullUrl}`,
            duration: 10000,
          });
        }
      } else {
        toast.error(result.error ?? 'Could not send quote. Please try again.');
      }

      return result;
    },
    null
  );

  if (status !== 'draft') {
    return null;
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <Button
        type="submit"
        disabled={isPending || state?.success === true}
        variant="default"
        size="sm"
      >
        {isPending ? 'Sending…' : 'Send quote'}
      </Button>
    </form>
  );
}
