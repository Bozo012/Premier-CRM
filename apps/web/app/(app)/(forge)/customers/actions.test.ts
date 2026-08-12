import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for CP-4 (docs/security/customers-properties-
// authorization-audit.md §10/§15; product decision recorded 2026-08-13):
// createCustomerAction/createPropertyForCustomerAction previously had NO
// capability check at all — any active org member, including subcontractor
// and viewer, could create customers and properties (the CRM's
// authoritative master identity/contact/location records) through the
// trusted server-action path. Direct authenticated REST writes to these
// tables were already fully revoked at the RLS layer
// (20260804000000_harden_customers_and_properties.sql), so this app-layer
// canManageCustomers check is the only enforcement boundary that ever
// existed for the one path that still worked. These tests prove the
// boundary directly at the server-action call site, matching the pattern in
// requests/actions.test.ts and jobs/actions.test.ts.

const { getServerSupabaseMock, getActiveOrgContextMock, createServiceClientMock, createCustomerMock, createPropertyForCustomerMock, findCustomerByEmailMock } =
  vi.hoisted(() => ({
    getServerSupabaseMock: vi.fn(),
    getActiveOrgContextMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    createCustomerMock: vi.fn(),
    createPropertyForCustomerMock: vi.fn(),
    findCustomerByEmailMock: vi.fn(),
  }));

vi.mock('@/lib/supabase-server', () => ({
  getServerSupabase: getServerSupabaseMock,
}));

vi.mock('@premier/db', () => ({
  getActiveOrgContext: getActiveOrgContextMock,
  createServiceClient: createServiceClientMock,
  createCustomer: createCustomerMock,
  createPropertyForCustomer: createPropertyForCustomerMock,
  findCustomerByEmail: findCustomerByEmailMock,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { checkCustomerEmailAction, createCustomerAction, createPropertyForCustomerAction } from './actions';

const ORG_ID = 'org-1';
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';

function mockSignedInAs(role: 'owner' | 'admin' | 'employee' | 'subcontractor' | 'viewer') {
  getServerSupabaseMock.mockResolvedValue({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
  });
  getActiveOrgContextMock.mockResolvedValue({ success: true, data: { orgId: ORG_ID, role } });
}

function buildCustomerFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = {
    type: 'residential',
    firstName: 'Test',
    lastName: 'Customer',
    email: 'test@example.com',
    phonePrimary: '',
    phoneSecondary: '',
    preferredChannel: 'email',
    notes: '',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

function buildPropertyFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = {
    customerId: CUSTOMER_ID,
    addressLine1: '123 Test Lane',
    addressLine2: '',
    city: 'Lexington',
    state: 'KY',
    zip: '40502',
    country: 'US',
    propertyType: 'single_family',
    accessNotes: '',
    notes: '',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

describe('customer/property authorization boundary (CP-4: canManageCustomers)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createServiceClientMock.mockReturnValue({});
  });

  for (const role of ['owner', 'admin', 'employee'] as const) {
    it(`${role} can create a customer`, async () => {
      mockSignedInAs(role);
      createCustomerMock.mockResolvedValue({ success: true, data: { id: 'cust-new' } });

      const result = await createCustomerAction(null, buildCustomerFormData());

      expect(result.success).toBe(true);
      expect(createCustomerMock).toHaveBeenCalled();
    });

    it(`${role} can add a property to a customer`, async () => {
      mockSignedInAs(role);
      createPropertyForCustomerMock.mockResolvedValue({ success: true, data: { id: 'prop-new' } });

      const result = await createPropertyForCustomerAction(null, buildPropertyFormData());

      expect(result.success).toBe(true);
      expect(createPropertyForCustomerMock).toHaveBeenCalled();
    });
  }

  for (const role of ['subcontractor', 'viewer'] as const) {
    it(`${role} CANNOT create a customer — denied at the action boundary before any DB call`, async () => {
      mockSignedInAs(role);

      const result = await createCustomerAction(null, buildCustomerFormData());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe('FORBIDDEN');
        // Plain-language error only — never leak the raw capability identifier.
        expect(result.error).not.toContain('canManageCustomers');
      }
      expect(createServiceClientMock).not.toHaveBeenCalled();
      expect(createCustomerMock).not.toHaveBeenCalled();
    });

    it(`${role} CANNOT add a property to a customer — denied at the action boundary before any DB call`, async () => {
      mockSignedInAs(role);

      const result = await createPropertyForCustomerAction(null, buildPropertyFormData());

      expect(result.success).toBe(false);
      if (!result.success) expect(result.code).toBe('FORBIDDEN');
      expect(createServiceClientMock).not.toHaveBeenCalled();
      expect(createPropertyForCustomerMock).not.toHaveBeenCalled();
    });
  }

  it('remains denied even when the action is invoked directly, without going through the UI form', async () => {
    // Proves the action itself is the boundary, not a hidden button —
    // matches the pattern in requests/actions.test.ts's equivalent test.
    mockSignedInAs('subcontractor');

    const result = await createCustomerAction(null, buildCustomerFormData());

    expect(result.success).toBe(false);
  });

  it('unauthenticated caller is rejected before any role check', async () => {
    getServerSupabaseMock.mockResolvedValue({
      auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
    });

    const result = await createCustomerAction(null, buildCustomerFormData());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.code).toBe('FORBIDDEN');
    expect(createCustomerMock).not.toHaveBeenCalled();
  });

  it('checkCustomerEmailAction (read-only dedupe check) is unaffected — still available to any active org member, including subcontractor/viewer', async () => {
    mockSignedInAs('viewer');
    findCustomerByEmailMock.mockResolvedValue({ success: true, data: null });

    const result = await checkCustomerEmailAction('someone@example.com');

    expect(result.success).toBe(true);
    expect(findCustomerByEmailMock).toHaveBeenCalled();
  });
});
