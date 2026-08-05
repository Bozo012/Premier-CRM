import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { History } from 'lucide-react';

import { getActiveOrgContext, type ActivityLogEntry } from '@premier/db';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

export const metadata: Metadata = { title: 'Activity Logs' };

export default async function ActivityLogsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/activity-logs');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);

  if (!orgContext.success) {
    return (
      <ForgePage className="max-w-6xl gap-5">
        <OrgContextError code={orgContext.code} message={orgContext.error} />
      </ForgePage>
    );
  }

  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .eq('org_id', orgContext.data.orgId)
    .order('created_at', { ascending: false })
    .limit(100);

  const entries = ((data as ActivityLogEntry[] | null) ?? []).map(toActivityRow);

  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Activity Logs</h1>
        <p className="text-sm text-muted-foreground">
          Review real workflow events recorded by Premier&apos;s server actions and database functions.
        </p>
      </header>

      {error ? (
        <ForgeCard className="border-red-200 bg-red-50 text-sm text-red-700">
          Failed to load activity logs. Refresh and try again.
        </ForgeCard>
      ) : entries.length === 0 ? (
        <ForgeCard className="grid min-h-[40vh] place-items-center text-center">
          <div>
            <History className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-bold">No activity yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">Workflow events will appear here as the CRM is used.</p>
          </div>
        </ForgeCard>
      ) : (
        <ForgeCard className="overflow-hidden p-0">
          <ol className="divide-y">
            {entries.map((entry) => (
              <li key={entry.id} className="grid gap-3 p-4 sm:grid-cols-[180px_1fr_auto] sm:items-center">
                <div>
                  <time className="text-sm font-bold text-foreground">{entry.dateLabel}</time>
                  <p className="text-xs text-muted-foreground">{entry.timeLabel}</p>
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground">{entry.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.entityTypeLabel} · {entry.eventTypeLabel}
                  </p>
                </div>
                <Link
                  href={entityHref(entry.entityType, entry.entityId)}
                  className="text-sm font-bold text-primary underline-offset-2 hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ol>
        </ForgeCard>
      )}

      <div className="flex flex-wrap gap-2">
        <ForgeStatusPill tone="neutral">Org scoped</ForgeStatusPill>
        <ForgeStatusPill tone="blue">RLS protected</ForgeStatusPill>
      </div>
    </ForgePage>
  );
}

function toActivityRow(entry: ActivityLogEntry) {
  const date = new Date(entry.created_at);
  return {
    id: entry.id,
    entityId: entry.entity_id,
    entityType: entry.entity_type,
    entityTypeLabel: labelize(entry.entity_type),
    eventTypeLabel: labelize(entry.event_type),
    message: entry.message?.trim() || labelize(entry.event_type),
    dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    timeLabel: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
  };
}

function entityHref(entityType: string, entityId: string): string {
  if (entityType === 'service_request') return `/requests/${entityId}`;
  if (entityType === 'site_visit') return `/site-visits/${entityId}`;
  if (entityType === 'estimate') return `/estimates/${entityId}`;
  if (entityType === 'quote') return `/quotes/${entityId}`;
  if (entityType === 'job') return `/jobs/${entityId}`;
  if (entityType === 'invoice') return `/invoices/${entityId}`;
  return '/today';
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
