import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildMarketingPortalUrl } from '@/lib/customer-portal-handoff';

import { PortalNav } from './portal-nav';
import { signOutCustomerPortal } from '../actions';
import type { ActivePortalAccount } from '../_lib/portal-session';

/**
 * Shared authenticated-portal chrome: sidebar/bottom nav + the "Portal
 * account not linked yet" fallback. Every /portal/(authenticated) page
 * resolves its own account via resolveActivePortalAccount() and passes the
 * result here so unauthenticated visitors redirect to the real marketing
 * sign-in (never a competing Forge login form) and unlinked accounts see
 * the same honest message the dashboard has always shown.
 */
export function PortalShell({
  account,
  activeId,
  children,
}: {
  account: ActivePortalAccount | null;
  activeId: string;
  children: ReactNode;
}) {
  if (!account) {
    return <UnlinkedAccountState />;
  }

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <PortalNav activeId={activeId} />
      <div className="flex-1 pb-16 md:pb-0">{children}</div>
    </div>
  );
}

export function requirePortalUser(hasUser: boolean): void {
  if (!hasUser) redirect(buildMarketingPortalUrl());
}

function UnlinkedAccountState() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Portal account not linked yet</CardTitle>
          <CardDescription>
            Your sign-in works, but we could not find an active customer account link yet.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Customer portal users are linked through customer_accounts, not org_members. Ask
            Premier to confirm your email if you expected to see requests here.
          </p>
          <form action={signOutCustomerPortal}>
            <Button type="submit" variant="outline">Sign out</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
