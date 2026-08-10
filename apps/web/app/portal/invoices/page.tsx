import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { listPortalInvoices, type OwnedJobRef } from '../_lib/portal-quotes-invoices';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Preparing',
  sent: 'Payment due',
  partial: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
  refunded: 'Refunded',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value)
  );
}

export default async function PortalInvoicesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="invoices"><></></PortalShell>;
  }

  const { data: jobsData } = await portalClient
    .from('jobs')
    .select('id, title, org_id')
    .eq('customer_id', account.customerId);

  const jobs: OwnedJobRef[] = (jobsData ?? []).map((job) => ({
    id: job.id,
    orgId: job.org_id,
    title: job.title,
  }));

  const invoices = await listPortalInvoices({ jobs });

  return (
    <PortalShell account={account} activeId="invoices">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Invoices sent for completed work. Contact Premier to arrange payment — there is no
            online payment option in the portal yet.
          </p>
        </header>

        {invoices.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No invoices yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">{invoice.invoiceNumber ?? 'Invoice'}</CardTitle>
                      <CardDescription>
                        {invoice.jobTitle} · Issued {formatDate(invoice.issuedDate)}
                        {invoice.dueDate ? ` · Due ${formatDate(invoice.dueDate)}` : ''}
                      </CardDescription>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">
                      {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status.replace(/_/g, ' ')}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <p>Total: <span className="font-medium text-foreground">{formatCurrency(invoice.total)}</span></p>
                      <p>Paid: <span className="font-medium text-foreground">{formatCurrency(invoice.amountPaid)}</span></p>
                      <p>Due: <span className="font-medium text-foreground">{formatCurrency(invoice.amountDue)}</span></p>
                    </div>
                    {invoice.shareToken ? (
                      <Link
                        href={`/i/${invoice.shareToken}`}
                        className="inline-block text-sm font-medium text-[#ea580c] underline-offset-4 hover:underline"
                      >
                        View full invoice →
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
