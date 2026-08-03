import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the deposit-invoice creation gap found while
// populating the Premier CRM Demonstration organization: no application
// code path ever created a kind='deposit' invoice or set
// job_deposits.deposit_invoice_id. Fixed by createDepositInvoice()
// (packages/db/queries/deposits.ts) + createDepositInvoiceAction() here,
// gated by the existing canManageDeposits capability (owner/admin only —
// same boundary as setDepositRequirementAction/waiveDepositAction). These
// tests prove the authorization boundary directly at the server-action call
// site.

const { getServerSupabaseMock, getActiveOrgContextMock, createServiceClientMock, createDepositInvoiceMock } =
  vi.hoisted(() => ({
    getServerSupabaseMock: vi.fn(),
    getActiveOrgContextMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    createDepositInvoiceMock: vi.fn(),
  }));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@/lib/customer-lifecycle-notifications', () => ({
  sendJobScheduledNotification: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@premier/db', () => ({
  getActiveOrgContext: getActiveOrgContextMock,
  createServiceClient: createServiceClientMock,
  createDepositInvoice: createDepositInvoiceMock,
  // Unused by createDepositInvoiceAction but required for module-level imports elsewhere in the file.
  createChangeOrderDraft: vi.fn(),
  createDraftInvoiceFromJob: vi.fn(),
  createDraftQuote: vi.fn(),
  createSchedulingSlot: vi.fn(),
  generateFinalInvoiceFromWorking: vi.fn(),
  getJobById: vi.fn(),
  proposeChangeOrderRevision: vi.fn(),
  scheduleJob: vi.fn(),
  setDepositRequirement: vi.fn(),
  waiveDepositRequirement: vi.fn(),
  withdrawChangeOrderRevision: vi.fn(),
}));

import { createDepositInvoiceAction } from './actions';

const JOB_ID = '22222222-2222-2222-2222-222222222222';
const ORG_ID = 'org-1';

function buildFormData(jobId: string): FormData {
  const fd = new FormData();
  fd.set('jobId', jobId);
  return fd;
}

function mockSignedInAs(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer') {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: ORG_ID, role } });
}

describe('deposit-invoice creation authorization boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({});
  });

  for (const role of ['owner', 'admin'] as const) {
    it(`${role} can create a deposit invoice (canManageDeposits)`, async () => {
      mockSignedInAs(role);
      createDepositInvoiceMock.mockResolvedValue({
        success: true,
        data: { invoiceId: 'inv-1', alreadyExisted: false },
      });

      const result = await createDepositInvoiceAction(null, buildFormData(JOB_ID));

      expect(result.success).toBe(true);
      expect(createDepositInvoiceMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ orgId: ORG_ID, jobId: JOB_ID })
      );
    });
  }

  for (const role of ['employee', 'subcontractor', 'viewer'] as const) {
    it(`${role} CANNOT create a deposit invoice — denied at the action boundary, no DB call made`, async () => {
      mockSignedInAs(role);

      const result = await createDepositInvoiceAction(null, buildFormData(JOB_ID));

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error).toContain('deposits');
      expect(createDepositInvoiceMock).not.toHaveBeenCalled();
    });
  }

  it('is idempotent from the action caller\'s perspective — a second call returns the same invoice via alreadyExisted', async () => {
    mockSignedInAs('owner');
    createDepositInvoiceMock.mockResolvedValue({
      success: true,
      data: { invoiceId: 'inv-1', alreadyExisted: true },
    });

    const result = await createDepositInvoiceAction(null, buildFormData(JOB_ID));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.invoiceId).toBe('inv-1');
  });
});
