'use client';
// Client component: needs the browser clipboard API and local "Copied" state.

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface CopyInviteLinkButtonProps {
  token: string;
}

/**
 * Fallback for sharing the join link manually (Auth Reset architecture —
 * see team/actions.ts's createInviteAction). Only meaningful for the
 * existing-confirmed-user join path: /invite/[token]/continue requires the
 * visitor to already have a password to sign in with, so this link only
 * ever works for someone who already has an account. A brand-new invitee
 * has no such fallback — their only valid link is the one Supabase itself
 * emails via admin.inviteUserByEmail(), which this app never sees or
 * stores, so there is nothing else for this button to copy for them.
 *
 * Uses window.location.origin rather than NEXT_PUBLIC_APP_URL so it's
 * correct in any environment (local dev, preview deploys) without needing
 * that env var threaded through as a prop.
 */
export function CopyInviteLinkButton({ token }: CopyInviteLinkButtonProps) {
  const [justCopied, setJustCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/invite/${token}/continue`;
    try {
      await navigator.clipboard.writeText(url);
      setJustCopied(true);
      toast.success('Invite link copied.');
      setTimeout(() => setJustCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link. Copy it from here: ' + url);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
      {justCopied ? 'Copied!' : 'Copy invite link'}
    </Button>
  );
}
