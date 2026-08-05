import { describe, expect, it } from 'vitest';

import {
  estimatePricingReviewState,
  estimateStatusTone,
  sumEstimateLineItems,
  toForgeEstimateSummary,
} from './forge-estimate-view-model';

describe('forge estimate view model', () => {
  it('maps source and next action without changing workflow state', () => {
    const model = toForgeEstimateSummary({
      id: 'est-1',
      estimateNumber: 'EST-001',
      title: 'Fence repair',
      status: 'draft',
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-05T12:00:00.000Z',
      expiresAt: null,
      siteVisitAt: null,
      serviceRequestId: 'req-1',
      convertedJobId: null,
      customer: {
        id: 'cust-1',
        displayName: 'Sam Customer',
        email: 'sam@example.com',
        phonePrimary: '555-0100',
      },
      property: {
        id: 'prop-1',
        addressLine1: '1 Main St',
        city: 'Florence',
        state: 'KY',
        zip: '41042',
      },
    });

    expect(model.originLabel).toBe('From request');
    expect(model.nextActionLabel).toBe('Review pricing');
    expect(model.statusTone).toBe('neutral');
  });

  it('keeps totals derived from supplied line items only', () => {
    expect(
      sumEstimateLineItems([
        { id: 'li-1', description: 'Labor', quantity: 2, unitPrice: 150, isSystemSuggested: false, sortOrder: 0 },
        { id: 'li-2', description: 'Materials', quantity: 1, unitPrice: 75, isSystemSuggested: true, sortOrder: 1 },
      ])
    ).toBe(375);
  });

  it('maps pricing review states into visible labels and tones', () => {
    expect(estimatePricingReviewState({ pricingReviewedAt: null, pricingReviewStatus: 'pending_review' })).toEqual({
      label: 'Pending review',
      tone: 'amber',
    });
    expect(estimatePricingReviewState({ pricingReviewedAt: '2026-08-05T12:00:00.000Z', pricingReviewStatus: null })).toEqual({
      label: 'Pricing approved',
      tone: 'emerald',
    });
  });

  it('uses destructive tone only for terminal rejection-like states', () => {
    expect(estimateStatusTone('declined')).toBe('red');
    expect(estimateStatusTone('converted')).toBe('emerald');
  });
});
