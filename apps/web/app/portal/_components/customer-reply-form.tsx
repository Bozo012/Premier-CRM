'use client';

// Client component: needs local pending state and to clear the textarea
// after a successful send (Customer / Staff Threaded Messaging).
import { useActionState, useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';

import { sendCustomerMessageAction, type SendCustomerMessageActionState } from '../actions';

export function CustomerReplyForm({ threadId }: { threadId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<SendCustomerMessageActionState | null, FormData>(
    sendCustomerMessageAction,
    null
  );

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="threadId" value={threadId} />
      <textarea
        name="body"
        required
        maxLength={5000}
        rows={3}
        placeholder="Write a reply…"
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {state && !state.success ? <p className="text-xs font-semibold text-red-600">{state.error}</p> : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="min-h-11">
          {isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </form>
  );
}
