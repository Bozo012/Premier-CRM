import { notFound } from 'next/navigation';

import { createServiceClient, getQuoteByToken, type QuoteLineItemSummary } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { RespondToQuoteForm } from './_components/respond-to-quote-form';

interface PublicQuotePageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicQuotePage({ params }: PublicQuotePageProps) {
  const { token } = await params;

  // Basic UUID format guard — a malformed token is a 404, not an error page.
  if (!isUuid(token)) {
    notFound();
  }

  const client = createServiceClient();
  const result = await getQuoteByToken(client, { token });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }
    // DB error — show a user-friendly message rather than throwing.
    return (
      <PageShell>
        <ErrorPanel>
          This quote could not be loaded right now. Please try again or contact Premier.
        </ErrorPanel>
      </PageShell>
    );
  }

  const { customer, job, lineItems, property, quote } = result.data;

  // Stamp viewed_at on first open only.
  // The WHERE conditions make this idempotent: if status is already anything
  // other than 'sent', or viewed_at is already set, no update is written.
  if (quote.status === 'sent') {
    await client
      .from('quotes')
      .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('share_token', token)
      .eq('status', 'sent')
      .is('viewed_at', null);
  }

  const quoteTitle = quote.title?.trim() || quote.quote_number || 'Quote';
  const customerName = customer?.displayName ?? null;
  const propertyAddress = property ? formatAddress(property) : null;

  return (
    <PageShell>
      {/* Header */}
      <header className="space-y-1 border-b pb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Premier Property Maintenance
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{quoteTitle}</h1>
        {quote.quote_number ? (
          <p className="text-sm text-muted-foreground">Quote {quote.quote_number}</p>
        ) : null}
      </header>

      {/* Recipient info */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Prepared for
          </p>
          <p className="font-medium text-foreground">{customerName ?? 'Customer'}</p>
          {propertyAddress ? (
            <p className="text-sm text-muted-foreground">{propertyAddress}</p>
          ) : null}
        </div>

        <div className="space-y-1 sm:text-right">
          {job ? (
            <>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Related job
              </p>
              <p className="font-medium text-foreground">
                {job.job.title.trim() || job.job.job_number || 'Service job'}
              </p>
            </>
          ) : null}
          {quote.valid_until ? (
            <p className="text-sm text-muted-foreground">
              Valid until {formatDate(quote.valid_until)}
            </p>
          ) : null}
        </div>
      </section>

      {/* Intro text */}
      {quote.intro_text?.trim() ? (
        <p className="text-sm text-foreground">{quote.intro_text.trim()}</p>
      ) : null}

      {/* Line items */}
      <section className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 text-left">Description</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit price</th>
              <th className="px-4 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lineItems.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-sm text-muted-foreground"
                >
                  No line items have been added to this quote yet.
                </td>
              </tr>
            ) : (
              lineItems.map((li) => <LineItemRow key={li.item.id} lineItem={li} />)
            )}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section className="flex justify-end">
        <div className="w-full max-w-xs space-y-2">
          <TotalRow label="Subtotal" value={formatMoney(quote.subtotal)} />
          {(quote.discount_amount ?? 0) > 0 ? (
            <TotalRow label="Discount" value={`– ${formatMoney(quote.discount_amount)}`} />
          ) : null}
          {(quote.tax_pct ?? 0) > 0 ? (
            <TotalRow
              label={`Tax (${quote.tax_pct}%)`}
              value={formatMoney(quote.tax_amount)}
            />
          ) : null}
          <div className="border-t pt-2">
            <TotalRow label="Total" value={formatMoney(quote.total)} bold />
          </div>
        </div>
      </section>

      {/* Outro / terms */}
      {quote.outro_text?.trim() ? (
        <p className="text-sm text-foreground">{quote.outro_text.trim()}</p>
      ) : null}
      {quote.terms?.trim() ? (
        <div className="rounded-md border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Terms &amp; conditions
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{quote.terms.trim()}</p>
        </div>
      ) : null}

      {/* Customer response */}
      {quote.status === 'accepted' ? (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-5 text-center">
          <p className="text-base font-semibold text-green-800">Quote accepted</p>
          <p className="mt-1 text-sm text-green-700">
            Thank you — Premier has been notified and will be in touch shortly.
          </p>
        </div>
      ) : quote.status === 'declined' ? (
        <div className="rounded-md border bg-muted/40 px-4 py-5 text-center">
          <p className="text-base font-semibold text-foreground">Quote declined</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your response has been recorded. Contact Premier if you have any questions.
          </p>
        </div>
      ) : quote.valid_until && new Date(quote.valid_until) < new Date() ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 text-center">
          <p className="text-sm font-medium text-amber-800">
            This quote expired on {formatDate(quote.valid_until)} — contact Premier to request an updated quote.
          </p>
        </div>
      ) : (
        <section className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Ready to proceed?</p>
            <p className="text-sm text-muted-foreground">
              Accept or decline this quote below. Premier will be notified of your response.
            </p>
          </div>
          <RespondToQuoteForm
            token={token}
            status={quote.status}
            validUntil={quote.valid_until}
          />
        </section>
      )}

      {/* Footer */}
      <footer className="border-t pt-4 text-center text-xs text-muted-foreground">
        <p>Premier Property Maintenance · Questions? Contact us directly.</p>
      </footer>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LineItemRow({ lineItem }: { lineItem: QuoteLineItemSummary }) {
  const { item } = lineItem;
  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium text-foreground">{item.name}</p>
        {item.description?.trim() ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.description.trim()}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-muted-foreground">{item.unit}</p>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {formatQuantity(item.quantity)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        {formatMoney(item.unit_price)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground">
        {formatMoney(item.total_quoted)}
      </td>
    </tr>
  );
}

function TotalRow({
  bold,
  label,
  value,
}: {
  bold?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={bold ? 'font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
        {label}
      </span>
      <span className={bold ? 'font-semibold text-foreground' : 'text-sm text-muted-foreground'}>
        {value}
      </span>
    </div>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      {children}
    </main>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(value: number | null) {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(
    value ?? 0
  );
}

function formatQuantity(value: number) {
  return Number(value).toString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function formatAddress(property: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  return [
    property.addressLine1,
    property.addressLine2,
    `${property.city}, ${property.state} ${property.zip}`,
  ]
    .filter(Boolean)
    .join(', ');
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
