'use client';

// Client component: needs local pending/optimistic state around the
// publish/unpublish mutation (canPublishCustomerMedia, owner/admin only —
// docs/implementation/customer-safe-photo-visibility-design.md, PR #141/#142).
// Mirrors jobs/_components/publish-photo-control.tsx and
// estimates/_components/publish-photo-control.tsx exactly, scoped to
// site-visit-linked photos.
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { publishSiteVisitPhotoAction, unpublishSiteVisitPhotoAction } from '../actions';

interface PublishPhotoControlProps {
  vaultItemId: string;
  siteVisitId: string;
  initialCustomerVisible: boolean;
  /** Only owner/admin ever render this — enforced again server-side by the RPC regardless. */
  canPublish: boolean;
}

export function PublishPhotoControl({ vaultItemId, siteVisitId, initialCustomerVisible, canPublish }: PublishPhotoControlProps) {
  const [customerVisible, setCustomerVisible] = useState(initialCustomerVisible);
  const [isPending, startTransition] = useTransition();

  if (!canPublish) {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        {customerVisible ? 'Customer visible' : 'Internal'}
      </span>
    );
  }

  const toggle = () => {
    startTransition(async () => {
      const result = customerVisible
        ? await unpublishSiteVisitPhotoAction(vaultItemId, siteVisitId)
        : await publishSiteVisitPhotoAction(vaultItemId, siteVisitId);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to update photo visibility.');
        return;
      }
      setCustomerVisible(result.data.customerVisible);
      toast.success(result.data.customerVisible ? 'Photo published to customer.' : 'Photo removed from customer portal.');
    });
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        {customerVisible ? 'Customer visible' : 'Internal'}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={toggle}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
      >
        {customerVisible ? 'Remove from customer portal' : 'Publish to customer'}
      </button>
    </div>
  );
}
