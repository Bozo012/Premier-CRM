import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the pricing-review handoff found missing (and the
// pricing-approval presentation defect found alongside it) during Kevin's
// Demo UI observation: employees had no way to signal an estimate was ready
// for owner review, and the estimate page rendered an actionable "Approve
// pricing" button + raw RPC exception text to roles that could never use
// it. The real fixes are presentation-layer (PricingReviewPanel — see
// apps/web/app/(app)/estimates/_components/pricing-review-panel.tsx) and a
// new request/return-for-changes RPC pair (migration 20260803050000); these
// tests prove the action layer's plain-language error translation (defense
// in depth, in case an action is ever invoked directly) and correct
// pass-through behavior.

const {
  getServerSupabaseMock,
  getActiveOrgContextMock,
  approveEstimatePricingMock,
  reopenEstimateForEditMock,
  requestEstimatePricingReviewMock,
  returnEstimatePricingForChangesMock,
} = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
  getActiveOrgContextMock: vi.fn(),
  approveEstimatePricingMock: vi.fn(),
  reopenEstimateForEditMock: vi.fn(),
  requestEstimatePricingReviewMock: vi.fn(),
  returnEstimatePricingForChangesMock: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@/lib/site-visit-attachments', () => ({
  finalizeSiteVisitUpload: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@premier/db', () => ({
  getActiveOrgContext: getActiveOrgContextMock,
  approveEstimatePricing: approveEstimatePricingMock,
  reopenEstimateForEdit: reopenEstimateForEditMock,
  requestEstimatePricingReview: requestEstimatePricingReviewMock,
  returnEstimatePricingForChanges: returnEstimatePricingForChangesMock,
  // Unused by these actions but required for module-level imports elsewhere in the file.
  cancelSiteVisit: vi.fn(),
  cancelSiteVisitAppointment: vi.fn(),
  completeSiteVisit: vi.fn(),
  correctRequestTriage: vi.fn(),
  createServiceClient: vi.fn(),
  createQuoteFromEstimateRpc: vi.fn(),
  generateEstimateFromSiteVisit: vi.fn(),
  recordRequestTriage: vi.fn(),
  rescheduleSiteVisit: vi.fn(),
  requestPendingUpload: vi.fn(),
  saveSiteVisitInspectionTrusted: vi.fn(),
  scheduleSiteVisit: vi.fn(),
  startSiteVisit: vi.fn(),
  undoSiteVisitStart: vi.fn(),
}));

import {
  approveEstimatePricingAction,
  reopenEstimateForEditAction,
  requestEstimatePricingReviewAction,
  returnEstimatePricingForChangesAction,
} from './actions';

const ESTIMATE_ID = '33333333-3333-3333-3333-333333333333';

function buildFormData(extra?: Record<string, string>): FormData {
  const fd = new FormData();
  fd.set('estimateId', ESTIMATE_ID);
  for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
  return fd;
}

function mockSignedIn() {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: 'org-1', role: 'employee' } });
}

describe('pricing-review action error translation (defense in depth)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignedIn();
  });

  it('approveEstimatePricingAction translates a raw capability-denial message into plain language', async () => {
    approveEstimatePricingMock.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Role does not have canApproveEstimatePricing',
    });

    const result = await approveEstimatePricingAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('canApproveEstimatePricing');
      expect(result.error).toBe("You don't have permission to do this. Ask an owner or administrator.");
    }
  });

  it('reopenEstimateForEditAction translates a raw capability-denial message into plain language', async () => {
    reopenEstimateForEditMock.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Role does not have canApproveEstimatePricing',
    });

    const result = await reopenEstimateForEditAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('canApproveEstimatePricing');
    }
  });

  it('approveEstimatePricingAction passes through unrelated error messages unchanged', async () => {
    approveEstimatePricingMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Estimate pricing is already approved',
    });

    const result = await approveEstimatePricingAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('Estimate pricing is already approved');
    }
  });

  it('approveEstimatePricingAction succeeds normally when the underlying RPC succeeds', async () => {
    approveEstimatePricingMock.mockResolvedValue({ success: true, data: null });

    const result = await approveEstimatePricingAction(null, buildFormData());

    expect(result.success).toBe(true);
  });
});

describe('requestEstimatePricingReviewAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignedIn();
  });

  it('succeeds and calls the RPC wrapper with the estimate id', async () => {
    requestEstimatePricingReviewMock.mockResolvedValue({ success: true, data: null });

    const result = await requestEstimatePricingReviewAction(null, buildFormData());

    expect(result.success).toBe(true);
    expect(requestEstimatePricingReviewMock).toHaveBeenCalledWith(expect.anything(), ESTIMATE_ID);
  });

  it('translates a duplicate-submission error into plain language via the raw-message passthrough (non-capability messages stay human-readable already)', async () => {
    requestEstimatePricingReviewMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'This estimate is already pending pricing review.',
    });

    const result = await requestEstimatePricingReviewAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe('This estimate is already pending pricing review.');
    }
  });

  it('translates a raw capability-denial message into plain language', async () => {
    requestEstimatePricingReviewMock.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Role does not have canEditEstimate',
    });

    const result = await requestEstimatePricingReviewAction(null, buildFormData());

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('canEditEstimate');
    }
  });
});

describe('returnEstimatePricingForChangesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSignedIn();
  });

  it('requires a non-empty note before calling the RPC at all', async () => {
    const result = await returnEstimatePricingForChangesAction(null, buildFormData({ note: '' }));

    expect(result.success).toBe(false);
    expect(returnEstimatePricingForChangesMock).not.toHaveBeenCalled();
  });

  it('succeeds and passes the note through to the RPC wrapper', async () => {
    returnEstimatePricingForChangesMock.mockResolvedValue({ success: true, data: null });

    const result = await returnEstimatePricingForChangesAction(null, buildFormData({ note: 'Double-check labor hours.' }));

    expect(result.success).toBe(true);
    expect(returnEstimatePricingForChangesMock).toHaveBeenCalledWith(expect.anything(), {
      estimateId: ESTIMATE_ID,
      note: 'Double-check labor hours.',
    });
  });

  it('translates a raw capability-denial message into plain language', async () => {
    returnEstimatePricingForChangesMock.mockResolvedValue({
      success: false,
      code: 'FORBIDDEN',
      error: 'Role does not have canApproveEstimatePricing',
    });

    const result = await returnEstimatePricingForChangesAction(null, buildFormData({ note: 'x' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain('canApproveEstimatePricing');
    }
  });
});
