// "use client" — needs useActionState, useTransition, and clipboard API
'use client';

import { useActionState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { sendInvoiceAction, type SendInvoiceActionState } from '../actions';

interface SendInvoiceButtonProps {
  invoiceId: string;
  status: string;
}

export function SendInvoiceButton({ invoiceId, status }: SendInvoiceButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [state, formAction] = useActionState(
    async (prev: SendInvoiceActionState | null, formData: FormData) => {
      const result = await sendInvoiceAction(prev, formData);

      if (result.success) {
        const fullUrl = `${window.location.origin}${result.data.invoiceUrl}`;

        startTransition(() => {
          router.refresh();
        });

        if (result.data.emailSent) {
          toast.success('Invoice sent and emailed to customer.', {
            description: fullUrl,
            duration: 8000,
          });
        } else {
          try {
            await navigator.clipboard.writeText(fullUrl);
            toast.success('Invoice sent — customer link copied to clipboard.', {
              description: fullUrl,
              duration: 8000,
            });
          } catch {
            toast.success('Invoice marked as sent.', {
              description: `Customer link: ${fullUrl}`,
              duration: 10000,
            });
          }
        }
      } else {
        toast.error(result.error ?? 'Could not send invoice. Please try again.');
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
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Button type="submit" disabled={isPending || state?.success === true} variant="default" size="sm">
        {isPending ? 'Sending…' : 'Send invoice'}
      </Button>
    </form>
  );
}
