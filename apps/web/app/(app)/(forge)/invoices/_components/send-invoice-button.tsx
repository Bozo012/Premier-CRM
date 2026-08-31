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
          toast.success('Invoice is ready and email was sent successfully.', {
            description: fullUrl,
            duration: 8000,
          });
        } else {
          // Email failed (or no address on file) — this must never read as
          // a success. A durable, non-toast indicator + Retry/Copy actions
          // also render below once the invoice is no longer a draft (see
          // InvoiceEmailDeliveryStatus), so this failure isn't only visible
          // for the few seconds this toast is on screen.
          try {
            await navigator.clipboard.writeText(fullUrl);
            toast.error('Invoice is ready, but the email could not be sent.', {
              description: `Customer link copied to clipboard: ${fullUrl}`,
              duration: 10000,
            });
          } catch {
            toast.error('Invoice is ready, but the email could not be sent.', {
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
