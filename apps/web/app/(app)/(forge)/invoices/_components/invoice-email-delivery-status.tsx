// "use client" — needs useActionState, useEffect (initial status fetch), and clipboard API
'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import {
  getInvoiceEmailDeliveryStatusAction,
  retryInvoiceEmailAction,
  type InvoiceEmailDeliveryStatus,
  type RetryInvoiceEmailActionState,
} from '../actions';

interface InvoiceEmailDeliveryStatusProps {
  invoiceId: string;
  invoiceUrl: string; // relative path, e.g. /i/{token}
}

/**
 * Durable (survives a page refresh, unlike the send-button's toast)
 * indicator of whether the customer was actually emailed, plus recovery
 * actions when it failed. See docs/ops/invoice-cutover-readiness.md
 * BLOCKER 1 — this is the fix for "an invoice can be marked sent even if
 * the email was not delivered, with no signal to staff."
 */
export function InvoiceEmailDeliveryStatus({ invoiceId, invoiceUrl }: InvoiceEmailDeliveryStatusProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<InvoiceEmailDeliveryStatus | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    getInvoiceEmailDeliveryStatusAction(invoiceId)
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setStatus(result.data);
        } else {
          console.error('[invoice-email-delivery-status] status fetch failed:', result.error);
          setStatus('unknown');
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[invoice-email-delivery-status] status fetch threw:', error);
        setStatus('unknown');
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  const [, formAction, isRetrying] = useActionState(
    async (_prev: RetryInvoiceEmailActionState | null, formData: FormData) => {
      const result = await retryInvoiceEmailAction(_prev, formData);

      if (result.success) {
        setStatus(result.data.emailSent ? 'sent' : 'failed');
        startTransition(() => router.refresh());
        if (result.data.emailSent) {
          toast.success('Invoice email sent successfully.');
        } else {
          toast.error('Invoice is ready, but the email could not be sent.');
        }
      } else {
        toast.error(result.error ?? 'Could not retry email delivery.');
      }

      return result;
    },
    null
  );

  async function copyLink() {
    const fullUrl = `${window.location.origin}${invoiceUrl}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Customer link copied to clipboard.', { description: fullUrl });
    } catch {
      toast.info('Customer link', { description: fullUrl, duration: 10000 });
    }
  }

  return (
    <div className="space-y-2">
      {status === 'sent' ? (
        <p className="text-sm text-emerald-600">Invoice is ready and email was sent successfully.</p>
      ) : status === 'failed' ? (
        <p className="text-sm text-destructive">Invoice is ready, but the email could not be sent.</p>
      ) : status === 'loading' ? null : (
        <p className="text-sm text-muted-foreground">No email delivery attempt on record yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {status === 'failed' || status === 'unknown' ? (
          <form action={formAction}>
            <input type="hidden" name="invoiceId" value={invoiceId} />
            <Button type="submit" disabled={isPending || isRetrying} variant="outline" size="sm">
              {isRetrying ? 'Retrying…' : 'Retry email'}
            </Button>
          </form>
        ) : null}
        <Button type="button" onClick={copyLink} variant="outline" size="sm">
          Copy invoice link
        </Button>
      </div>
    </div>
  );
}
