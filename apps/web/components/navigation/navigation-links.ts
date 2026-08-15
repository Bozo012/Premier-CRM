import type { MobileNavConfig, NavigationDestination } from '@/components/forge-shell/types';

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
  { href: '/messages', label: 'Messages' },
  { href: '/expenses', label: 'Expenses' },
  { href: '/team', label: 'Team' },
  { href: '/settings', label: 'Settings' },
] as const;

export const todayBrowseLinks = forgeNavigationLinks.filter((link) =>
  ['/requests', '/customers', '/properties', '/estimates', '/quotes', '/jobs', '/invoices'].includes(link.href)
);

// ============================================================================
// Shared mobile bottom-nav config — the single source every shell (legacy
// AppShell and every (forge) route's own ForgeShell) now builds its
// MobileBottomNav config from. Previously duplicated verbatim (modulo one
// stale copy missing the '/routes' icon entry, silently falling back to a
// generic icon) across every (forge) route's own forge-shell-context.ts;
// hoisted here so there is exactly one place this list can drift.
//
// No role/capability filtering is applied here: neither the existing
// desktop nav (app-desktop-nav.tsx, forge-shell/DesktopNavigation.tsx) nor
// any (forge) mobile config filtered by role before this change — every
// active org member sees every top-level destination, and authorization is
// enforced deeper (server actions/RPCs, e.g. Team's canManageTeam gate on
// mutations, not on viewing the page at all). This preserves that exact
// existing behavior rather than introducing new client-side gating that
// desktop never had.
// ============================================================================

const ICON_BY_HREF: Record<string, string> = {
  '/requests': 'clipboard',
  '/customers': 'users',
  '/properties': 'mapPin',
  '/site-visits': 'briefcase',
  '/estimates': 'fileText',
  '/services': 'settings',
  '/quotes': 'fileSignature',
  '/jobs': 'briefcase',
  '/invoices': 'receipt',
  '/calendar': 'bookOpen',
  '/routes': 'mapPin',
  '/activity-logs': 'bookOpen',
  '/site-photos': 'mapPin',
  '/messages': 'fileText',
  '/expenses': 'receipt',
  '/team': 'usersRound',
  '/settings': 'settings',
};

/** Desktop sidebar items for the Forge shell (Today is prepended separately
 * by forge-shell/DesktopNavigation.tsx itself). */
export function buildShellNavigation(): NavigationDestination[] {
  return forgeNavigationLinks
    .filter((link) => link.href !== '/today')
    .map((link) => ({ id: link.href.replace('/', ''), label: link.label, href: link.href }));
}

const MOBILE_PRIMARY_HREFS = ['/today', '/requests', '/customers', '/jobs'];

/** Mobile bottom nav: 4 primary destinations + a "More" sheet with every
 * other route — the existing Forge/Base44 primary-nav convention, now also
 * used by the legacy shell (see app-shell.tsx) so every route is reachable
 * in exactly one tap from every entry point, not just from within a
 * (forge) page. A 6-primary-plus-More (7 column) bar was considered and
 * rejected as too cramped at ~390px width; this 4+More (5 column) layout
 * is the one already shipped and visually proven across every (forge) route. */
export function buildMobileNavConfig(): MobileNavConfig {
  const primary = [
    { id: 'today', label: 'Today', href: '/today', icon: 'home' },
    ...forgeNavigationLinks
      .filter((link) => MOBILE_PRIMARY_HREFS.includes(link.href) && link.href !== '/today')
      .map((link) => ({ id: link.href.replace('/', ''), label: link.label, href: link.href, icon: ICON_BY_HREF[link.href] ?? 'fileText' })),
    { id: 'more', label: 'More', href: '#', icon: 'more' },
  ];
  const secondary = forgeNavigationLinks
    .filter((link) => !MOBILE_PRIMARY_HREFS.includes(link.href))
    .map((link) => ({ id: link.href.replace('/', ''), label: link.label, href: link.href, icon: ICON_BY_HREF[link.href] ?? 'fileText' }));

  return { primary, secondary };
}
