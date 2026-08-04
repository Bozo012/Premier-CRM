import { describe, expect, it } from 'vitest';

import { getTodayQuoteActivity } from './today-actions';

// Minimal chainable mock matching the exact query shape getTodayQuoteActivity
// builds: .from('activity_log').select(...).eq(...).in(...).gte(...).order(...).limit(...)
// then .from('quotes').select(...).in(...).
function buildClient(
  activityRows: Array<{ id: string; entity_id: string; event_type: string; message: string | null; created_at: string }>,
  quoteRows: Array<{ id: string; title: string | null; quote_number: string | null; job_id: string | null }>
) {
  const activityChain = {
    eq: () => activityChain,
    in: () => activityChain,
    gte: () => activityChain,
    order: () => activityChain,
    limit: () => Promise.resolve({ data: activityRows, error: null }),
  };
  const quotesChain = {
    in: () => Promise.resolve({ data: quoteRows, error: null }),
  };
  return {
    from: (table: string) => {
      if (table === 'activity_log') return { select: () => activityChain };
      if (table === 'quotes') return { select: () => quotesChain };
      throw new Error(`unexpected table ${table}`);
    },
  } as any;
}

describe('getTodayQuoteActivity — workflow-relevance rule (corrected ownership, moved from Layer 2)', () => {
  const since = new Date('2026-01-01');

  it('an accepted quote with no job yet is still actionable', async () => {
    const client = buildClient(
      [{ id: 'a1', entity_id: 'q1', event_type: 'quote_accepted', message: null, created_at: '2026-01-02' }],
      [{ id: 'q1', title: 'Deck repair', quote_number: 'Q-001', job_id: null }]
    );
    const result = await getTodayQuoteActivity(client, { orgId: 'org-1', since });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ quoteId: 'q1', isAccepted: true, label: 'Deck repair' });
    }
  });

  it('an accepted quote that already has a job is no longer actionable', async () => {
    const client = buildClient(
      [{ id: 'a1', entity_id: 'q1', event_type: 'quote_accepted', message: null, created_at: '2026-01-02' }],
      [{ id: 'q1', title: 'Deck repair', quote_number: 'Q-001', job_id: 'job-1' }]
    );
    const result = await getTodayQuoteActivity(client, { orgId: 'org-1', since });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(0);
  });

  it('a declined quote is always included regardless of job state', async () => {
    const client = buildClient(
      [{ id: 'a1', entity_id: 'q1', event_type: 'quote_declined', message: null, created_at: '2026-01-02' }],
      [{ id: 'q1', title: 'Fence repair', quote_number: 'Q-002', job_id: null }]
    );
    const result = await getTodayQuoteActivity(client, { orgId: 'org-1', since });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ isAccepted: false });
    }
  });

  it('an activity row whose quote no longer exists is excluded, not errored', async () => {
    const client = buildClient(
      [{ id: 'a1', entity_id: 'q-missing', event_type: 'quote_accepted', message: null, created_at: '2026-01-02' }],
      []
    );
    const result = await getTodayQuoteActivity(client, { orgId: 'org-1', since });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toHaveLength(0);
  });

  it('falls back to quote_number when title is blank, then to "Quote"', async () => {
    const client = buildClient(
      [{ id: 'a1', entity_id: 'q1', event_type: 'quote_declined', message: null, created_at: '2026-01-02' }],
      [{ id: 'q1', title: '  ', quote_number: 'Q-003', job_id: null }]
    );
    const result = await getTodayQuoteActivity(client, { orgId: 'org-1', since });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data[0]?.label).toBe('Q-003');
  });

  it('a custom activity_log message is preserved; a missing one defaults per event type', async () => {
    const client = buildClient(
      [
        { id: 'a1', entity_id: 'q1', event_type: 'quote_accepted', message: null, created_at: '2026-01-02' },
        { id: 'a2', entity_id: 'q2', event_type: 'quote_declined', message: 'Customer chose a competitor', created_at: '2026-01-02' },
      ],
      [
        { id: 'q1', title: 'A', quote_number: null, job_id: null },
        { id: 'q2', title: 'B', quote_number: null, job_id: null },
      ]
    );
    const result = await getTodayQuoteActivity(client, { orgId: 'org-1', since });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.find((i) => i.quoteId === 'q1')?.message).toBe('Ready to create a job when you are.');
      expect(result.data.find((i) => i.quoteId === 'q2')?.message).toBe('Customer chose a competitor');
    }
  });
});
