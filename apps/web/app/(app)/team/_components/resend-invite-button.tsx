'use client';
// Client component: needs local pending state + router.refresh() after resending.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { resendInviteAction } from '../actions';

export function ResendInviteButton({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleResend = () => {
    const fd = new FormData();
    fd.set('inviteId', inviteId);
    startTransition(async () => {
      const result = await resendInviteAction(null, fd);
      if (result.success) {
        toast.success(
          result.data.emailSent
            ? `Invite resent to ${result.data.invite.email}.`
            : `Invite marked as resent, but the email failed to send. Share the link manually.`
        );
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not resend the invite.');
      }
    });
  };

  return (
    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleResend}>
      {isPending ? 'Resending…' : 'Resend'}
    </Button>
  );
}
