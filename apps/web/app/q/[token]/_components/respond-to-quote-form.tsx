// "use client" — needs useActionState, useTransition, and local toggle state
'use client';

import { useActionState, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { respondToQuoteAction, type RespondToQuoteActionState } from '../actions';

interface RespondToQuoteFormProps {
  token: string;
  status: string;
  validUntil: string | null;
}

export function RespondToQuoteForm({ token, status, validUntil }: RespondToQuoteFormProps) {
  const canRespond = status === 'sent' || status === 'viewed';
  const isExpired = validUntil ? new Date(validUntil) < new Date() : false;

  // Two independent form states — accept and decline share the same action but
  // track results separately so we can detect which one succeeded.
  const [acceptState, acceptFormAction] = useActionState(
    (prev: RespondToQuoteActionState | null, formData: FormData) =>
      respondToQuoteAction(prev, formData),
    null
  );
  const [declineState, declineFormAction] = useActionState(
    (prev: RespondToQuoteActionState | null, formData: FormData) =>
      respondToQuoteAction(prev, formData),
    null
  );

  const [, startTransition] = useTransition();
  const [declineExpanded, setDeclineExpanded] = useState(false);

  // Suppress TS warning — startTransition is used via form actions implicitly
  void startTransition;

  const accepted = acceptState?.success && acceptState.data.status === 'accepted';
  const declined = declineState?.success && declineState.data.status === 'declined';
  const acceptError = acceptState?.success === false ? acceptState.error : null;
  const declineError = declineState?.success === false ? declineState.error : null;

  if (!canRespond || isExpired) {
    return null;
  }

  if (accepted) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-5 text-center">
        <p className="text-base font-semibold text-green-800">Quote accepted</p>
        <p className="mt-1 text-sm text-green-700">
          Thank you — Premier has been notified and will be in touch shortly.
        </p>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="rounded-md border bg-muted/40 px-4 py-5 text-center">
        <p className="text-base font-semibold text-foreground">Quote declined</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your response has been recorded. Contact Premier if you have any questions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Accept */}
      <form action={acceptFormAction}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="response" value="accept" />
        <Button type="submit" className="w-full sm:w-auto">
          Accept this quote
        </Button>
      </form>

      {acceptError ? (
        <p className="text-sm text-red-600">{acceptError}</p>
      ) : null}

      {/* Decline — collapsed by default */}
      {declineExpanded ? (
        <form action={declineFormAction} className="space-y-3 rounded-md border bg-muted/30 p-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="response" value="decline" />

          <div className="space-y-1.5">
            <Label htmlFor="declineReason" className="text-sm font-medium">
              Reason for declining{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="declineReason"
              name="declineReason"
              rows={3}
              maxLength={500}
              placeholder="Let Premier know why you're declining…"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50"
            />
          </div>

          {declineError ? (
            <p className="text-sm text-red-600">{declineError}</p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm">
              Confirm decline
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeclineExpanded(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDeclineExpanded(true)}
        >
          Decline quote
        </Button>
      )}
    </div>
  );
}
