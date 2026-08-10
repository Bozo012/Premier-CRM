import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { listPortalQuotes, type OwnedEstimateRef, type OwnedJobRef } from '../_lib/portal-quotes-invoices';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Preparing',
  sent: 'Review needed',
  viewed: 'Review needed',
  accepted: 'Accepted',
  declined: 'Declined',
  expired: 'Expired',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value)
  );
}

export default async function PortalQuotesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="quotes"><></></PortalShell>;
  }

  // Ownership confirmed via the RLS-scoped client before any service-role
  // detail fetch — the same pattern the dashboard already uses for jobs.
  const [jobsResult, requestsResult] = await Promise.all([
    portalClient
      .from('jobs')
      .select('id, title, org_id')
      .eq('customer_id', account.customerId),
    portalClient
      .from('service_requests')
      .select('estimate_id, request_number, service_title, org_id')
      .eq('customer_id', account.customerId)
      .not('estimate_id', 'is', null),
  ]);

  const jobs: OwnedJobRef[] = (jobsResult.data ?? []).map((job) => ({
    id: job.id,
    orgId: job.org_id,
    title: job.title,
  }));

  const estimates: OwnedEstimateRef[] = (requestsResult.data ?? [])
    .filter((row): row is typeof row & { estimate_id: string } => Boolean(row.estimate_id))
    .map((row) => ({
      estimateId: row.estimate_id,
      orgId: row.org_id,
      requestNumber: row.request_number,
      serviceTitle: row.service_title,
    }));

  const quotes = await listPortalQuotes({ jobs, estimates });

  return (
    <PortalShell account={account} activeId="quotes">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted-foreground">
            Review and respond to quotes Premier has sent for your properties. Approving or
            declining happens on the secure quote page.
          </p>
        </header>

        {quotes.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No quotes yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {quotes.map((quote) => (
              <li key={quote.id}>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {quote.title ?? quote.quoteNumber ?? 'Quote'}
                      </CardTitle>
                      <CardDescription>
                        {quote.quoteNumber ?? 'Pending number'} · {quote.sourceLabel} ·{' '}
                        {formatDate(quote.createdAt)}
                      </CardDescription>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">
                      {QUOTE_STATUS_LABELS[quote.status] ?? quote.status.replace(/_/g, ' ')}
                    </span>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-lg font-semibold">{formatCurrency(quote.total)}</p>
                    {quote.shareToken ? (
                      <Link
                        href={`/q/${quote.shareToken}`}
                        className="text-sm font-medium text-[#ea580c] underline-offset-4 hover:underline"
                      >
                        Review quote →
                      </Link>
                    ) : (
                      <p className="text-sm text-muted-foreground">Link not ready yet.</p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}
