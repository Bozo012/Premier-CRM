import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the Forge V1 readiness audit's Batch A finding
// (docs/releases/forge-v1-readiness-audit.md, Finding F1):
// createJobFromRequestAction() created an approved job directly from a
// request with NO capability check at all, bypassing the owner/admin-only
// canCreateDirectWorkOrder restriction that the guarded
// record_request_triage() RPC enforces for the identical business
// operation (creating a direct work order). These tests prove the
// authorization boundary directly at the server-action call site, not by
// checking whether a UI button is hidden — matching the established
// pattern in jobs/actions.test.ts and quotes/actions.test.ts.

const { getServerSupabaseMock, getActiveOrgContextMock, createServiceClientMock, logActivityMock, fromMock } =
  vi.hoisted(() => ({
    getServerSupabaseMock: vi.fn(),
    getActiveOrgContextMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    logActivityMock: vi.fn(),
    fromMock: vi.fn(),
  }));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@premier/db', () => ({
  getActiveOrgContext: getActiveOrgContextMock,
  createServiceClient: createServiceClientMock,
  logActivity: logActivityMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { createEstimateFromRequestAction, createJobFromRequestAction } from './actions';

const REQUEST_ID = '33333333-3333-3333-3333-333333333333';
const ORG_ID = 'org-1';
const CUSTOMER_ID = 'cust-1';
const PROPERTY_ID = 'prop-1';
const JOB_ID = 'job-1';

function buildFormData(requestId: string): FormData {
  const fd = new FormData();
  fd.set('requestId', requestId);
  return fd;
}

function mockSignedInAs(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer') {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: ORG_ID, role } });
}

function buildRequestRow() {
  return {
    id: REQUEST_ID,
    customer_id: CUSTOMER_ID,
    estimate_id: null,
    job_id: null,
    property_id: PROPERTY_ID,
    service_category: 'Deck repair',
    service_description: 'Fix the deck',
    service_title: 'Deck repair',
  };
}

function mockServiceClientForConversion(createdTable: 'jobs' | 'estimates', createdId: string) {
  const requestRow = buildRequestRow();
  fromMock.mockImplementation((table: string) => {
    if (table === 'service_requests') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: requestRow, error: null }) }),
          }),
        }),
        update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      };
    }
    if (table === createdTable) {
      return {
        insert: () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: createdId }, error: null }) }),
        }),
      };
    }
    throw new Error(`Unexpected table in test: ${table}`);
  });
}

describe('direct-work-order authorization boundary (createJobFromRequestAction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ from: fromMock });
    logActivityMock.mockResolvedValue(undefined);
  });

  for (const role of ['owner', 'admin'] as const) {
    it(`${role} can create a direct work order (canCreateDirectWorkOrder)`, async () => {
      mockSignedInAs(role);
      mockServiceClientForConversion('jobs', JOB_ID);

      const result = await createJobFromRequestAction(null, buildFormData(REQUEST_ID));

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.jobId).toBe(JOB_ID);
    });
  }

  for (const role of ['employee', 'subcontractor', 'viewer'] as const) {
    it(`${role} CANNOT create a direct work order — denied at the action boundary before any DB call`, async () => {
      mockSignedInAs(role);

      const result = await createJobFromRequestAction(null, buildFormData(REQUEST_ID));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('owner or admin');
        // Plain-language error only — never leak the raw capability identifier.
        expect(result.error).not.toContain('canCreateDirectWorkOrder');
      }
      // Denial must occur before any job/request/activity mutation: zero
      // jobs created, request status untouched, no activity_log row.
      expect(createServiceClientMock).not.toHaveBeenCalled();
      expect(fromMock).not.toHaveBeenCalled();
      expect(logActivityMock).not.toHaveBeenCalled();
    });
  }

  it('remains denied even when the action is invoked directly, without going through the UI button', async () => {
    // The React component (CreateJobButton) is not involved in this test at
    // all — this calls the exported server action the same way a direct
    // fetch/RPC bypass would, proving the action itself is the boundary,
    // not the button's visibility.
    mockSignedInAs('subcontractor');

    const result = await createJobFromRequestAction(null, buildFormData(REQUEST_ID));

    expect(result.success).toBe(false);
  });
});

describe('remote-estimate conversion path is unaffected by the Batch A fix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ from: fromMock });
    logActivityMock.mockResolvedValue(undefined);
  });

  it('subcontractor can still create an estimate from a request (canCreateEstimates, unchanged — Finding F2 is explicitly out of Batch A scope)', async () => {
    mockSignedInAs('subcontractor');
    mockServiceClientForConversion('estimates', 'est-1');

    const result = await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));

    expect(result.success).toBe(true);
  });
});
