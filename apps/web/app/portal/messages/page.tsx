import Link from 'next/link';

import { listCustomerThreads } from '@premier/db';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { NewConversationSheet } from '../_components/new-conversation-sheet';
import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { buildPortalContactViewModel, type PortalContactProperty } from '../_lib/portal-contact-view-model';
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

  const [threadsResult, propertiesResult, requestsResult] = await Promise.all([
    listCustomerThreads(supabase),
    portalClient
      .from('customer_properties')
      .select('relationship, is_primary, properties(id, address_line_1, city, state, zip)')
      .eq('customer_id', account.customerId),
    portalClient
      .from('service_requests')
      .select('id, request_number, service_title, status, submitted_at')
      .eq('customer_id', account.customerId),
  ]);

  const threads = threadsResult.success ? threadsResult.data : [];
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
              Your conversations with Premier. Send a message and reply right here — no need to check
              email or phone for a response.
            </p>
          </div>
          <NewConversationSheet model={contactModel} />
        </header>

        {threads.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No conversations yet. Use &quot;New conversation&quot; to start one.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {threads.map((thread) => {
              const hasUnread = !thread.lastCustomerReadAt || new Date(thread.updatedAt) > new Date(thread.lastCustomerReadAt);
              return (
                <li key={thread.id}>
                  <Link href={`/portal/messages/${thread.id}`} className="block">
                    <Card className="transition hover:bg-muted/40">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle className="text-base">{thread.subject}</CardTitle>
                          {hasUnread ? (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                              New reply
                            </span>
                          ) : null}
                        </div>
                        <CardDescription>
                          {formatDate(thread.updatedAt)}
                          {thread.category ? ` · ${thread.category}` : ''}
                          {thread.status === 'closed' ? ' · Closed' : ''}
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}
