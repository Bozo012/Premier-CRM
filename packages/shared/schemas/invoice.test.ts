import { describe, expect, it } from 'vitest';

import {
  AddInvoiceLineItemInputSchema,
  CreateInvoiceFromJobInputSchema,
  CreateInvoiceFromQuoteInputSchema,
  ListInvoicesArgsSchema,
  RecordPaymentInputSchema,
  UpdateInvoiceMetadataInputSchema,
} from './invoice';

const UUID = '9f0d1a34-2b7c-4e5f-8a9b-0c1d2e3f4a5b';

describe('CreateInvoiceFromJobInputSchema', () => {
  it('accepts a valid job id and defaults kind to standalone', () => {
    const parsed = CreateInvoiceFromJobInputSchema.safeParse({ jobId: UUID });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.kind).toBe('standalone');
    }
  });

  it('rejects a non-uuid job id', () => {
    const parsed = CreateInvoiceFromJobInputSchema.safeParse({ jobId: '123' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing job id — every invoice must anchor to a job', () => {
    const parsed = CreateInvoiceFromJobInputSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    const parsed = CreateInvoiceFromJobInputSchema.safeParse({
      jobId: UUID,
      kind: 'retainer',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('CreateInvoiceFromQuoteInputSchema', () => {
  it('defaults copyLineItems to true (snapshot copy is the default path)', () => {
    const parsed = CreateInvoiceFromQuoteInputSchema.safeParse({ quoteId: UUID });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.copyLineItems).toBe(true);
    }
  });
});

describe('RecordPaymentInputSchema', () => {
  const valid = {
    invoiceId: UUID,
    amount: '150.00',
    method: 'check',
    paidAt: '2026-07-22',
    reference: 'Check #1042',
  };

  it('accepts a valid payment and coerces the amount to a number', () => {
    const parsed = RecordPaymentInputSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amount).toBe(150);
    }
  });

  it('rejects a zero amount', () => {
    const parsed = RecordPaymentInputSchema.safeParse({ ...valid, amount: '0' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a negative amount', () => {
    const parsed = RecordPaymentInputSchema.safeParse({ ...valid, amount: '-25' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a non-numeric amount', () => {
    const parsed = RecordPaymentInputSchema.safeParse({ ...valid, amount: 'abc' });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown payment method', () => {
    const parsed = RecordPaymentInputSchema.safeParse({ ...valid, method: 'crypto' });
    expect(parsed.success).toBe(false);
  });

  it('rejects a missing paid date', () => {
    const parsed = RecordPaymentInputSchema.safeParse({ ...valid, paidAt: '' });
    expect(parsed.success).toBe(false);
  });
});

describe('AddInvoiceLineItemInputSchema', () => {
  const valid = {
    invoiceId: UUID,
    name: 'Drywall patch',
    unit: 'each',
    quantity: '2',
    unitPrice: '75',
  };

  it('accepts a valid line item', () => {
    expect(AddInvoiceLineItemInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a zero quantity', () => {
    expect(
      AddInvoiceLineItemInputSchema.safeParse({ ...valid, quantity: '0' }).success
    ).toBe(false);
  });

  it('rejects a negative unit price', () => {
    expect(
      AddInvoiceLineItemInputSchema.safeParse({ ...valid, unitPrice: '-5' }).success
    ).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(AddInvoiceLineItemInputSchema.safeParse({ ...valid, name: '' }).success).toBe(
      false
    );
  });
});

describe('UpdateInvoiceMetadataInputSchema', () => {
  const valid = {
    invoiceId: UUID,
    title: 'Final invoice',
    kind: 'final',
    issuedDate: '2026-07-22',
    dueDate: '2026-08-05',
    discountAmount: '0',
    taxPct: '6.25',
    notes: '',
    terms: '',
  };

  it('accepts valid metadata', () => {
    expect(UpdateInvoiceMetadataInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a tax rate above 100%', () => {
    expect(
      UpdateInvoiceMetadataInputSchema.safeParse({ ...valid, taxPct: '101' }).success
    ).toBe(false);
  });

  it('rejects a negative discount', () => {
    expect(
      UpdateInvoiceMetadataInputSchema.safeParse({ ...valid, discountAmount: '-1' })
        .success
    ).toBe(false);
  });
});

describe('ListInvoicesArgsSchema', () => {
  it('applies limit/offset defaults', () => {
    const parsed = ListInvoicesArgsSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBe(100);
      expect(parsed.data.offset).toBe(0);
    }
  });

  it('rejects an unknown status filter', () => {
    expect(ListInvoicesArgsSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});
