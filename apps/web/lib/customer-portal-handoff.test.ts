import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildMarketingPortalUrl,
  getMarketingOrigin,
  isAllowedPortalHandoffOrigin,
} from './customer-portal-handoff';
import { splitCustomerName } from './customer-portal-account';

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
});
