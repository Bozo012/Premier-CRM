'use client';
// Client component: needs the browser clipboard API and local "Copied" state.

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

interface CopyInviteLinkButtonProps {
  token: string;
}

/**
 * Fallback for sharing an invite link manually. Exists because invite email
 * delivery (Resend) silently no-ops when RESEND_API_KEY isn't configured —
 * without this, an owner has no way to get the invite link to the invitee at
 * all. Uses window.location.origin rather than NEXT_PUBLIC_APP_URL so it's
 * correct in any environment (local dev, preview deploys) without needing
 * that env var threaded through as a prop.
 */
export function CopyInviteLinkButton({ token }: CopyInviteLinkButtonProps) {
  const [justCopied, setJustCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/invite/${token}`;
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
