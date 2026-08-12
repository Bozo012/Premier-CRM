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
        customerReportedUrgency: null,
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
    expect(model.customerReportedUrgencyLabel).toBeNull();
    expect(model.nextActionLabel).toBe('Triage request');
    expect(model.ageLabel).toBe('2h ago');
  });

  it('surfaces customer-reported urgency as a separate label from internal priority — never conflated', () => {
    const model = toForgeRequestSummary(
      {
        id: 'req-3',
        requestNumber: 'REQ-003',
        title: 'Alex Customer — Roof leak',
        description: 'Water coming through the ceiling',
        serviceLine: 'Roofing',
        status: 'new',
        // Staff-authoritative priority stays at its untouched default even
        // though the customer reported "urgent" — this is the exact
        // separation the portal urgency feature must preserve.
        priority: 'normal',
        customerReportedUrgency: 'urgent',
        createdAt: '2026-08-05T12:00:00.000Z',
        jobId: null,
        estimateId: null,
        customer: null,
      },
      new Date('2026-08-05T13:00:00.000Z')
    );

    expect(model.priorityLabel).toBeNull();
    expect(model.customerReportedUrgencyLabel).toBe('Urgent');
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
        customerReportedUrgency: null,
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
