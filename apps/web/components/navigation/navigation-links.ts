export const forgeNavigationLinks = [
  { href: '/today', label: 'Today' },
  { href: '/requests', label: 'Requests' },
  { href: '/customers', label: 'Customers' },
  { href: '/properties', label: 'Properties' },
  { href: '/site-visits', label: 'Site Visits' },
  { href: '/estimates', label: 'Estimates' },
  { href: '/services', label: 'Service Catalog' },
  { href: '/quotes', label: 'Quotes' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/routes', label: 'Route Planning' },
  { href: '/activity-logs', label: 'Activity Logs' },
  { href: '/site-photos', label: 'Site Photos' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/team', label: 'Team' },
  { href: '/settings', label: 'Settings' },
] as const;

export const todayBrowseLinks = forgeNavigationLinks.filter((link) =>
  ['/requests', '/customers', '/properties', '/estimates', '/quotes', '/jobs', '/invoices'].includes(link.href)
);
