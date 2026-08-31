import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for BLOCKER 1 in docs/ops/invoice-cutover-readiness.md:
// sendInvoiceAction flips invoices.status to 'sent' regardless of whether the
// customer was actually emailed, and (before this fix) never durably recorded
// which outcome happened — only an ephemeral client-side toast. These tests
// prove, at the server-action boundary (not the UI), that:
//   1. the send transition always succeeds independent of email outcome,
//   2. the real delivery outcome is logged to activity_log either way,
//   3. retryInvoiceEmailAction never touches financial state (no status
//      transition, no total recalculation, no new share_token) and is
//      blocked for draft/void invoices,
//   4. getInvoiceEmailDeliveryStatusAction reads back the most recent
//      logged outcome.
// The external email provider (Resend) is mocked throughout — no real email
// is ever sent by this test file.

const {
  getServerSupabaseMock,
  getActiveOrgContextMock,
  createServiceClientMock,
  getInvoiceByIdMock,
  getLatestEntityEventMock,
  logActivityMock,
  sendInvoiceMock,
  sendInvoiceEmailMock,
} = vi.hoisted(() => ({
  getServerSupabaseMock: vi.fn(),
  getActiveOrgContextMock: vi.fn(),
  createServiceClientMock: vi.fn(),
  getInvoiceByIdMock: vi.fn(),
  getLatestEntityEventMock: vi.fn(),
  logActivityMock: vi.fn(),
  sendInvoiceMock: vi.fn(),
  sendInvoiceEmailMock: vi.fn(),
}));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@premier/db', () => ({
  getActiveOrgContext: getActiveOrgContextMock,
  createServiceClient: createServiceClientMock,
  getInvoiceById: getInvoiceByIdMock,
  getLatestEntityEvent: getLatestEntityEventMock,
  logActivity: logActivityMock,
  sendInvoice: sendInvoiceMock,
  // Unused by the actions under test but required for module-level imports.
  addExpenseChargeToInvoice: vi.fn(),
  addInvoiceLineItem: vi.fn(),
  createDraftInvoiceFromJob: vi.fn(),
  createDraftInvoiceFromQuote: vi.fn(),
  listJobs: vi.fn(),
  recordPayment: vi.fn(),
  removeInvoiceLineItem: vi.fn(),
  updateInvoiceLineItem: vi.fn(),
  updateInvoiceMetadata: vi.fn(),
  voidInvoice: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendInvoiceEmail: sendInvoiceEmailMock,
}));

vi.mock('@/lib/customer-lifecycle-notifications', () => ({
  sendPaymentRecordedNotification: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  getInvoiceEmailDeliveryStatusAction,
  retryInvoiceEmailAction,
  sendInvoiceAction,
} from './actions';

const INVOICE_ID = '11111111-1111-1111-1111-111111111111';
const ORG_ID = 'org-1';

function buildFormData(invoiceId: string): FormData {
  const fd = new FormData();
  fd.set('invoiceId', invoiceId);
  return fd;
}

function mockSignedInAsOwner() {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: ORG_ID, role: 'owner' } });
}

function invoiceDetail(overrides: {
  customerEmail: string | null;
  status: string;
  shareToken: string | null;
}) {
  return {
    success: true as const,
    data: {
      customer: overrides.customerEmail
        ? { email: overrides.customerEmail, displayName: 'Test Customer' }
        : null,
      invoice: {
        id: INVOICE_ID,
        status: overrides.status,
        share_token: overrides.shareToken,
        title: 'Test invoice',
        invoice_number: 'INV-000001',
        total: 100,
        due_date: null,
      },
    },
  };
}

describe('invoice email delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({});
    logActivityMock.mockResolvedValue(undefined);
  });

  describe('sendInvoiceAction', () => {
    it('the send transition succeeds and logs invoice_email_sent when delivery succeeds', async () => {
      mockSignedInAsOwner();
      sendInvoiceMock.mockResolvedValue({ success: true, data: { job_id: 'job-1', share_token: 'tok' } });
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: 'customer@example.com', status: 'sent', shareToken: 'tok' }));
      sendInvoiceEmailMock.mockResolvedValue({ sent: true });

      const result = await sendInvoiceAction(null, buildFormData(INVOICE_ID));

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.emailSent).toBe(true);
      expect(logActivityMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'invoice_email_sent', entityId: INVOICE_ID })
      );
    });

    it('the send transition STILL succeeds (financial state authoritative) but logs invoice_email_failed when delivery fails', async () => {
      mockSignedInAsOwner();
      sendInvoiceMock.mockResolvedValue({ success: true, data: { job_id: 'job-1', share_token: 'tok' } });
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: 'customer@example.com', status: 'sent', shareToken: 'tok' }));
      sendInvoiceEmailMock.mockResolvedValue({ sent: false });

      const result = await sendInvoiceAction(null, buildFormData(INVOICE_ID));

      // The invoice financial/business state transition (draft -> sent) is
      // never rolled back by an email failure — this is Option A's core
      // invariant from docs/ops/invoice-cutover-readiness.md.
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.emailSent).toBe(false);
      expect(sendInvoiceMock).toHaveBeenCalled();
      expect(logActivityMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'invoice_email_failed', entityId: INVOICE_ID })
      );
    });

    it('logs invoice_email_failed (not a silent no-op) when no customer email is on file', async () => {
      mockSignedInAsOwner();
      sendInvoiceMock.mockResolvedValue({ success: true, data: { job_id: 'job-1', share_token: 'tok' } });
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: null, status: 'sent', shareToken: 'tok' }));

      const result = await sendInvoiceAction(null, buildFormData(INVOICE_ID));

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.emailSent).toBe(false);
      expect(sendInvoiceEmailMock).not.toHaveBeenCalled();
      expect(logActivityMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'invoice_email_failed' })
      );
    });
  });

  describe('retryInvoiceEmailAction', () => {
    it('retries delivery using the EXISTING share token — never regenerates it or touches invoice financial state', async () => {
      mockSignedInAsOwner();
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: 'customer@example.com', status: 'sent', shareToken: 'existing-token' }));
      sendInvoiceEmailMock.mockResolvedValue({ sent: true });

      const result = await retryInvoiceEmailAction(null, buildFormData(INVOICE_ID));

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.emailSent).toBe(true);
      // sendInvoice() (the status-transition function) must never be called by retry.
      expect(sendInvoiceMock).not.toHaveBeenCalled();
      expect(sendInvoiceEmailMock).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceUrl: '/i/existing-token' })
      );
    });

    it('is blocked for a draft invoice (nothing to retry yet)', async () => {
      mockSignedInAsOwner();
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: 'customer@example.com', status: 'draft', shareToken: null }));

      const result = await retryInvoiceEmailAction(null, buildFormData(INVOICE_ID));

      expect(result.success).toBe(false);
      expect(sendInvoiceEmailMock).not.toHaveBeenCalled();
    });

    it('is blocked for a void invoice', async () => {
      mockSignedInAsOwner();
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: 'customer@example.com', status: 'void', shareToken: 'tok' }));

      const result = await retryInvoiceEmailAction(null, buildFormData(INVOICE_ID));

      expect(result.success).toBe(false);
      expect(sendInvoiceEmailMock).not.toHaveBeenCalled();
    });

    it('logs invoice_email_failed on a failed retry — a retry failure must never look like success', async () => {
      mockSignedInAsOwner();
      getInvoiceByIdMock.mockResolvedValue(invoiceDetail({ customerEmail: 'customer@example.com', status: 'sent', shareToken: 'tok' }));
      sendInvoiceEmailMock.mockResolvedValue({ sent: false });

      const result = await retryInvoiceEmailAction(null, buildFormData(INVOICE_ID));

      expect(result.success).toBe(true);
      if (result.success) expect(result.data.emailSent).toBe(false);
      expect(logActivityMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ eventType: 'invoice_email_failed' })
      );
    });
  });

  describe('getInvoiceEmailDeliveryStatusAction', () => {
    it("returns 'sent' from the most recent invoice_email_sent event", async () => {
      mockSignedInAsOwner();
      getLatestEntityEventMock.mockResolvedValue({ success: true, data: { event_type: 'invoice_email_sent' } });

      const result = await getInvoiceEmailDeliveryStatusAction(INVOICE_ID);
      expect(result).toEqual({ success: true, data: 'sent' });
    });

    it("returns 'failed' from the most recent invoice_email_failed event", async () => {
      mockSignedInAsOwner();
      getLatestEntityEventMock.mockResolvedValue({ success: true, data: { event_type: 'invoice_email_failed' } });

      const result = await getInvoiceEmailDeliveryStatusAction(INVOICE_ID);
      expect(result).toEqual({ success: true, data: 'failed' });
    });

    it("returns 'unknown' when no delivery attempt has ever been logged", async () => {
      mockSignedInAsOwner();
      getLatestEntityEventMock.mockResolvedValue({ success: true, data: null });

      const result = await getInvoiceEmailDeliveryStatusAction(INVOICE_ID);
      expect(result).toEqual({ success: true, data: 'unknown' });
    });
  });
});
