'use client'; // Org-switch/sign-out trigger server actions and need router.refresh().

// Layer 2 adapter — binds the new Base44-exact ForgeShell to real Forge
// session actions, matching ../../customers/_components/customers-shell.tsx
// and ../../properties/_components/properties-shell.tsx exactly (same reused
// signOutAction/switchActiveOrgAction).
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ForgeShell } from '@/components/forge-shell/ForgeShell';
import type { ForgeShellCallbacks, ForgeShellData, MobileNavConfig } from '@/components/forge-shell/types';

import { signOutAction, switchActiveOrgAction } from '@/app/(app)/(legacy)/today/actions';

export function RequestsShell({
  shellData,
  mobileNav,
  children,
}: {
  shellData: ForgeShellData;
  mobileNav: MobileNavConfig;
  children: ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const callbacks: ForgeShellCallbacks = {
    onSwitchOrganization: (orgId) => {
      if (orgId === shellData.organization.id) return;
      const formData = new FormData();
      formData.set('orgId', orgId);
      startTransition(async () => {
        const result = await switchActiveOrgAction(null, formData);
        if (result.success) {
          toast.success('Switched organization.');
          router.refresh();
        } else {
          toast.error(result.error ?? 'Failed to switch organization.');
        }
      });
    },
    onSignOut: () => {
      void signOutAction();
    },
    onOpenAction: (actionId) => {
      if (actionId === 'account-profile') router.push('/settings');
    },
  };

  return (
    <ForgeShell shellData={shellData} callbacks={callbacks} mobileNav={mobileNav}>
      {children}
    </ForgeShell>
  );
}
