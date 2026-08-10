import { describe, expect, it } from 'vitest';

import { forgeNavigationLinks, todayBrowseLinks } from './navigation-links';

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
