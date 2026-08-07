import { describe, expect, it } from 'vitest';

import type { Customer360 } from '@premier/db';

import { toCustomerDetailModel } from './forge-customer-detail-view-model';

function makeCustomer360(overrides: Partial<Customer360> = {}): Customer360 {
  return {
    customer: {
      id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Jane Doe',
      company_name: null,
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@example.com',
      phone_primary: '555-0100',
      phone_secondary: null,
      preferred_channel: 'email',
      payment_terms_days: 30,
      source: 'manual_staff_entry',
      notes: null,
      is_archived: false,
      total_jobs: 3,
    } as unknown as Customer360['customer'],
    properties: [],
    recentJobs: [],
    openQuotes: [],
    unpaidInvoices: [],
    stats: { last_contact_at: null, last_job_completed_at: null, total_jobs: 3, total_revenue: 1250 },
    ...overrides,
  };
}

describe('toCustomerDetailModel', () => {
  it('derives an active status, no primary action, and the real Add property secondary action', () => {
    const model = toCustomerDetailModel(makeCustomer360());
    expect(model.statusLabel).toBe('Active');
    expect(model.statusTone).toBe('success');
    expect(model.primaryAction).toBeNull();
    // Add property is a real, pre-existing Forge capability
    // (createPropertyForCustomerAction) restored via the Base44 contract's
    // page-level secondaryActions slot — not a fabricated Base44 action.
    expect(model.secondaryActions).toEqual([{ id: 'add-property', label: 'Add property', kind: 'secondary' }]);
    expect(model.identity).toBe('CUST-11111111');
  });

  it('flags overdue invoices as a warning', () => {
    const model = toCustomerDetailModel(
      makeCustomer360({
        unpaidInvoices: [{ id: 'inv-1', amount_due: 100, due_date: '2026-07-01', days_overdue: 5 }],
      })
    );
    expect(model.warnings).toEqual(['This customer has at least one overdue invoice.']);
    const invoicesSection = model.sections.find((s) => s.id === 'invoices');
    expect(invoicesSection?.kind).toBe('related');
  });

  it('maps recent jobs and open quotes to navigable related records', () => {
    const model = toCustomerDetailModel(
      makeCustomer360({
        recentJobs: [{ id: 'job-1', title: 'Gutter cleaning', scheduled_start: null, status: 'scheduled', total: 200 }],
        openQuotes: [{ id: 'qt-1', job_title: 'Fence repair', sent_at: null, total: 500 }],
      })
    );
    const jobsSection = model.sections.find((s) => s.id === 'jobs');
    const quotesSection = model.sections.find((s) => s.id === 'quotes');
    expect(jobsSection?.kind === 'related' && jobsSection.items[0]?.route).toBe('/jobs/job-1');
    expect(quotesSection?.kind === 'related' && quotesSection.items[0]?.route).toBe('/quotes/qt-1');
  });
});
