import { describe, expect, it } from 'vitest';

import {
  inspectionDetailProgress,
  siteVisitDetailActions,
  siteVisitStatusTone,
  toForgeSiteVisitSummary,
} from './forge-site-visit-view-model';

describe('forge site visit view model', () => {
  it('maps scheduled visits to a start-inspection handoff', () => {
    const model = toForgeSiteVisitSummary({
      id: '11111111-1111-1111-1111-111111111111',
      status: 'scheduled',
      serviceRequestId: 'req-1',
      serviceRequestTitle: 'Deck inspection',
      serviceRequestDescription: null,
      customerId: 'cust-1',
      customerDisplayName: 'Taylor Customer',
      propertyId: 'prop-1',
      propertyAddress: '1 Main St, Florence, KY 41042',
      assignedUserId: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      inspectionResponseCount: 2,
      inspectionFieldCount: 4,
      generatedEstimateId: null,
      activeAppointment: {
        id: 'appt-1',
        scheduledStart: '2026-08-05T13:00:00.000Z',
        scheduledEnd: '2026-08-05T14:00:00.000Z',
        assignedUserId: null,
      },
    });

    expect(model.visitNumber).toBe('SV-11111111');
    expect(model.nextActionLabel).toBe('Start inspection');
    expect(model.progressLabel).toBe('2/4 fields');
    expect(model.progressPercent).toBe(50);
  });

  it('keeps action selection presentation-only', () => {
    expect(siteVisitDetailActions({ status: 'scheduled', generatedEstimateId: null })[0]?.id).toBe('start-inspection');
    expect(siteVisitDetailActions({ status: 'in_progress', generatedEstimateId: null })[0]?.href).toBe('inspection');
    expect(siteVisitDetailActions({ status: 'completed', generatedEstimateId: 'est-1' })[0]?.href).toBe('/estimates/est-1');
  });

  it('reports required inspection fields missing from current responses', () => {
    const progress = inspectionDetailProgress(
      { customerConcerns: 'Gate is loose' },
      [
        { key: 'customerConcerns', label: 'Customer concerns', type: 'longtext', required: true, displayOrder: 1, visibility: 'staff_only' },
        { key: 'proposedScope', label: 'Proposed scope', type: 'longtext', required: true, displayOrder: 2, visibility: 'staff_only' },
      ]
    );

    expect(progress.completed).toBe(1);
    expect(progress.missingRequired).toEqual(['Proposed scope']);
  });

  it('uses red only for cancelled visits', () => {
    expect(siteVisitStatusTone('cancelled')).toBe('red');
    expect(siteVisitStatusTone('awaiting_scheduling')).toBe('amber');
  });
});
