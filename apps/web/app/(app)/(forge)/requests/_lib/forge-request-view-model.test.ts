import { describe, expect, it } from 'vitest';

import { formatAge, requestStatusTone, toForgeRequestSummary } from './forge-request-view-model';

describe('forge request view model', () => {
  it('maps new requests to urgent Forge presentation state', () => {
    const model = toForgeRequestSummary(
      {
        id: 'req-1',
        requestNumber: 'REQ-001',
        title: 'Sam Customer — Fence repair',
        description: 'Loose gate',
        serviceLine: 'Fence repair',
        status: 'new',
        priority: 'high',
        createdAt: '2026-08-05T12:00:00.000Z',
        jobId: null,
        estimateId: null,
        customer: {
          id: 'cust-1',
          displayName: 'Sam Customer',
          email: 'sam@example.com',
          phonePrimary: '555-0100',
        },
      },
      new Date('2026-08-05T14:00:00.000Z')
    );

    expect(model.statusTone).toBe('amber');
    expect(model.priorityLabel).toBe('High');
    expect(model.nextActionLabel).toBe('Triage request');
    expect(model.ageLabel).toBe('2h ago');
  });

  it('keeps linked estimate navigation explicit', () => {
    const model = toForgeRequestSummary(
      {
        id: 'req-2',
        requestNumber: 'REQ-002',
        title: 'Pat Customer — Deck',
        description: null,
        serviceLine: 'Deck',
        status: 'estimate_created',
        priority: 'normal',
        createdAt: '2026-08-01T12:00:00.000Z',
        jobId: null,
        estimateId: 'est-1',
        customer: null,
      },
      new Date('2026-08-05T12:00:00.000Z')
    );

    expect(model.relatedHref).toBe('/estimates/est-1');
    expect(model.nextActionLabel).toBe('Open estimate');
  });

  it('assigns destructive tone only to spam-like states', () => {
    expect(requestStatusTone('spam')).toBe('red');
    expect(requestStatusTone('cancelled')).toBe('neutral');
  });

  it('formats recent age without returning zero minutes', () => {
    expect(formatAge('2026-08-05T12:00:00.000Z', new Date('2026-08-05T12:00:10.000Z'))).toBe('1m ago');
  });
});
