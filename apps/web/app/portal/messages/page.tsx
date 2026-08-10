import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PortalContactSheet } from '../_components/portal-contact-sheet';
import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { buildPortalContactViewModel, type PortalContactProperty } from '../_lib/portal-contact-view-model';
import { listPortalMessages } from '../_lib/portal-messages';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default async function PortalMessagesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="messages"><></></PortalShell>;
  }

  const [messages, propertiesResult, requestsResult] = await Promise.all([
    listPortalMessages({ customerId: account.customerId, orgId: account.orgId }),
    portalClient
      .from('customer_properties')
      .select('relationship, is_primary, properties(id, address_line_1, city, state, zip)')
      .eq('customer_id', account.customerId),
    portalClient
      .from('service_requests')
      .select('id, request_number, service_title, status, submitted_at')
      .eq('customer_id', account.customerId),
  ]);

  const contactModel = buildPortalContactViewModel({
    customerEmail: account.email,
    properties: (propertiesResult.data ?? []) as unknown as PortalContactProperty[],
    serviceRequests: requestsResult.data ?? [],
  });

  return (
    <PortalShell account={account} activeId="messages">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Messages</h1>
            <p className="text-sm text-muted-foreground">
              Your past messages to Premier. Replies come by the method you chose (phone, email,
              or text) — there is no in-app reply thread yet, so check your inbox or phone for a
              response.
            </p>
          </div>
          <PortalContactSheet model={contactModel} />
        </header>

        {messages.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No messages yet. Use &quot;Contact Premier&quot; to send one.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {messages.map((msg) => (
              <li key={msg.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{msg.subject}</CardTitle>
                    <CardDescription>
                      {msg.referenceNumber ?? 'Reference pending'} · {formatDate(msg.createdAt)}
                      {msg.category ? ` · ${msg.category}` : ''}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Looking for change-order discussion on a specific job? Those comments live on the job
          card on your{' '}
          <a href="/portal/dashboard#jobs" className="underline underline-offset-4">
            Home
          </a>{' '}
          page.
        </p>
      </main>
    </PortalShell>
  );
}
