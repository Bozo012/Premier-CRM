import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  getActiveOrgContext,
  getInvoiceById,
  listEligibleExpensesForJob,
  type InvoiceLineItemSummary,
  type Payment,
} from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { InvoicesShell } from '../_components/invoices-shell';
import { InvoiceMetadataForm } from '../_components/invoice-metadata-form';
import { LineItemEditor } from '../_components/line-item-editor';
import { RecordPaymentForm } from '../_components/record-payment-form';
import { SendInvoiceButton } from '../_components/send-invoice-button';
import { VoidInvoiceButton } from '../_components/void-invoice-button';
import { EligibleExpensesSection } from '../_components/eligible-expenses-section';
import { buildForgeShellData, buildMobileNavConfig } from '../_lib/forge-shell-context';
import { invoiceStatusTone } from '../_lib/forge-invoice-view-model';
import { toEligibleExpenseOptions } from '../_lib/forge-invoice-eligible-expenses-view-model';

interface InvoiceDetailPageProps {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function InvoiceDetailPage({ params, searchParams }: InvoiceDetailPageProps) {
  const { invoiceId } = await params;
  const query = await searchParams;
  const message = readStringParam(query.message);
  const error = readStringParam(query.error);

  if (!isUuid(invoiceId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/invoices/${invoiceId}`)}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }
  const { orgId } = orgContextResult.data;

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const result = await getInvoiceById(supabase, {
    invoiceId,
    orgId,
  });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <InvoicesShell shellData={shellData} mobileNav={mobileNav}>
        <PageShell>
          <ErrorPanel>Failed to load invoice: {result.error}</ErrorPanel>
        </PageShell>
      </InvoicesShell>
    );
  }

  const { customer, invoice, job, lineItems, payments, property, quote } = result.data;
  const isDraft = invoice.status === 'draft';
  // A working invoice's kind can never change (DB-enforced by the
  // invoices_prevent_working_kind_change trigger) and it can never be
  // sent, viewed, or paid directly (invoices_prevent_working_send_or_pay).
  // These controls are hidden here as defense in depth so staff never
  // reach them in the first place, not just to satisfy the DB guard.
  const isWorking = invoice.kind === 'working';

  // Eligible expenses to add as invoice line items — only offered on draft,
  // non-working invoices. listEligibleExpensesForJob already excludes
  // anything with a real invoice_line_items.source_expense_id match (not
  // just expenses.status), so this list is proof-based, not status-trusting.
  const eligibleExpenses =
    isDraft && !isWorking
      ? await listEligibleExpensesForJob(supabase, { jobId: job.id, orgId })
      : null;

  return (
    <InvoicesShell shellData={shellData} mobileNav={mobileNav}>
    <PageShell>
      <header className="space-y-4">
        <div className="space-y-2">
          <Link
            href={`/jobs/${job.id}`}
            className="inline-flex text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to job
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {invoice.title?.trim() || invoice.invoice_number || 'Untitled invoice'}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
            <InvoiceKindBadge kind={invoice.kind} />
          </div>
          <p className="text-sm text-muted-foreground">
            {[
              invoice.invoice_number || 'Draft number not assigned',
              customer?.displayName || 'Unknown customer',
              job.jobNumber,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </header>

      {message ? <SuccessPanel>{message}</SuccessPanel> : null}
      {error ? <ErrorPanel>{error}</ErrorPanel> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Total" value={formatMoney(invoice.total)} helper={`Subtotal ${formatMoney(invoice.subtotal)}`} />
        <InfoCard
          label="Amount due"
          value={formatMoney(invoice.amount_due)}
          helper={`Paid ${formatMoney(invoice.amount_paid)}`}
        />
        <InfoCard
          label="Due date"
          value={invoice.due_date ? formatDate(invoice.due_date) : 'Not set'}
          helper={`Issued ${formatDate(invoice.issued_date)}`}
        />
        <InfoCard
          label="Linked job"
          value={job.title.trim() || job.jobNumber || 'Untitled job'}
          helper={quote ? `From quote ${quote.quoteNumber ?? ''}`.trim() : 'Standalone'}
          href={`/jobs/${job.id}`}
        />
      </section>

      {isDraft && !isWorking ? (
        <section>
          <InvoiceMetadataForm
            invoiceId={invoice.id}
            currentTitle={invoice.title}
            currentKind={invoice.kind}
            currentIssuedDate={invoice.issued_date}
            currentDueDate={invoice.due_date}
            currentDiscountAmount={invoice.discount_amount}
            currentTaxPct={invoice.tax_pct}
            currentNotes={invoice.notes}
            currentTerms={invoice.terms}
          />
        </section>
      ) : (
        <section className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Invoice summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Status" value={formatEnumLabel(invoice.status)} />
              <DetailRow label="Kind" value={formatEnumLabel(invoice.kind)} />
              <DetailRow label="Notes" value={invoice.notes?.trim() || 'No notes'} />
              <DetailRow label="Terms" value={invoice.terms?.trim() || 'No terms'} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <DetailRow label="Subtotal" value={formatMoney(invoice.subtotal)} />
              <DetailRow label="Discount amount" value={formatMoney(invoice.discount_amount)} />
              <DetailRow label="Tax rate" value={formatPercent(invoice.tax_pct)} />
              <DetailRow label="Tax amount" value={formatMoney(invoice.tax_amount)} />
              <DetailRow label="Total" value={formatMoney(invoice.total)} />
              <DetailRow label="Amount paid" value={formatMoney(invoice.amount_paid)} />
              <DetailRow label="Amount due" value={formatMoney(invoice.amount_due)} />
              <DetailRow label="Updated" value={formatDateTime(invoice.updated_at)} />
            </CardContent>
          </Card>
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Customer context</CardTitle>
          </CardHeader>
          <CardContent>
            {customer ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{customer.displayName}</p>
                  <p className="text-sm text-muted-foreground">
                    {customer.phonePrimary || 'No primary phone'}
                  </p>
                </div>
                <DetailRow label="Email" value={customer.email || 'Not set'} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This invoice is missing visible customer context.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Property context</CardTitle>
          </CardHeader>
          <CardContent>
            {property ? (
              <div className="space-y-1">
                <p className="font-medium text-foreground">{formatPropertyAddress(property)}</p>
                <p className="text-sm text-muted-foreground">
                  {property.propertyType || 'Property type not set'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This invoice is missing visible property context.
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Line items</CardTitle>
          </CardHeader>
          <CardContent>
            {isDraft ? (
              <LineItemEditor invoiceId={invoice.id} lineItems={lineItems} />
            ) : lineItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items.</p>
            ) : (
              <ul className="space-y-3">
                {lineItems.map((lineItem) => (
                  <LineItemCard key={lineItem.item.id} lineItem={lineItem} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{isWorking ? 'Actions' : isDraft ? 'Send invoice' : 'Actions'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isWorking ? (
              <WorkingInvoiceNotice jobId={job.id} />
            ) : isDraft ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Marking as sent transitions the invoice to{' '}
                  <span className="font-medium text-foreground">Sent</span> and generates a
                  shareable customer link.
                </p>
                <SendInvoiceButton invoiceId={invoice.id} status={invoice.status} />
              </>
            ) : (
              <div className="space-y-3">
                {invoice.share_token ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Customer link
                    </p>
                    <p className="break-all text-xs text-foreground">/i/{invoice.share_token}</p>
                  </div>
                ) : null}
                <VoidInvoiceButton invoiceId={invoice.id} status={invoice.status} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment history</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {payments.map((payment) => (
                  <PaymentRow key={payment.id} payment={payment} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {!isWorking && !isDraft && invoice.status !== 'void' ? (
        <section>
          <RecordPaymentForm invoiceId={invoice.id} amountDue={invoice.amount_due ?? 0} />
        </section>
      ) : null}

      {eligibleExpenses ? (
        <section>
          {eligibleExpenses.success ? (
            <EligibleExpensesSection
              invoiceId={invoice.id}
              expenses={toEligibleExpenseOptions(eligibleExpenses.data)}
            />
          ) : (
            <ErrorPanel>Failed to load eligible expenses: {eligibleExpenses.error}</ErrorPanel>
          )}
        </section>
      ) : null}
    </PageShell>
    </InvoicesShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <ForgePage className="max-w-6xl gap-5 md:gap-6">{children}</ForgePage>;
}

function InfoCard({
  helper,
  href,
  label,
  value,
}: {
  helper: string;
  href?: string;
  label: string;
  value: string;
}) {
  const content = (
    <>
      <div className="pb-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </div>
    </>
  );

  if (!href) {
    return <ForgeCard>{content}</ForgeCard>;
  }

  return (
    <ForgeCard className="transition-colors hover:bg-muted/30">
      <Link
        href={href}
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    </ForgeCard>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function LineItemCard({ lineItem }: { lineItem: InvoiceLineItemSummary }) {
  const { item } = lineItem;
  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {[item.quote_line_id ? 'From quote' : 'Manual', item.unit].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="text-sm font-medium text-foreground">{formatMoney(item.total)}</p>
      </div>

      {item.description?.trim() ? (
        <p className="mt-2 text-sm text-foreground">{item.description.trim()}</p>
      ) : null}

      <div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <p>
          <span className="font-medium text-foreground">Qty:</span> {formatQuantity(item.quantity)}
        </p>
        <p>
          <span className="font-medium text-foreground">Unit price:</span>{' '}
          {formatMoney(item.unit_price)}
        </p>
      </div>
    </li>
  );
}

function PaymentRow({ payment }: { payment: Payment }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{formatMoney(payment.amount)}</p>
        <p className="text-xs text-muted-foreground">
          {[formatEnumLabel(payment.method), formatDate(payment.paid_at), payment.reference]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </li>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  return <ForgeStatusPill tone={invoiceStatusTone(status)}>{formatEnumLabel(status)}</ForgeStatusPill>;
}

function InvoiceKindBadge({ kind }: { kind: string }) {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
      {formatEnumLabel(kind)}
    </span>
  );
}

function WorkingInvoiceNotice({ jobId }: { jobId: string }) {
  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-sm text-foreground">
        This is a working invoice. It cannot be edited, sent, or paid directly — its line items
        can still be adjusted, but its kind and status are permanently protected.
      </p>
      <p className="text-sm text-muted-foreground">
        To bill the customer, generate a final invoice from the job page instead.
      </p>
      <Link
        href={`/jobs/${jobId}`}
        className="inline-flex text-sm font-medium text-foreground underline-offset-4 hover:underline"
      >
        Go to job to generate final invoice
      </Link>
    </div>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}

function SuccessPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
      {children}
    </p>
  );
}


function formatMoney(value: number | null) {
  if (value === null) return 'Not available';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return 'Not set';
  return `${value}%`;
}

function formatQuantity(value: number) {
  return Number(value).toString();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value)
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatPropertyAddress(property: {
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

function formatEnumLabel(value: string) {
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function readStringParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? '';
  return value?.trim() ?? '';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
