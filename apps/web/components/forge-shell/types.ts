// Ported from Base44 Forge-Base44-UX @ 497d0693 — src/contracts/today.ts and
// src/contracts/navigation.ts, trimmed to what the shared shell needs
// (attentionItems/scheduledWork/kanbanCards/etc. were Today-page-specific
// and are not part of the shared shell contract).
export interface ForgeIdentity {
  id: string;
  name: string;
  descriptor?: string;
}

export interface StaffIdentity {
  id: string;
  displayName: string;
  email: string;
  roleLabel: string;
  initials: string;
}

/** Desktop sidebar item; also used for the StaffMenuPanel's supplied links (team/settings). */
export interface NavigationDestination {
  id: string;
  label: string;
  href: string;
}

export interface MobileNavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
}

export interface MobileNavConfig {
  primary: MobileNavItem[];
  secondary: MobileNavItem[];
}

export interface ForgeShellData {
  organization: ForgeIdentity;
  availableOrganizations: ForgeIdentity[];
  staff: StaffIdentity;
  navigation: NavigationDestination[];
}

/**
 * Callback contract for the shared shell. Narrower than Base44's
 * `TodayCallbacks` (no onQuickAction/onMoveJobCard/onOpenJobCard — those were
 * Today-board-specific) since the shell itself only needs org switching,
 * sign-out, and the staff-menu's "Account & profile" action.
 */
export interface ForgeShellCallbacks {
  onSwitchOrganization: (organizationId: string) => void;
  onSignOut: () => void;
  onOpenAction: (actionId: string) => void;
}
