// "use client" — needs useActionState and useTransition for server action feedback
'use client';

import { useActionState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { resendQuoteEmailAction, type ResendQuoteEmailActionState } from '../actions';

interface ResendQuoteEmailButtonProps {
  quoteId: string;
}

export function ResendQuoteEmailButton({ quoteId }: ResendQuoteEmailButtonProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: ResendQuoteEmailActionState | null, formData: FormData) => {
      const result = await resendQuoteEmailAction(prev, formData);

      if (result.success) {
        toast.success('Quote email resent to customer.');
      } else {
        toast.error(result.error ?? 'Could not resend email. Please try again.');
      }

      return result;
    },
    null
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <Button
        type="submit"
        variant="outline"
        size="sm"
        disabled={isPending || state?.success === true}
      >
        {isPending ? 'Sending…' : state?.success ? 'Email sent' : 'Resend email'}
      </Button>
    </form>
  );
}
