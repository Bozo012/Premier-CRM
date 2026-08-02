'use client';

// Client component: select onChange must trigger a server action + refresh.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { AvailableOrgMembership } from '@premier/db';

import { switchActiveOrgAction } from '../actions';

export function OrgSwitcher({
  currentOrgId,
  availableOrgs,
}: {
  currentOrgId: string;
  availableOrgs: AvailableOrgMembership[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (orgId: string) => {
    if (orgId === currentOrgId) return;
    const fd = new FormData();
    fd.set('orgId', orgId);
    startTransition(async () => {
      const result = await switchActiveOrgAction(null, fd);
      if (result.success) {
        toast.success('Switched organization.');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to switch organization.');
      }
    });
  };

  return (
    <select
      value={currentOrgId}
      disabled={isPending}
      onChange={(e) => handleChange(e.target.value)}
      className="max-w-full truncate rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground disabled:opacity-50"
      aria-label="Switch active organization"
    >
      {availableOrgs.map((org) => (
        <option key={org.orgId} value={org.orgId}>
          {org.orgName} • {org.role}
        </option>
      ))}
    </select>
  );
}
