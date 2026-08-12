import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createServiceClient, getActiveOrgContext, listThreadMessages, markThreadReadByStaff } from '@premier/db';
import { hasCapability, type OrgRole } from '@premier/shared';

import { ForgeBackLink, ForgeCard, ForgePage, ForgeSectionTitle } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { StaffReplyForm } from '../_components/staff-reply-form';

export const metadata: Metadata = { title: 'Messages' };

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

interface MessageThreadDetailPageProps {
  params: Promise<{ threadId: string }>;
}

export default async function MessageThreadDetailPage({ params }: MessageThreadDetailPageProps) {
  const { threadId } = await params;

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=/messages/${threadId}`);
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);
  if (!orgContext.success) {
    return (
      <ForgePage className="max-w-3xl gap-5">
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </ForgePage>
    );
  }

  const { orgId, role } = orgContext.data;
  const canReply = hasCapability(role as OrgRole, 'canReplyToCustomers');
  const serviceClient = createServiceClient();

  const { data: thread, error: threadError } = await serviceClient
    .from('communication_threads')
    .select('id, subject, category, status, customer_id, related_request_id, related_property_id')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (threadError || !thread) {
    return (
      <ForgePage className="max-w-3xl gap-5">
        <ForgeBackLink href="/messages">Messages</ForgeBackLink>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Conversation not found.
        </p>
      </ForgePage>
    );
  }

  const [messagesResult, customerResult, requestResult] = await Promise.all([
    listThreadMessages(serviceClient, threadId, orgId),
    serviceClient.from('customers').select('id, first_name, last_name, display_name, company_name').eq('id', thread.customer_id).maybeSingle(),
    thread.related_request_id
      ? serviceClient.from('service_requests').select('id, request_number, service_title').eq('id', thread.related_request_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  await markThreadReadByStaff(serviceClient, threadId, orgId);

  const messages = messagesResult.success ? messagesResult.data : [];
  const customer = customerResult.data;
  const customerName =
    customer?.company_name || customer?.display_name || [customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Customer';
  const relatedRequest = requestResult.data;

  return (
    <ForgePage className="max-w-3xl gap-5">
      <ForgeBackLink href="/messages">Messages</ForgeBackLink>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{thread.subject}</h1>
        <p className="text-sm text-muted-foreground">
          <Link href={`/customers/${thread.customer_id}`} className="font-medium underline-offset-2 hover:underline">
            {customerName}
          </Link>
          {thread.category ? ` · ${thread.category}` : ''}
        </p>
        {relatedRequest ? (
          <Link
            href={`/requests/${relatedRequest.id}`}
            className="inline-block text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
          >
            Related request: {relatedRequest.request_number} — {relatedRequest.service_title}
          </Link>
        ) : null}
      </header>

      <ForgeCard className="space-y-3">
        <ForgeSectionTitle>Conversation</ForgeSectionTitle>
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={
                message.senderType === 'staff'
                  ? 'ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground'
                  : 'mr-auto max-w-[85%] rounded-xl bg-muted px-3 py-2 text-sm'
              }
            >
              <p className="whitespace-pre-wrap">{message.body}</p>
              <p
                className={
                  message.senderType === 'staff'
                    ? 'mt-1 text-xs text-primary-foreground/70'
                    : 'mt-1 text-xs text-muted-foreground'
                }
              >
                {message.senderType === 'staff' ? 'Staff' : customerName} · {formatDateTime(message.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </ForgeCard>

      <StaffReplyForm threadId={thread.id} canReply={canReply} />
    </ForgePage>
  );
}
