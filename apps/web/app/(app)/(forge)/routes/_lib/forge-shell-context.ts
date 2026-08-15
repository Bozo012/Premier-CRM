// Layer 2 adapter — builds this route's ForgeShellData/MobileNavConfig
// props from real Forge org/session context. buildShellNavigation() and
// buildMobileNavConfig() themselves now live in the single shared
// navigation-links.ts (hoisted out of what used to be a near-identical
// copy in every (forge) route's own forge-shell-context.ts — one of those
// copies had silently drifted, missing the '/routes' icon entry) — this
// file re-exports them so every existing call site keeps working
// unchanged, and adds only what's genuinely route-local: staff identity
// formatting.
import type { ActiveOrgContext } from '@premier/db';

import { buildMobileNavConfig, buildShellNavigation } from '@/components/navigation/navigation-links';
import type { ForgeShellData } from '@/components/forge-shell/types';

export { buildMobileNavConfig, buildShellNavigation };

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
