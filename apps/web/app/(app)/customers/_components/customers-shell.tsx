'use client'; // Org-switch/sign-out trigger server actions and need router.refresh().

// Layer 2 adapter — binds the new Base44-exact ForgeShell to real Forge
// session actions. Reuses the EXISTING signOutAction/switchActiveOrgAction
// server actions from the Today route (apps/web/app/(app)/today/actions.ts)
// rather than duplicating them — those actions are already real, already
// guarded (switch_active_org() RPC verifies membership server-side), and
// already used by the old shell's OrgSwitcher (app-topbar.tsx).
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

import { ForgeShell } from '@/components/forge-shell/ForgeShell';
import type { ForgeShellCallbacks, ForgeShellData, MobileNavConfig } from '@/components/forge-shell/types';

import { signOutAction, switchActiveOrgAction } from '@/app/(app)/today/actions';

export function CustomersShell({
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
