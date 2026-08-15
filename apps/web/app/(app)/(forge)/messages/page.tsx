import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createServiceClient, getActiveOrgContext, listOrgThreads } from '@premier/db';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { MessagesShell } from './_components/messages-shell';

export const metadata: Metadata = { title: 'Messages' };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default async function MessagesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/messages');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);
  if (!orgContext.success) {
    return (
      <ForgePage className="max-w-4xl gap-5">
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </ForgePage>
    );
  }

  const { orgId } = orgContext.data;
  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContext.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const serviceClient = createServiceClient();

  const threadsResult = await listOrgThreads(serviceClient, orgId);
  const threads = threadsResult.success ? threadsResult.data : [];

  const customerIds = [...new Set(threads.map((t) => t.customerId))];
  const requestIds = [...new Set(threads.map((t) => t.relatedRequestId).filter((id): id is string => !!id))];
  const threadIds = threads.map((t) => t.id);

  const [customersResult, requestsResult, latestMessagesResult] = await Promise.all([
    customerIds.length > 0
      ? serviceClient.from('customers').select('id, first_name, last_name, display_name, company_name').in('id', customerIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null; display_name: string | null; company_name: string | null }[] }),
    requestIds.length > 0
      ? serviceClient.from('service_requests').select('id, request_number').in('id', requestIds)
      : Promise.resolve({ data: [] as { id: string; request_number: string }[] }),
    threadIds.length > 0
      ? serviceClient
          .from('communication_messages')
          .select('thread_id, body, sender_type, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { thread_id: string; body: string; sender_type: string; created_at: string }[] }),
  ]);

  const customerNameById = new Map(
    (customersResult.data ?? []).map((c) => [
      c.id,
      c.company_name || c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Customer',
    ])
  );
  const requestNumberById = new Map((requestsResult.data ?? []).map((r) => [r.id, r.request_number]));
  const latestMessageByThread = new Map<string, { body: string; senderType: string }>();
  for (const message of latestMessagesResult.data ?? []) {
    if (!latestMessageByThread.has(message.thread_id)) {
      latestMessageByThread.set(message.thread_id, { body: message.body, senderType: message.sender_type });
    }
  }

  return (
    <MessagesShell shellData={shellData} mobileNav={mobileNav}>
      <ForgePage className="max-w-4xl gap-5">
        <header>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Messages</h1>
          <p className="text-sm text-muted-foreground">Customer conversations for this organization.</p>
        </header>

        {threads.length === 0 ? (
          <ForgeCard>
            <p className="text-sm text-muted-foreground">No customer conversations yet.</p>
          </ForgeCard>
        ) : (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {threads.map((thread) => {
              const hasUnread = !thread.lastStaffReadAt || new Date(thread.updatedAt) > new Date(thread.lastStaffReadAt);
              const latest = latestMessageByThread.get(thread.id);
              return (
                <li key={thread.id}>
                  <Link href={`/messages/${thread.id}`} className="block px-4 py-3 transition hover:bg-muted/40">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-foreground">{customerNameById.get(thread.customerId) ?? 'Customer'}</p>
                      <div className="flex items-center gap-2">
                        {hasUnread ? <ForgeStatusPill tone="amber">Unread</ForgeStatusPill> : null}
                        <span className="text-xs text-muted-foreground">{formatDateTime(thread.updatedAt)}</span>
                      </div>
                    </div>
                    <p className="mt-0.5 text-sm font-medium">{thread.subject}</p>
                    {latest ? (
                      <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                        {latest.senderType === 'staff' ? 'You: ' : ''}
                        {latest.body}
                      </p>
                    ) : null}
                    {thread.relatedRequestId && requestNumberById.get(thread.relatedRequestId) ? (
                      <p className="mt-1 text-xs text-muted-foreground">Re: {requestNumberById.get(thread.relatedRequestId)}</p>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </ForgePage>
    </MessagesShell>
  );
}
