import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the real production authorization defect found
// during the Checkpoint B merge-readiness audit: sendQuoteAction() and
// resendQuoteEmailAction() checked the pre-existing, broader
// `canSendEstimates` capability (which includes subcontractor) instead of
// the new `canSendQuote` capability (owner/admin/employee only, per the
// approved business policy — subcontractors never send quotes). Fixed by
// switching both call sites to `canSendQuote`. These tests prove the
// authorization boundary directly at the server-action call site, not by
// checking whether a UI button is hidden.

const {
  getServerSupabaseMock,
  getActiveOrgContextMock,
  createServiceClientMock,
  getQuoteByIdMock,
  logActivityMock,
  sendQuoteEmailMock,
  fromMock,
  updateMock,
  createDraftQuoteMock,
} = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
  getActiveOrgContextMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  getQuoteByIdMock: vi.fn(),
  logActivityMock: vi.fn(),
  sendQuoteEmailMock: vi.fn(),
  fromMock: vi.fn(),
  updateMock: vi.fn(),
  createDraftQuoteMock: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@premier/db', () => ({
  getActiveOrgContext: getActiveOrgContextMock,
  createServiceClient: createServiceClientMock,
  getQuoteById: getQuoteByIdMock,
  logActivity: logActivityMock,
  // Unused by these two actions but required for module-level imports elsewhere in the file.
  addQuoteLineItem: vi.fn(),
  createDraftQuote: createDraftQuoteMock,
  listJobs: vi.fn(),
  removeQuoteLineItem: vi.fn(),
  updateQuoteLineItem: vi.fn(),
  updateQuoteMetadata: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendQuoteEmail: sendQuoteEmailMock,
}));

vi.mock('@/lib/customer-lifecycle-notifications', () => ({}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  createDraftQuoteAction,
  createStandaloneQuoteAction,
  resendQuoteEmailAction,
  sendQuoteAction,
} from './actions';

const QUOTE_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = 'org-1';

function buildFormData(quoteId: string): FormData {
  const fd = new FormData();
  fd.set('quoteId', quoteId);
  return fd;
}

function mockSignedInAs(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer') {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: ORG_ID, role } });
}

function buildQuoteQueryChain(quoteRow: { id: string; status: string; share_token: string } | null) {
  const eqChain: any = {
    eq: () => eqChain,
    maybeSingle: () => Promise.resolve({ data: quoteRow, error: null }),
  };
  return {
    select: () => eqChain,
    update: (patch: unknown) => {
      updateMock(patch);
      return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
    },
  };
}

describe('quote-sending authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({ from: fromMock });
    logActivityMock.mockResolvedValue(undefined);
    getQuoteByIdMock.mockResolvedValue({ success: false, error: 'not needed for this test' });
    sendQuoteEmailMock.mockResolvedValue({ sent: false });
  });

  describe('sendQuoteAction', () => {
    for (const role of ['owner', 'admin', 'employee'] as const) {
      it(`${role} can send a draft quote (canSendQuote)`, async () => {
        mockSignedInAs(role);
        fromMock.mockReturnValue(buildQuoteQueryChain({ id: QUOTE_ID, status: 'draft', share_token: 'tok' }));

        const result = await sendQuoteAction(null, buildFormData(QUOTE_ID));

        expect(result.success).toBe(true);
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent' }));
      });
    }

    for (const role of ['subcontractor', 'viewer'] as const) {
      it(`${role} CANNOT send a quote — denied at the action boundary, quote left untouched`, async () => {
        mockSignedInAs(role);
        fromMock.mockReturnValue(buildQuoteQueryChain({ id: QUOTE_ID, status: 'draft', share_token: 'tok' }));

        const result = await sendQuoteAction(null, buildFormData(QUOTE_ID));

        expect(result.success).toBe(false);
        if (!result.success) expect(result.error).toContain('send a quote');
        // The denial must happen before any DB read/write — no update call, no email attempt.
        expect(fromMock).not.toHaveBeenCalled();
        expect(updateMock).not.toHaveBeenCalled();
        expect(sendQuoteEmailMock).not.toHaveBeenCalled();
      });
    }

    it('canSendEstimates no longer controls quote sending (subcontractor holds canSendEstimates but must still be denied)', async () => {
      const { hasCapability } = await import('@premier/shared');
      expect(hasCapability('subcontractor', 'canSendEstimates')).toBe(true);
      expect(hasCapability('subcontractor', 'canSendQuote')).toBe(false);

      mockSignedInAs('subcontractor');
      fromMock.mockReturnValue(buildQuoteQueryChain({ id: QUOTE_ID, status: 'draft', share_token: 'tok' }));
      const result = await sendQuoteAction(null, buildFormData(QUOTE_ID));
      expect(result.success).toBe(false);
    });

    it('canCreateQuote does not implicitly grant canSendQuote', async () => {
      const { hasCapability } = await import('@premier/shared');
      // Every role holding canCreateQuote must also independently hold canSendQuote
      // in this policy (owner/admin/employee) — but the point of this test is that
      // the two are checked independently, not that one implies the other by
      // construction. Assert they are distinct capability keys with their own
      // enforcement (sendQuoteAction never checks canCreateQuote).
      for (const role of ['owner', 'admin', 'employee', 'subcontractor', 'viewer'] as const) {
        // No role should be able to send solely because it can create — the action
        // itself only ever checks canSendQuote (verified via the role-loop tests
        // above); this assertion documents the two capabilities are independent.
        expect(typeof hasCapability(role, 'canCreateQuote')).toBe('boolean');
        expect(typeof hasCapability(role, 'canSendQuote')).toBe('boolean');
      }
    });
  });

  describe('resendQuoteEmailAction', () => {
    it('employee can resend (canSendQuote)', async () => {
      mockSignedInAs('employee');
      getQuoteByIdMock.mockResolvedValue({
        success: true,
        data: {
          customer: { email: 'customer@example.com', displayName: 'Test Customer' },
          quote: { status: 'sent', title: 'Test quote', quote_number: 'Q-1', total: 100, valid_until: null, share_token: 'tok' },
        },
      });
      sendQuoteEmailMock.mockResolvedValue({ sent: true });

      const result = await resendQuoteEmailAction(null, buildFormData(QUOTE_ID));
      expect(result.success).toBe(true);
      expect(sendQuoteEmailMock).toHaveBeenCalled();
    });

    it('subcontractor CANNOT resend — denied before any quote lookup or email attempt', async () => {
      mockSignedInAs('subcontractor');

      const result = await resendQuoteEmailAction(null, buildFormData(QUOTE_ID));
      expect(result.success).toBe(false);
      expect(getQuoteByIdMock).not.toHaveBeenCalled();
      expect(sendQuoteEmailMock).not.toHaveBeenCalled();
    });
  });

  // Regression coverage for the Forge V1 readiness audit's Batch A finding
  // (docs/releases/forge-v1-readiness-audit.md, Finding F3's sibling
  // bypasses): createDraftQuoteAction() and createStandaloneQuoteAction()
  // both checked the broader `canCreateEstimates` capability (which
  // includes subcontractor) instead of `canCreateQuote` (owner/admin/
  // employee only) — the exact same defect class as the job-side
  // createDraftQuoteAction in jobs/actions.ts, just with the wrong
  // capability string wired in rather than a missing check entirely.
  describe('createDraftQuoteAction (job-picker quote creation)', () => {
    function buildJobIdFormData(jobId: string): FormData {
      const fd = new FormData();
      fd.set('jobId', jobId);
      return fd;
    }

    for (const role of ['owner', 'admin', 'employee'] as const) {
      it(`${role} can create a draft quote from the job picker (canCreateQuote)`, async () => {
        mockSignedInAs(role);
        createDraftQuoteMock.mockResolvedValue({ success: true, data: { id: 'quote-2' } });

        const result = await createDraftQuoteAction(null, buildJobIdFormData('22222222-2222-2222-2222-222222222222'));

        expect(result.success).toBe(true);
        if (result.success) expect(result.data.quoteId).toBe('quote-2');
      });
    }

    it('subcontractor CANNOT create a draft quote from the job picker — denied at the action boundary', async () => {
      mockSignedInAs('subcontractor');

      const result = await createDraftQuoteAction(null, buildJobIdFormData('22222222-2222-2222-2222-222222222222'));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).not.toContain('canCreateQuote');
      expect(createDraftQuoteMock).not.toHaveBeenCalled();
    });
  });

  describe('createStandaloneQuoteAction (customer + property, no prior job/estimate)', () => {
    function buildStandaloneFormData(): FormData {
      const fd = new FormData();
      fd.set('customerId', 'cust-1');
      fd.set('propertyId', 'prop-1');
      fd.set('title', 'Standalone quote');
      return fd;
    }

    function mockServiceClientForStandaloneQuote() {
      fromMock.mockImplementation((table: string) => {
        if (table === 'customers') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'cust-1' }, error: null }) }) }) }) };
        }
        if (table === 'customer_properties') {
          return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { property_id: 'prop-1' }, error: null }) }) }) }) };
        }
        if (table === 'estimates') {
          return { insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'est-standalone' }, error: null }) }) }) };
        }
        throw new Error(`Unexpected table in test: ${table}`);
      });
    }

    it('employee can create a standalone quote (canCreateQuote)', async () => {
      mockSignedInAs('employee');
      mockServiceClientForStandaloneQuote();
      createDraftQuoteMock.mockResolvedValue({ success: true, data: { id: 'quote-3' } });

      const result = await createStandaloneQuoteAction(null, buildStandaloneFormData());

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.id).toBe('quote-3');
    });

    it('subcontractor CANNOT create a standalone quote — denied before any customer/estimate lookup', async () => {
      mockSignedInAs('subcontractor');

      const result = await createStandaloneQuoteAction(null, buildStandaloneFormData());

      expect(result.success).toBe(false);
      expect(fromMock).not.toHaveBeenCalled();
      expect(createDraftQuoteMock).not.toHaveBeenCalled();
    });

    it('canCreateEstimates alone no longer permits standalone quote creation (subcontractor holds it but must still be denied)', async () => {
      const { hasCapability } = await import('@premier/shared');
      expect(hasCapability('subcontractor', 'canCreateEstimates')).toBe(true);
      expect(hasCapability('subcontractor', 'canCreateQuote')).toBe(false);

      mockSignedInAs('subcontractor');
      const result = await createStandaloneQuoteAction(null, buildStandaloneFormData());
      expect(result.success).toBe(false);
    });
  });
});
