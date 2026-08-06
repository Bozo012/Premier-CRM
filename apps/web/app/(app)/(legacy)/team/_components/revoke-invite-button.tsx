'use client';
// Client component: needs local pending state + router.refresh() after revoking.

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { revokeInviteAction } from '../actions';

export function RevokeInviteButton({ inviteId }: { inviteId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRevoke = () => {
    const fd = new FormData();
    fd.set('inviteId', inviteId);
    startTransition(async () => {
      const result = await revokeInviteAction(null, fd);
      if (result.success) {
        toast.success('Invite revoked.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Could not revoke the invite.');
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={handleRevoke}
      className="text-red-600 hover:text-red-700"
    >
      {isPending ? 'Revoking…' : 'Revoke'}
    </Button>
  );
}
