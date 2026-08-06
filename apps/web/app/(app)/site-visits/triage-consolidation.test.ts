import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PremierDb from '@premier/db';

// Regression coverage for Batch 8's triage consolidation
// (docs/ux/forge-base44-batch-8-requests-site-visits-inspection-report.md):
// TriagePanel (calling recordRequestTriageAction/correctRequestTriageAction)
// is now the sole visible Request Detail trigger for
// remote_estimate/site_visit_required/direct_work_order. These tests prove
// the action-layer wrappers pass decisions through to the authoritative RPCs
// unmodified and surface the RPCs' own duplicate-prevention error verbatim —
// they do not re-implement or weaken any RPC-side rule.

const { getServerSupabaseMock, getActiveOrgContextMock, rpcMock } = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
  getActiveOrgContextMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@premier/db', async () => {
  const actual = await vi.importActual<typeof PremierDb>('@premier/db');
  return {
    ...actual,
    getActiveOrgContext: getActiveOrgContextMock,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('./error-translation', () => ({
  toUserFacingError: (message: string) => message,
}));

import { recordRequestTriageAction, correctRequestTriageAction } from './actions';

const REQUEST_ID = '44444444-4444-4444-4444-444444444444';
const ORG_ID = 'org-1';

function mockSignedIn() {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: rpcMock,
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: ORG_ID, role: 'owner' } });
}

function buildTriageFormData(decision: string, reason = 'test reason') {
  const fd = new FormData();
  fd.set('requestId', REQUEST_ID);
  fd.set('decision', decision);
  fd.set('reason', reason);
  return fd;
}

describe('triage consolidation — RPC pass-through', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  for (const decision of ['remote_estimate', 'site_visit_required', 'direct_work_order'] as const) {
    it(`recordRequestTriageAction(${decision}) calls record_request_triage with the decision unmodified`, async () => {
      mockSignedIn();
      rpcMock.mockResolvedValue({ data: { estimateId: null, siteVisitId: null, jobId: null }, error: null });

      const result = await recordRequestTriageAction(null, buildTriageFormData(decision));

      expect(result.success).toBe(true);
      expect(rpcMock).toHaveBeenCalledWith(
        'record_request_triage',
        expect.objectContaining({ p_request_id: REQUEST_ID, p_decision: decision })
      );
    });
  }

  it('repeated triage submission does not silently succeed twice — the RPC-level "already triaged" rejection is surfaced, not swallowed', async () => {
    mockSignedIn();
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'This request has already been triaged — use correct_request_triage to change it' },
    });

    const result = await recordRequestTriageAction(null, buildTriageFormData('remote_estimate'));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('already been triaged');
    }
    // No fallback/retry logic in the action wrapper — exactly one RPC call.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('correctRequestTriageAction requires a reason and passes newDecision through to correct_request_triage', async () => {
    mockSignedIn();

    const missingReason = await correctRequestTriageAction(
      null,
      (() => {
        const fd = new FormData();
        fd.set('requestId', REQUEST_ID);
        fd.set('newDecision', 'direct_work_order');
        return fd;
      })()
    );
    expect(missingReason.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();

    rpcMock.mockResolvedValue({ data: { estimateId: null, siteVisitId: null, jobId: 'job-1' }, error: null });
    const fd = new FormData();
    fd.set('requestId', REQUEST_ID);
    fd.set('newDecision', 'direct_work_order');
    fd.set('reason', 'correcting to direct work order');

    const result = await correctRequestTriageAction(null, fd);

    expect(result.success).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith(
      'correct_request_triage',
      expect.objectContaining({ p_new_decision: 'direct_work_order' })
    );
  });
});
