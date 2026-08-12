import { notFound } from 'next/navigation';

import { listCustomerThreadMessages, listCustomerThreads, markThreadReadByCustomer } from '@premier/db';

import { ForgeBackLink } from '@/components/forge/presentation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { CustomerReplyForm } from '../../_components/customer-reply-form';
import { PortalShell, requirePortalUser } from '../../_components/portal-shell';
import { resolveActivePortalAccount } from '../../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

interface PortalThreadDetailPageProps {
  params: Promise<{ threadId: string }>;
}

export default async function PortalThreadDetailPage({ params }: PortalThreadDetailPageProps) {
  const { threadId } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="messages"><></></PortalShell>;
  }

  // list_customer_threads() proves ownership; a bare list_customer_thread_
  // messages() call for an id the customer doesn't own returns zero rows
  // (proven server-side by its own auth.uid() join), so a 404 for "no
  // messages" reliably means "not yours or doesn't exist" — never a
  // browser-authoritative check.
  const [threadsResult, messagesResult] = await Promise.all([
    listCustomerThreads(supabase),
    listCustomerThreadMessages(supabase, threadId),
  ]);

  const thread = threadsResult.success ? threadsResult.data.find((t) => t.id === threadId) : undefined;
  if (!thread || !messagesResult.success || messagesResult.data.length === 0) {
    notFound();
  }

  await markThreadReadByCustomer(supabase, threadId);

  const messages = messagesResult.data;

  return (
    <PortalShell account={account} activeId="messages">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 lg:px-8">
        <ForgeBackLink href="/portal/messages">Messages</ForgeBackLink>

        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{thread.subject}</h1>
          <p className="text-sm text-muted-foreground">
            {thread.category ? `${thread.category} · ` : ''}
            {thread.status === 'closed' ? 'Closed' : 'Open'}
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Conversation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.senderType === 'customer'
                    ? 'ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground'
                    : 'mr-auto max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm'
                }
              >
                <p className="whitespace-pre-wrap">{message.body}</p>
                <p
                  className={
                    message.senderType === 'customer'
                      ? 'mt-1 text-xs text-primary-foreground/70'
                      : 'mt-1 text-xs text-muted-foreground'
                  }
                >
                  {message.senderType === 'customer' ? 'You' : 'Premier'} · {formatDateTime(message.createdAt)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        <CustomerReplyForm threadId={thread.id} />
      </main>
    </PortalShell>
  );
}
