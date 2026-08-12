'use client';

// Client component: local pending state + clears the textarea after a
// successful send (Customer / Staff Threaded Messaging staff side).
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { sendStaffReplyAction } from '../actions';

interface StaffReplyFormProps {
  threadId: string;
  /** owner/admin/employee only — enforced again server-side by the RPC regardless. */
  canReply: boolean;
}

export function StaffReplyForm({ threadId, canReply }: StaffReplyFormProps) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [isPending, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (!canReply) {
    return (
      <p className="rounded-xl border bg-muted px-3 py-2 text-sm text-muted-foreground">
        Your role does not permit replying to customers.
      </p>
    );
  }

  const send = () => {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await sendStaffReplyAction(threadId, body);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to send reply.');
        return;
      }
      setBody('');
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={5000}
        rows={3}
        placeholder="Reply to customer…"
        className="w-full rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="flex justify-end">
        <Button type="button" disabled={isPending || !body.trim()} onClick={send} className="min-h-11">
          {isPending ? 'Sending…' : 'Send reply'}
        </Button>
      </div>
    </div>
  );
}
