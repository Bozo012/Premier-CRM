import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { signOutCustomerPortal } from '../actions';
import { getServerSupabase } from '@/lib/supabase-server';

export default async function PortalAccountPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="account"><></></PortalShell>;
  }

  const { data: customer } = await portalClient
    .from('customers')
    .select('display_name, first_name, last_name, phone_primary, email')
    .eq('id', account.customerId)
    .maybeSingle();

  const displayName =
    customer?.display_name ??
    [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') ??
    null;

  return (
    <PortalShell account={account} activeId="account">
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground">
            Your portal sign-in and contact details on file with Premier.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>
              To change your name, phone, or email on file, contact Premier — portal profile
              editing isn&apos;t available yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {displayName ? (
              <p>
                <span className="text-muted-foreground">Name:</span> {displayName}
              </p>
            ) : null}
            <p>
              <span className="text-muted-foreground">Portal sign-in email:</span> {account.email}
            </p>
            {customer?.phone_primary ? (
              <p>
                <span className="text-muted-foreground">Phone:</span> {customer.phone_primary}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign out</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={signOutCustomerPortal}>
              <Button type="submit" variant="outline">Sign out</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </PortalShell>
  );
}
