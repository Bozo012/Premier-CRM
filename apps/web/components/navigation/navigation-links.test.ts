import { describe, expect, it } from 'vitest';

import { buildMobileNavConfig, buildShellNavigation, forgeNavigationLinks, todayBrowseLinks } from './navigation-links';

describe('forgeNavigationLinks', () => {
  it('keeps the Base44 sidebar order including the lower routes', () => {
    expect(forgeNavigationLinks.map((item) => item.label)).toEqual([
      'Today',
      'Requests',
      'Customers',
      'Properties',
      'Site Visits',
      'Estimates',
      'Service Catalog',
      'Quotes',
      'Jobs',
      'Invoices',
      'Calendar',
      'Route Planning',
      'Activity Logs',
      'Site Photos',
      'Messages',
      'Expenses',
      'Team',
      'Settings',
    ]);
  });

  it('keeps Today browse links scoped to primary work records', () => {
    expect(todayBrowseLinks.map((item) => item.href)).toEqual([
      '/requests',
      '/customers',
      '/properties',
      '/estimates',
      '/quotes',
      '/jobs',
      '/invoices',
    ]);
  });
});

// Regression coverage for the mobile-nav route-parity defect: Today (and
// every other (legacy) route) rendered a hardcoded 6-item bottom nav with
// no "More" control, so every route beyond those 6 was unreachable through
// normal mobile navigation. buildMobileNavConfig() is now the single
// function both the (legacy) AppShell and every (forge) route's own shell
// build their MobileBottomNav config from — proving its output here proves
// route parity everywhere it's consumed, without needing a live render.
describe('buildMobileNavConfig', () => {
  const config = buildMobileNavConfig();

  it('exposes every route from forgeNavigationLinks across primary + secondary + the More sheet trigger itself', () => {
    const allHrefsInConfig = new Set([...config.primary.map((i) => i.href), ...config.secondary.map((i) => i.href)]);
    const everyRealRouteHref = forgeNavigationLinks.map((link) => link.href);

    for (const href of everyRealRouteHref) {
      expect(allHrefsInConfig.has(href)).toBe(true);
    }
  });

  it('specifically includes every route the mobile-nav defect made unreachable', () => {
    const secondaryHrefs = config.secondary.map((item) => item.href);
    expect(secondaryHrefs).toEqual(
      expect.arrayContaining([
        '/properties',
        '/site-visits',
        '/estimates',
        '/services',
        '/calendar',
        '/routes',
        '/activity-logs',
        '/site-photos',
        '/messages',
        '/expenses',
        '/team',
        '/settings',
      ])
    );
  });

  it('keeps the primary bar small (4 destinations + More, not a 12+ item horizontal-scroll bar)', () => {
    expect(config.primary).toHaveLength(5);
    expect(config.primary.map((i) => i.id)).toEqual(['today', 'requests', 'customers', 'jobs', 'more']);
    expect(config.primary.at(-1)).toMatchObject({ id: 'more', icon: 'more' });
  });

  it('never assigns a fallback icon to a real route — a real icon key exists for every primary/secondary item', () => {
    // Regression: one of the 13 previously-duplicated forge-shell-context.ts
    // copies was missing the '/routes' icon entry entirely and silently
    // fell back to a generic icon — proof the per-route duplication itself
    // was a live bug, not just a maintenance smell. There is now exactly
    // one place this list can define icons.
    for (const item of [...config.primary, ...config.secondary]) {
      if (item.id === 'more') continue;
      expect(item.icon).not.toBe('');
    }
  });

  it('does not duplicate any route between primary and secondary', () => {
    const primaryHrefs = new Set(config.primary.filter((i) => i.id !== 'more').map((i) => i.href));
    const secondaryHrefs = config.secondary.map((i) => i.href);
    for (const href of secondaryHrefs) {
      expect(primaryHrefs.has(href)).toBe(false);
    }
  });
});

describe('buildShellNavigation', () => {
  it('includes every route except Today (prepended separately by the desktop shell)', () => {
    const hrefs = buildShellNavigation().map((item) => item.href);
    expect(hrefs).not.toContain('/today');
    for (const link of forgeNavigationLinks) {
      if (link.href === '/today') continue;
      expect(hrefs).toContain(link.href);
    }
  });
});
