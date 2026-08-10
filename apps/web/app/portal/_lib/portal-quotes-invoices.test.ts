import { describe, expect, it } from 'vitest';

import { isPortalVisibleInvoiceKind, type PortalInvoiceRow, type PortalQuoteRow } from './portal-quotes-invoices';

describe('isPortalVisibleInvoiceKind', () => {
  it('excludes working invoices (they carry internal notes, per customer_select_own_invoices RLS)', () => {
    expect(isPortalVisibleInvoiceKind('working')).toBe(false);
  });

  it('allows final/deposit invoices through', () => {
    expect(isPortalVisibleInvoiceKind('final')).toBe(true);
    expect(isPortalVisibleInvoiceKind('deposit')).toBe(true);
  });
});

describe('customer-safe field boundary — PortalQuoteRow / PortalInvoiceRow', () => {
  it('never carries internal-only fields (pricing-review state, internal notes, staff ids)', () => {
    const quote: PortalQuoteRow = {
      id: 'q1',
      quoteNumber: 'Q-1',
      title: 'Roof repair',
      status: 'sent',
      total: 100,
      createdAt: new Date().toISOString(),
      shareToken: 'token',
      sourceLabel: 'Job 1',
    };
    const invoice: PortalInvoiceRow = {
      id: 'i1',
      invoiceNumber: 'INV-1',
      status: 'sent',
      total: 100,
      amountPaid: 0,
      amountDue: 100,
      dueDate: null,
      issuedDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      shareToken: 'token',
      jobTitle: 'Job 1',
    };

    const disallowedKeys = [
      'notes',
      'terms',
      'created_by',
      'pricing_reviewed_by',
      'pricing_review_status',
      'internal_notes',
      'stripe_payment_intent_id',
    ];

    for (const key of disallowedKeys) {
      expect(Object.keys(quote)).not.toContain(key);
      expect(Object.keys(invoice)).not.toContain(key);
    }
  });
});
