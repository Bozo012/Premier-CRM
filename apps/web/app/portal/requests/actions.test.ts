import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unit coverage for createPortalServiceRequestAction's own pure-logic edge
// cases: unauthenticated/unlinked callers, and the thin client-facing Zod
// validation (missing title, missing description, malformed property_id)
// that exists purely for fast, friendly errors before the RPC's own
// server-side checks run. The RPC's actual authorization/ownership logic
// (customer_accounts resolution, property-ownership verification, status/
// priority defaulting) lives in SQL and is covered by the E2E spec
// (tests/e2e/portal-request-creation-bot.spec.ts) against a real database,
// not here — this file does not attempt to re-test SQL behavior with a
// mocked RPC.

const { resolveActivePortalAccountMock, createPortalServiceRequestMock, revalidatePathMock } = vi.hoisted(() => ({
  resolveActivePortalAccountMock: vi.fn(),
  createPortalServiceRequestMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock('../_lib/portal-session', () => ({
  resolveActivePortalAccount: resolveActivePortalAccountMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock('@premier/db', () => ({
  createPortalServiceRequest: createPortalServiceRequestMock,
}));

import { createPortalServiceRequestAction } from './actions';

const PORTAL_CLIENT = { rpc: vi.fn() };

function buildFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function mockSignedIn() {
  resolveActivePortalAccountMock.mockResolvedValue({
    account: { customerId: 'customer-1', email: 'c@example.com', orgId: 'org-1', status: 'active', userId: 'user-1' },
    portalClient: PORTAL_CLIENT,
  });
}

describe('createPortalServiceRequestAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when no active portal account is linked', async () => {
    resolveActivePortalAccountMock.mockResolvedValue({ account: null, portalClient: PORTAL_CLIENT });

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: 'Leaky faucet', serviceDescription: 'Kitchen faucet is dripping.' })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('FORBIDDEN');
    expect(createPortalServiceRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a missing service title before calling the RPC wrapper', async () => {
    mockSignedIn();

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: '', serviceDescription: 'Kitchen faucet is dripping.' })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    expect(createPortalServiceRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a missing service description before calling the RPC wrapper', async () => {
    mockSignedIn();

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: 'Leaky faucet', serviceDescription: '' })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    expect(createPortalServiceRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a service title over 200 characters', async () => {
    mockSignedIn();

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: 'x'.repeat(201), serviceDescription: 'Kitchen faucet is dripping.' })
    );

    expect(result.success).toBe(false);
    expect(createPortalServiceRequestMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed (non-uuid) propertyId before calling the RPC wrapper', async () => {
    mockSignedIn();

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({
        serviceTitle: 'Leaky faucet',
        serviceDescription: 'Kitchen faucet is dripping.',
        propertyId: 'not-a-uuid',
      })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('VALIDATION_ERROR');
    expect(createPortalServiceRequestMock).not.toHaveBeenCalled();
  });

  it('accepts an empty propertyId (no specific property) and passes null through', async () => {
    mockSignedIn();
    createPortalServiceRequestMock.mockResolvedValue({
      success: true,
      data: { serviceRequestId: 'req-1', requestNumber: 'SR-000001', status: 'new', submittedAt: '2026-01-01T00:00:00Z' },
    });

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: 'Leaky faucet', serviceDescription: 'Kitchen faucet is dripping.', propertyId: '' })
    );

    expect(result.success).toBe(true);
    expect(createPortalServiceRequestMock).toHaveBeenCalledWith(
      PORTAL_CLIENT,
      expect.objectContaining({
        serviceTitle: 'Leaky faucet',
        serviceDescription: 'Kitchen faucet is dripping.',
        propertyId: null,
      })
    );
    expect(revalidatePathMock).toHaveBeenCalledWith('/portal/requests');
  });

  it('passes a valid propertyId through unchanged and revalidates on success', async () => {
    mockSignedIn();
    const propertyId = '11111111-1111-1111-1111-111111111111';
    createPortalServiceRequestMock.mockResolvedValue({
      success: true,
      data: { serviceRequestId: 'req-2', requestNumber: 'SR-000002', status: 'new', submittedAt: '2026-01-01T00:00:00Z' },
    });

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: 'Leaky faucet', serviceDescription: 'Kitchen faucet is dripping.', propertyId })
    );

    expect(result.success).toBe(true);
    expect(createPortalServiceRequestMock).toHaveBeenCalledWith(
      PORTAL_CLIENT,
      expect.objectContaining({ propertyId })
    );
  });

  it('passes through a failure Result from the RPC wrapper unchanged (e.g. property-ownership rejection) without revalidating', async () => {
    mockSignedIn();
    createPortalServiceRequestMock.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'The selected property does not belong to your account.',
    });

    const result = await createPortalServiceRequestAction(
      null,
      buildFormData({ serviceTitle: 'Leaky faucet', serviceDescription: 'Kitchen faucet is dripping.' })
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe('The selected property does not belong to your account.');
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
