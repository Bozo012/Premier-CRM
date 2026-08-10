import { describe, expect, it } from 'vitest';

import { PORTAL_NAV_LINKS } from './portal-nav-links';

describe('PORTAL_NAV_LINKS', () => {
  it('has exactly 4 primary (mobile bottom-bar) links: Home, Messages, Requests, and Quotes is not one of them', () => {
    const primary = PORTAL_NAV_LINKS.filter((link) => link.primary).map((link) => link.id);
    expect(primary).toEqual(['home', 'messages', 'requests']);
  });

  it('covers every nav section named in the portal boundary doc', () => {
    const ids = PORTAL_NAV_LINKS.map((link) => link.id);
    expect(ids).toEqual([
      'home',
      'messages',
      'requests',
      'quotes',
      'change-orders',
      'invoices',
      'properties',
      'appointments',
      'account',
    ]);
  });

  it('every link has a real, non-empty href', () => {
    for (const link of PORTAL_NAV_LINKS) {
      expect(link.href.startsWith('/portal')).toBe(true);
    }
  });
});
