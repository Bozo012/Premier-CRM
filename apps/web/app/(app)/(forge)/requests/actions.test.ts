import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as PremierDb from '@premier/db';

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
//
// Also covers F2 (docs/implementation/v1-known-gaps-audit.md §9):
// createEstimateFromRequestAction() now delegates to record_request_triage
// instead of hand-reproducing its transition logic, so its tests mock the
// RPC boundary (`rpcMock`) the same way
// site-visits/triage-consolidation.test.ts does for
// recordRequestTriageAction, using the real `recordRequestTriage` query-layer
// function (vi.importActual) rather than re-mocking it — this proves the
// action passes decision='remote_estimate' through unmodified, not that a
// second hand-written mock happens to agree with the RPC.

const { getServerSupabaseMock, getActiveOrgContextMock, createServiceClientMock, createServiceRequestMock, logActivityMock, fromMock, rpcMock } =
  vi.hoisted(() => ({
    getServerSupabaseMock: vi.fn(),
    getActiveOrgContextMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    createServiceRequestMock: vi.fn(),
    logActivityMock: vi.fn(),
    fromMock: vi.fn(),
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
    createServiceClient: createServiceClientMock,
    createServiceRequest: createServiceRequestMock,
    logActivity: logActivityMock,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  createEstimateFromRequestAction,
  createJobFromRequestAction,
  createManualRequestAction,
  markRequestReviewedAction,
} from './actions';

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

function buildManualRequestFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = {
    name: 'Test Customer',
    email: 'customer@example.com',
    phone: '',
    preferredChannel: 'email',
    addressLine1: '123 Test Lane',
    addressLine2: '',
    city: 'Lexington',
    state: 'KY',
    zip: '40502',
    country: 'US',
    propertyType: 'single_family',
    serviceCategory: 'Gutter cleaning',
    serviceTitle: 'Gutter issue',
    serviceDescription: 'Water is overflowing from the front gutter.',
    preferredDate: '',
    preferredTime: '',
    accessNotes: '',
    priority: 'normal',
    ...overrides,
  };

  for (const [key, value] of Object.entries(values)) {
    fd.set(key, value);
  }

  return fd;
}

function mockSignedInAs(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer') {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
    rpc: rpcMock,
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

describe('manual staff request intake (createManualRequestAction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ from: fromMock });
  });

  it('creates a manual-origin request and returns its detail route id', async () => {
    mockSignedInAs('employee');
    createServiceRequestMock.mockResolvedValue({
      success: true,
      data: {
        serviceRequestId: REQUEST_ID,
        requestNumber: 'SR-000001',
        customerId: CUSTOMER_ID,
        propertyId: PROPERTY_ID,
        dedupedCustomer: false,
        dedupedProperty: false,
      },
    });

    const result = await createManualRequestAction(null, buildManualRequestFormData());

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.requestId).toBe(REQUEST_ID);
    expect(createServiceRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: ORG_ID,
        source: 'manual',
        payload: expect.objectContaining({
          email: 'customer@example.com',
          priority: 'normal',
          service_title: 'Gutter issue',
        }),
      })
    );
  });

  it('viewer cannot create a staff request', async () => {
    mockSignedInAs('viewer');

    const result = await createManualRequestAction(null, buildManualRequestFormData());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('create requests');
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(createServiceRequestMock).not.toHaveBeenCalled();
  });

  it('validates required contact details before creating anything', async () => {
    mockSignedInAs('employee');

    const result = await createManualRequestAction(
      null,
      buildManualRequestFormData({ email: '', phone: '' })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('At least one of email or phone is required');
    expect(createServiceRequestMock).not.toHaveBeenCalled();
  });
});

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

describe('remote-estimate conversion path delegates to record_request_triage (Finding F2 fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ from: fromMock });
    logActivityMock.mockResolvedValue(undefined);
  });

  for (const role of ['owner', 'admin', 'employee', 'subcontractor'] as const) {
    it(`${role} can create an estimate from a request (canTriageRequests, matches TriagePanel's own gate)`, async () => {
      mockSignedInAs(role);
      rpcMock.mockResolvedValue({ data: { estimateId: 'est-1', siteVisitId: null, jobId: null }, error: null });

      const result = await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.estimateId).toBe('est-1');
    });
  }

  it('viewer CANNOT create an estimate from a request — the RPC-level canTriageRequests gate now applies here too (previously this legacy action had no capability check at all)', async () => {
    mockSignedInAs('viewer');
    rpcMock.mockResolvedValue({ data: null, error: { message: 'Role viewer does not have canTriageRequests' } });

    const result = await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));

    expect(result.success).toBe(false);
  });

  it('calls record_request_triage with decision=remote_estimate unmodified — no second, hand-written source of triage semantics', async () => {
    mockSignedInAs('owner');
    rpcMock.mockResolvedValue({ data: { estimateId: 'est-1', siteVisitId: null, jobId: null }, error: null });

    await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));

    expect(rpcMock).toHaveBeenCalledWith(
      'record_request_triage',
      expect.objectContaining({ p_request_id: REQUEST_ID, p_decision: 'remote_estimate' })
    );
    // No raw table writes — the RPC is the sole write path now.
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('a request already triaged some other way rejects the legacy conversion instead of creating a second, conflicting estimate — the RPC-level "already triaged" rule is surfaced, not swallowed', async () => {
    mockSignedInAs('owner');
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'This request has already been triaged — use correct_request_triage to change it' },
    });

    const result = await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('already been triaged');
    // Exactly one attempt — no retry/fallback path that could create a
    // duplicate estimate through some other write.
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it('repeated conversion attempts remain safe — a second call surfaces the same rejection, not a second estimate', async () => {
    mockSignedInAs('owner');
    rpcMock.mockResolvedValueOnce({ data: { estimateId: 'est-1', siteVisitId: null, jobId: null }, error: null });
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'This request has already been triaged — use correct_request_triage to change it' },
    });

    const first = await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));
    const second = await createEstimateFromRequestAction(null, buildFormData(REQUEST_ID));

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});

// Regression coverage for the Forge V1.0.1 security patch
// (docs/security/service-requests-authorization-audit.md, Finding SR-3):
// markRequestReviewedAction() had no capability check at all — any
// signed-in org member, including viewer, could mark a request reviewed.
// Fixed by reusing the existing canTriageRequests capability (request
// review is part of the same request-workflow lifecycle as triage), not
// by inventing a new permission.
describe('request-review authorization boundary (markRequestReviewedAction)', () => {
  function buildReviewFormData(requestId: string): FormData {
    const fd = new FormData();
    fd.set('taskId', requestId);
    return fd;
  }

  function mockServiceClientForReview() {
    fromMock.mockImplementation((table: string) => {
      if (table === 'service_requests') {
        return { update: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }) };
      }
      throw new Error(`Unexpected table in test: ${table}`);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ from: fromMock });
    logActivityMock.mockResolvedValue(undefined);
  });

  for (const role of ['owner', 'admin', 'employee', 'subcontractor'] as const) {
    it(`${role} can mark a request reviewed (canTriageRequests)`, async () => {
      mockSignedInAs(role);
      mockServiceClientForReview();

      const result = await markRequestReviewedAction(null, buildReviewFormData(REQUEST_ID));

      expect(result.success).toBe(true);
    });
  }

  it('viewer CANNOT mark a request reviewed — denied at the action boundary before any DB call', async () => {
    mockSignedInAs('viewer');

    const result = await markRequestReviewedAction(null, buildReviewFormData(REQUEST_ID));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('review requests');
      expect(result.error).not.toContain('canTriageRequests');
    }
    expect(createServiceClientMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('cross-org / unauthenticated: getRequestActionContext failure is returned before the capability check ever runs', async () => {
    getServerSupabaseMock.mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    });

    const result = await markRequestReviewedAction(null, buildReviewFormData(REQUEST_ID));

    expect(result.success).toBe(false);
    expect(createServiceClientMock).not.toHaveBeenCalled();
  });

  it('remains denied even when the action is invoked directly, without going through the UI button', async () => {
    mockSignedInAs('viewer');

    const result = await markRequestReviewedAction(null, buildReviewFormData(REQUEST_ID));

    expect(result.success).toBe(false);
  });
});
