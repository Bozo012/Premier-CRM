// Layer 2 adapter — maps a real Customer360 payload
// (packages/db/queries/customers.ts:getCustomer360) into the generic
// RecordDetailModel shape RecordDetailView renders
// (apps/web/components/forge-shell/recordDetail.types.ts).
import type { Customer360 } from '@premier/db';

import type { DetailSection, DetailTone, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

import { deriveCustomerPresentationStatus, resolveCustomerDisplayName } from './forge-customers-view-model';

const STATUS_TONE: Record<ReturnType<typeof deriveCustomerPresentationStatus>, DetailTone> = {
  active: 'success',
  prospect: 'info',
  inactive: 'neutral',
};

export function toCustomerDetailModel(data: Customer360): RecordDetailModel {
  const { customer, properties, recentJobs, openQuotes, unpaidInvoices, stats } = data;
  const status = deriveCustomerPresentationStatus(customer);
  const outstandingTotal = unpaidInvoices.reduce((sum, invoice) => sum + (invoice.amount_due ?? 0), 0);
  const hasOverdueInvoice = unpaidInvoices.some((invoice) => (invoice.days_overdue ?? 0) > 0);

  const propertiesSection: DetailSection = {
    kind: 'related',
    id: 'properties',
    title: 'Properties',
    emptyMessage: 'No properties linked yet.',
    items: properties.map((property) => ({
      id: property.id,
      label: property.address_line_1,
      sublabel: [property.city, property.state].filter(Boolean).join(', ') || undefined,
      route: `/properties/${property.id}`,
      recordType: 'property',
    })),
  };

  const jobsSection: DetailSection = {
    kind: 'related',
    id: 'jobs',
    title: 'Recent jobs',
    emptyMessage: 'No jobs yet for this customer.',
    items: recentJobs.map((job) => ({
      id: job.id,
      label: job.title,
      sublabel: [formatEnumLabel(job.status), formatDate(job.scheduled_start), formatMoney(job.total)].filter(Boolean).join(' · '),
      badge: formatEnumLabel(job.status),
      badgeTone: jobStatusTone(job.status),
      route: `/jobs/${job.id}`,
      recordType: 'job',
    })),
  };

  const quotesSection: DetailSection = {
    kind: 'related',
    id: 'quotes',
    title: 'Open quotes',
    emptyMessage: 'No open quotes right now.',
    items: openQuotes.map((quote) => ({
      id: quote.id,
      label: quote.job_title || 'Untitled quote',
      sublabel: [formatMoney(quote.total), quote.sent_at ? `Sent ${formatDate(quote.sent_at)}` : null].filter(Boolean).join(' · '),
      route: `/quotes/${quote.id}`,
      recordType: 'quote',
    })),
  };

  const invoicesSection: DetailSection = {
    kind: 'related',
    id: 'invoices',
    title: 'Unpaid invoices',
    emptyMessage: 'No unpaid invoices.',
    items: unpaidInvoices.map((invoice) => ({
      id: invoice.id,
      label: formatMoney(invoice.amount_due),
      sublabel: invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : undefined,
      badge: (invoice.days_overdue ?? 0) > 0 ? 'Overdue' : 'Due',
      badgeTone: (invoice.days_overdue ?? 0) > 0 ? 'danger' : 'warning',
      route: `/invoices/${invoice.id}`,
      recordType: 'invoice',
    })),
  };

  const contactSection: DetailSection = {
    kind: 'fields',
    id: 'contact',
    title: 'Contact & billing',
    fields: [
      { label: 'Primary phone', value: customer.phone_primary ?? 'Not set' },
      { label: 'Secondary phone', value: customer.phone_secondary ?? 'Not set' },
      { label: 'Email', value: customer.email ?? 'Not set' },
      { label: 'Company', value: customer.company_name ?? 'Not set' },
      { label: 'Preferred contact', value: customer.preferred_channel ?? 'Not set' },
      { label: 'Payment terms', value: formatPaymentTerms(customer.payment_terms_days) },
      { label: 'Source', value: customer.source ?? 'Not set' },
    ],
  };

  const sections: DetailSection[] = [contactSection, propertiesSection, jobsSection, quotesSection, invoicesSection];

  if (customer.notes?.trim()) {
    sections.push({ kind: 'text', id: 'notes', title: 'Account notes', body: customer.notes, visibility: 'internal' });
  }

  return {
    recordType: 'Customer',
    identity: `CUST-${customer.id.slice(0, 8).toUpperCase()}`,
    title: resolveCustomerDisplayName(customer),
    statusLabel: status === 'active' ? 'Active' : status === 'prospect' ? 'Prospect' : 'Inactive',
    statusTone: STATUS_TONE[status],
    backLabel: 'Back to customers',
    contextChips: properties.slice(0, 3).map((property) => ({ id: property.id, label: property.address_line_1, route: `/properties/${property.id}` })),
    summaryTiles: [
      { id: 'revenue', label: 'Total revenue', value: formatMoney(stats.total_revenue) },
      { id: 'jobs', label: 'Jobs on record', value: String(stats.total_jobs ?? 0) },
      { id: 'last-contact', label: 'Last contact', value: formatDate(stats.last_contact_at) },
      { id: 'outstanding', label: 'Outstanding invoices', value: `${unpaidInvoices.length} · ${formatMoney(outstandingTotal)}`, tone: unpaidInvoices.length > 0 ? 'warning' : undefined },
    ],
    warnings: hasOverdueInvoice ? ['This customer has at least one overdue invoice.'] : undefined,
    // No primary/secondary actions: Base44's customer-detail actions
    // (edit-customer, archive-customer, send-message, open-portal-account,
    // etc.) have no corresponding real Forge server action/route today.
    // Fabricating them here would misrepresent what this PR ships —
    // intentionally deferred, not wired. See the Customers route report.
    primaryAction: null,
    secondaryActions: [],
    sections,
  };
}

function jobStatusTone(status: string): DetailTone {
  if (status === 'completed') return 'success';
  if (status === 'in_progress' || status === 'scheduled') return 'info';
  if (status === 'cancelled') return 'neutral';
  return 'neutral';
}

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not available';
  return new Intl.NumberFormat('en-US', { currency: 'USD', style: 'currency' }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatPaymentTerms(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Not set';
  return value === 0 ? 'Due on receipt' : `Net ${value}`;
}
