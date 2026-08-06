import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const dbMocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  findCustomerByEmail: vi.fn(),
}));

vi.mock('@premier/db', () => dbMocks);

import {
  buildMarketingPortalUrl,
  getMarketingOrigin,
  isAllowedPortalHandoffOrigin,
} from './customer-portal-handoff';
import { ensureCustomerAccount, splitCustomerName } from './customer-portal-account';

describe('customer portal marketing handoff', () => {
  const root = path.resolve(__dirname, '..', '..', '..');

  it('builds fixed marketing return URLs with status codes only', () => {
    vi.stubEnv('NEXT_PUBLIC_MARKETING_SITE_URL', 'https://www.ppmnky.com/');

    expect(getMarketingOrigin()).toBe('https://www.ppmnky.com');
    expect(buildMarketingPortalUrl('invalid-credentials')).toBe(
      'https://www.ppmnky.com/customer-portal?portalStatus=invalid-credentials'
    );

    vi.unstubAllEnvs();
  });

  it('does not include credentials in marketing return URLs', () => {
    const url = buildMarketingPortalUrl('missing-credentials');

    expect(url).not.toContain('email=');
    expect(url).not.toContain('password=');
  });

  it('allows only configured marketing origins to post handoff forms', () => {
    expect(isAllowedPortalHandoffOrigin('https://www.ppmnky.com')).toBe(true);
    expect(isAllowedPortalHandoffOrigin('https://evil.example')).toBe(false);
    expect(isAllowedPortalHandoffOrigin(null)).toBe(false);
  });

  it('keeps sign-up as a first-class Forge-owned handoff alias', () => {
    const signUpRoute = readFileSync(
      path.join(root, 'apps/web/app/portal/handoff/sign-up/route.ts'),
      'utf-8'
    );

    expect(signUpRoute).toContain("export { POST } from '../request-access/route'");
  });

  it('splits customer names without requiring a last name', () => {
    expect(splitCustomerName('Kevin Sommers')).toEqual({
      firstName: 'Kevin',
      lastName: 'Sommers',
    });
    expect(splitCustomerName('Cher')).toEqual({ firstName: 'Cher', lastName: null });
  });

  it('relinks an existing portal account by email instead of inserting a conflicting row', async () => {
    const lookupResults = [{ data: { id: 'account-email' }, error: null }];
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const customerAccountsTable = {
      select: vi.fn(() => {
        const result = lookupResults.shift() ?? { data: null, error: null };
        const chain = {
          eq: vi.fn(() => chain),
          maybeSingle: vi.fn().mockResolvedValue(result),
        };
        return chain;
      }),
      update: vi.fn(() => ({ eq: updateEq })),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    };
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'customer_accounts') return customerAccountsTable;
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    dbMocks.createServiceClient.mockReturnValue(client);
    dbMocks.findCustomerByEmail.mockResolvedValue({
      success: true,
      data: { id: 'customer-1' },
    });

    await expect(
      ensureCustomerAccount({
        authUserId: 'auth-new',
        email: 'Customer@Example.com',
        fullName: 'Customer Example',
      })
    ).resolves.toEqual({ success: true, customerId: 'customer-1' });

    expect(customerAccountsTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        auth_user_id: 'auth-new',
        customer_id: 'customer-1',
        email: 'customer@example.com',
      })
    );
    expect(updateEq).toHaveBeenCalledWith('id', 'account-email');
    expect(customerAccountsTable.upsert).not.toHaveBeenCalled();
  });
});
