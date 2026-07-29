import { describe, expect, it } from 'vitest';

import {
  getPortalRequestStatusDescription,
  getPortalRequestStatusLabel,
  getRequestIntakePath,
  getRequestIntakePathLabel,
} from './request-intake-flow';

describe('request intake flow helpers', () => {
  it('derives the inspection path when an estimate exists', () => {
    expect(getRequestIntakePath({ estimateId: 'est_1', jobId: null })).toBe('inspection');
    expect(getRequestIntakePathLabel('inspection')).toBe('Inspection flow');
  });

  it('derives the work-order path when only a job exists', () => {
    expect(getRequestIntakePath({ estimateId: null, jobId: 'job_1' })).toBe('work_order');
    expect(getRequestIntakePathLabel('work_order')).toBe('Work-order path');
  });

  it('returns customer-facing labels for reviewed and work-order states', () => {
    expect(
      getPortalRequestStatusLabel({ status: 'reviewing', estimateId: null, jobId: null })
    ).toBe('Viewed');
    expect(
      getPortalRequestStatusLabel({ status: 'approved', estimateId: null, jobId: 'job_1' })
    ).toBe('Work order created');
    expect(
      getPortalRequestStatusLabel({ status: 'scheduled', estimateId: null, jobId: 'job_1' })
    ).toBe('Work scheduled');
  });

  it('returns customer-facing descriptions for the two intake paths', () => {
    expect(
      getPortalRequestStatusDescription({
        status: 'estimate_created',
        estimateId: 'est_1',
        jobId: null,
      })
    ).toContain('inspection-and-estimate flow');

    expect(
      getPortalRequestStatusDescription({
        status: 'approved',
        estimateId: null,
        jobId: 'job_1',
      })
    ).toContain('turned into a work order');
  });
});
