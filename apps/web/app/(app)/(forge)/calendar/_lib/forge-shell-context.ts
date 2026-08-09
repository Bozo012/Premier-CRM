// Layer 2 adapter — builds the shell's ForgeShellData/MobileNavConfig props
// from real Forge org/session context. Self-contained copy matching
// requests/_lib/forge-shell-context.ts and every other (forge) route's own
// copy (each (forge) route builds its own shell chrome internally, per
// PR #125's architecture) — reused by calendar/page.tsx.
import type { ActiveOrgContext } from '@premier/db';

import { forgeNavigationLinks } from '@/components/navigation/navigation-links';
import type { ForgeShellData, MobileNavConfig, NavigationDestination } from '@/components/forge-shell/types';

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
  '/activity-logs': 'bookOpen',
  '/site-photos': 'mapPin',
  '/expenses': 'receipt',
  '/team': 'usersRound',
  '/settings': 'settings',
};

/** Desktop sidebar items (Today is prepended by DesktopNavigation itself). */
export function buildShellNavigation(): NavigationDestination[] {
  return forgeNavigationLinks
    .filter((link) => link.href !== '/today')
    .map((link) => ({ id: link.href.replace('/', ''), label: link.label, href: link.href }));
}

const MOBILE_PRIMARY_HREFS = ['/today', '/requests', '/customers', '/jobs'];

/** Mobile bottom nav: 4 primary destinations + a "More" sheet with the rest. */
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

export function formatRoleLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getInitials(value: string): string {
  const parts = value
    .replace(/@.*/, '')
    .split(/\s+|[._-]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (parts[0]?.[0] ?? 'S').concat(parts[1]?.[0] ?? '').toUpperCase();
}

export function buildForgeShellData(args: {
  orgContext: ActiveOrgContext;
  userId: string;
  displayName: string;
  email: string;
}): ForgeShellData {
  const { orgContext, userId, displayName, email } = args;
  const availableOrganizations = orgContext.hasMultipleOrgs && orgContext.availableOrgs
    ? orgContext.availableOrgs.map((org) => ({ id: org.orgId, name: org.orgName }))
    : [{ id: orgContext.orgId, name: orgContext.orgName }];

  return {
    organization: { id: orgContext.orgId, name: orgContext.orgName },
    availableOrganizations,
    staff: {
      id: userId,
      displayName,
      email,
      roleLabel: formatRoleLabel(orgContext.role),
      initials: getInitials(displayName),
    },
    navigation: buildShellNavigation(),
  };
}
