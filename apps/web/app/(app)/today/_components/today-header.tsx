import { Button } from '@/components/ui/button';

import { signOutAction } from '../actions';
import { OrgSwitcher } from './org-switcher';
import type { AvailableOrgMembership } from '@premier/db';

// Presentation-only: consumes exactly the values TodayPage already resolved
// via getActiveOrgContext()/auth.getUser() — never re-resolves org/user
// context itself. OrgSwitcher (unmodified) still owns the actual org-switch
// mutation through switchActiveOrgAction().
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
    <header className="space-y-3 rounded-2xl border bg-gradient-to-br from-background to-muted/30 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting}, {firstName}
          </h1>
          <p className="text-sm text-muted-foreground">{formattedDate}</p>
        </div>
        <div className="rounded-xl border bg-background px-3 py-2 text-right shadow-sm">
          <p className="text-xs font-medium text-foreground">{firstName}</p>
          <form action={signOutAction}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              Sign out
            </Button>
          </form>
        </div>
      </div>

      {hasMultipleOrgs && availableOrgs ? (
        <OrgSwitcher currentOrgId={orgId} availableOrgs={availableOrgs} />
      ) : (
        <div className="inline-flex max-w-full items-center rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm">
          <span className="truncate">
            {orgName} • <span className="capitalize">{role}</span>
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground">Signed in as {userEmail}</p>
    </header>
  );
}
