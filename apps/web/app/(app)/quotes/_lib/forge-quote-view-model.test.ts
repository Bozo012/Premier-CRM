import { describe, expect, it } from 'vitest';

import { quoteStatusTone, toForgeQuoteSummary } from './forge-quote-view-model';

describe('forge quote view model', () => {
  it('maps accepted estimate-origin quotes to real action labels', () => {
    const model = toForgeQuoteSummary({
      customer: { id: 'cust-1', displayName: 'Taylor Customer' },
      job: { id: 'job-1', jobNumber: 'JOB-001', title: 'Deck repair' },
      lineItemCount: 3,
      quote: {
        id: 'quote-1',
        quote_number: 'Q-001',
        title: 'Deck quote',
        status: 'accepted',
        estimate_id: 'est-1',
        job_id: 'job-1',
        total: 1250,
        created_at: '2026-08-05T12:00:00.000Z',
        valid_until: '2026-08-12',
      } as never,
    });

    expect(model.originLabel).toBe('From estimate');
    expect(model.nextActionLabel).toBe('Create job');
    expect(model.statusTone).toBe('emerald');
    expect(model.amountLabel).toBe('$1,250.00');
  });

  it('keeps quote status colors presentation-only', () => {
    expect(quoteStatusTone('sent')).toBe('blue');
    expect(quoteStatusTone('declined')).toBe('red');
    expect(quoteStatusTone('draft')).toBe('neutral');
  });
});
