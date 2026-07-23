import { notFound } from 'next/navigation';

import { createServiceClient, getInvoiceByToken, type InvoiceLineItemSummary } from '@premier/db';
import { ErrorCode } from '@premier/shared';

interface PublicInvoicePageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicInvoicePage({ params }: PublicInvoicePageProps) {
  const { token } = await params;

  // Basic UUID format guard — a malformed token is a 404, not an error page.
  if (!isUuid(token)) {
    notFound();
  }

  const client = createServiceClient();
  const result = await getInvoiceByToken(client, { token });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }
    return (
      <PageShell>
        <ErrorPanel>
          This invoice could not be loaded right now. Please try again or contact Premier.
        </ErrorPanel>
      </PageShell>
    );
  }

  const { customer, invoice, job, lineItems, payments, property } = result.data;

  // Drafts are never publicly visible, even with a valid token — only the
  // staff app can see a draft. Mirrors the "sent, viewed, accepted" gating
  // the public quote view uses.
  if (invoice.status === 'draft') {
    notFound();
  }

  // Stamp viewed_at on first open only. Idempotent — the WHERE conditions
  // mean no update is written unless status is currently 'sent'.
  if (invoice.status === 'sent') {
    await client
      .from('invoices')
      .update({ status: 'viewed' })
      .eq('share_token', token)
      .eq('status', 'sent');
  }

  const invoiceTitle = invoice.title?.trim() || invoice.invoice_number || 'Invoice';
  const customerName = customer?.displayName ?? null;
  const propertyAddress = property ? formatAddress(property) : null;

  return (
    <PageShell>
      <header className="space-y-1 border-b pb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Premier Property Maintenance
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{invoiceTitle}</h1>
        {invoice.invoice_number ? (
          <p className="text-sm text-muted-foreground">Invoice {invoice.invoice_number}</p>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Billed to
          </p>
          <p className="font-medium text-foreground">{customerName ?? 'Customer'}</p>
          {propertyAddress ? <p className="text-sm text-muted-foreground">{propertyAddress}</p> : null}
        </div>

        <div className="space-y-1 sm:text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Related job
          </p>
          <p className="font-medium text-foreground">{job.title.trim() || job.jobNumber || 'Service job'}</p>
          {invoice.due_date ? (
            <p className="text-sm text-muted-foreground">Due {formatDate(invoice.due_date)}</p>
          ) : null}
        </div>
      </section>

      <section className="rounded-md border px-4 py-3">
        <StatusPanel status={invoice.status} amountDue={invoice.amount_due} />
      </section>

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
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No line items have been added to this invoice yet.
                </td>
              </tr>
            ) : (
              lineItems.map((li) => <LineItemRow key={li.item.id} lineItem={li} />)
            )}
          </tbody>
        </table>
      </section>

      <section className="flex justify-end">
        <div className="w-full max-w-xs space-y-2">
          <TotalRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
          {(invoice.discount_amount ?? 0) > 0 ? (
            <TotalRow label="Discount" value={`– ${formatMoney(invoice.discount_amount)}`} />
          ) : null}
          {(invoice.tax_pct ?? 0) > 0 ? (
            <TotalRow label={`Tax (${invoice.tax_pct}%)`} value={formatMoney(invoice.tax_amount)} />
          ) : null}
          <div className="border-t pt-2">
            <TotalRow label="Total" value={formatMoney(invoice.total)} bold />
          </div>
          {(invoice.amount_paid ?? 0) > 0 ? (
            <TotalRow label="Paid" value={`– ${formatMoney(invoice.amount_paid)}`} />
          ) : null}
          <div className="border-t pt-2">
            <TotalRow label="Amount due" value={formatMoney(invoice.amount_due)} bold />
          </div>
        </div>
      </section>

      {payments.length > 0 ? (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Payment history
          </p>
          <ul className="divide-y rounded-md border">
            {payments.map((payment) => (
              <li key={payment.id} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-muted-foreground">{formatDate(payment.paid_at)}</span>
                <span className="font-medium text-foreground">{formatMoney(payment.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {invoice.notes?.trim() ? <p className="text-sm text-foreground">{invoice.notes.trim()}</p> : null}
      {invoice.terms?.trim() ? (
        <div className="rounded-md border bg-muted/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Terms</p>
          <p className="mt-1 text-sm text-muted-foreground">{invoice.terms.trim()}</p>
        </div>
      ) : null}

      <section className="rounded-md border bg-muted/30 px-4 py-5 text-center">
        <p className="text-sm font-medium text-foreground">Questions about this invoice?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Contact Premier Property Maintenance directly to arrange payment or ask a question.
        </p>
      </section>

      <footer className="border-t pt-4 text-center text-xs text-muted-foreground">
        <p>Premier Property Maintenance · Questions? Contact us directly.</p>
      </footer>
    </PageShell>
  );
}

function StatusPanel({ status, amountDue }: { status: string; amountDue: number | null }) {
  if (status === 'paid') {
    return (
      <p className="text-center text-sm font-semibold text-green-700">
        This invoice has been paid in full. Thank you!
      </p>
    );
  }
  if (status === 'void') {
    return (
      <p className="text-center text-sm font-semibold text-muted-foreground">
        This invoice has been voided and is no longer payable.
      </p>
    );
  }
  if (status === 'refunded') {
    return (
      <p className="text-center text-sm font-semibold text-muted-foreground">
        This invoice has been refunded.
      </p>
    );
  }
  if (status === 'partially_paid') {
    return (
      <p className="text-center text-sm font-medium text-amber-700">
        Partially paid — {formatMoney(amountDue)} remaining.
      </p>
    );
  }
  return (
    <p className="text-center text-sm font-medium text-foreground">
      {formatMoney(amountDue)} due.
    </p>
  );
}

function LineItemRow({ lineItem }: { lineItem: InvoiceLineItemSummary }) {
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
        {formatMoney(item.total)}
      </td>
    </tr>
  );
}

function TotalRow({ bold, label, value }: { bold?: boolean; label: string; value: string }) {
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

function formatMoney(value: number | null) {
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value ?? 0);
}

function formatQuantity(value: number) {
  return Number(value).toString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(value)
  );
}

function formatAddress(property: {
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zip: string;
}) {
  return [property.addressLine1, property.addressLine2, `${property.city}, ${property.state} ${property.zip}`]
    .filter(Boolean)
    .join(', ');
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
