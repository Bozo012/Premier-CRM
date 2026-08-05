import { describe, expect, it } from 'vitest';

import {
  invoiceOutstandingTotal,
  invoicePaidTotal,
  invoiceStatusTone,
  toForgeInvoiceSummary,
} from './forge-invoice-view-model';

describe('forge invoice view model', () => {
  it('maps overdue as a visual state without rewriting invoice status', () => {
    const model = toForgeInvoiceSummary({
      customer: {
        id: 'cust-1',
        displayName: 'Jordan Customer',
        email: 'jordan@example.com',
        phonePrimary: '555-0100',
      },
      invoice: {
        id: 'invoice-1',
        invoice_number: 'INV-001',
        title: 'Final invoice',
        status: 'sent',
        quote_id: 'quote-1',
        total: 900,
        amount_due: 900,
        amount_paid: 0,
        issued_date: '2026-08-01',
        due_date: '2026-08-03',
      } as never,
      isOverdue: true,
      job: { id: 'job-1', jobNumber: 'JOB-001', title: 'Fence repair' },
    });

    expect(model.statusLabel).toBe('Overdue');
    expect(model.statusTone).toBe('red');
    expect(model.originLabel).toBe('From quote');
    expect(model.nextActionLabel).toBe('Record payment');
  });

  it('sums outstanding and paid values from supplied invoice rows', () => {
    const invoices = [
      {
        customer: null,
        invoice: { amount_due: 100, amount_paid: 25 } as never,
        isOverdue: false,
        job: { id: 'job-1', jobNumber: null, title: 'Job 1' },
      },
      {
        customer: null,
        invoice: { amount_due: 50, amount_paid: 75 } as never,
        isOverdue: false,
        job: { id: 'job-2', jobNumber: null, title: 'Job 2' },
      },
    ];

    expect(invoiceOutstandingTotal(invoices)).toBe(150);
    expect(invoicePaidTotal(invoices)).toBe(100);
  });

  it('maps financial status tones without granting authority', () => {
    expect(invoiceStatusTone('paid')).toBe('emerald');
    expect(invoiceStatusTone('partially_paid')).toBe('amber');
    expect(invoiceStatusTone('sent')).toBe('blue');
  });
});
