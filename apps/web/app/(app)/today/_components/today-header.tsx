import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ThemeControl } from '@/components/theme/theme-control';

import { signOutAction } from '../actions';
import { OrgSwitcher } from './org-switcher';
import type { AvailableOrgMembership } from '@premier/db';

// Presentation-only (Layer 3). Consumes exactly the values page.tsx already
// resolved via getActiveOrgContext()/auth.getUser() — never re-resolves
// org/user context itself. OrgSwitcher (unmodified) still owns the actual
// org-switch mutation through switchActiveOrgAction(). Built on the shared
// PageHeader primitive (Forge V1.1 UX foundation).
//
// ThemeControl (adapted from the approved Base44 Today visual reference)
// is bound to Forge's own useTheme() — never Base44's local
// useForgeAppearance() hook, which is not ported (see
// docs/ux/base44-today-sync-and-portability-audit.md).
export function TodayHeader({
  firstName,
  formattedDate,
  greeting,
  userEmail,
  orgId,
  orgName,
  role,
  hasMultipleOrgs,
  availableOrgs,
}: {
  firstName: string;
  formattedDate: string;
  greeting: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  role: string;
  hasMultipleOrgs: boolean;
  availableOrgs: AvailableOrgMembership[] | null | undefined;
}) {
  // BASE44-REPLACEABLE: markup/classNames below are representative only —
  // real Base44 output would replace this JSX 1:1, same props in/out. The
  // <OrgSwitcher> and <form action={signOutAction}> mutation paths must be
  // preserved verbatim by any replacement — never re-implemented.
  return (
    <div className="space-y-3">
      <PageHeader
        title={`${greeting}, ${firstName}`}
        description={formattedDate}
        actions={
          <>
            <ThemeControl />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </>
        }
      />

      {hasMultipleOrgs && availableOrgs ? (
        <OrgSwitcher currentOrgId={orgId} availableOrgs={availableOrgs} />
      ) : (
        <div className="inline-flex max-w-full items-center rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <span className="truncate">
            {orgName} • <span className="capitalize">{role}</span>
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Signed in as {userEmail}</p>
    </div>
  );
}
