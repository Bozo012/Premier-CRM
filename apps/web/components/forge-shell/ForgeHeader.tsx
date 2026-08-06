'use client'; // useStaffMenu is stateful, and the header wires several click handlers.

// Adapted from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/TodayHeader.tsx. Markup/breakpoint behavior
// unchanged (mobile compact bar + avatar button / desktop full bar with
// org label + org-switcher + theme control + avatar menu + sign out).
//
// Two deliberate omissions from the Base44 source, both intentionally
// deferred (not part of this PR's scope — see the Customers-route report):
//   1. The greeting/date block ("Good morning" + weekday date) was
//      Today-page-specific copy; the shared shell has no equivalent, so it
//      is dropped rather than shown on every route.
//   2. CreateRecordTrigger (Base44's global "+" create-flow trigger, backed
//      by CreateFlowProvider/useCreateTrigger and the manualEntry contract)
//      is NOT ported — those are Today-workspace-specific presentation
//      plumbing for a generic multi-record-type create sheet, out of scope
//      for the Customers proof route, which uses its own real
///     createCustomerAction /customers/new flow instead.
import { ChevronDown, LogOut, UserRound } from 'lucide-react';

import { ProfileSheet } from './ProfileSheet';
import { StaffMenuDropdown } from './StaffMenuDropdown';
import { ThemeControl } from './ThemeControl';
import { useStaffMenu } from './useStaffMenu';
import type { ForgeShellCallbacks, ForgeShellData } from './types';

export function ForgeHeader({ data, callbacks }: { data: ForgeShellData; callbacks: ForgeShellCallbacks }) {
  // One shared staff-menu controller for both responsive surfaces.
  const staffMenu = useStaffMenu();

  const orgSelect = (extraClass: string) => (
    <select
      aria-label="Switch organization"
      value={data.organization.id}
      onChange={(event) => callbacks.onSwitchOrganization(event.target.value)}
      disabled={data.availableOrganizations.length <= 1}
      className={`min-h-11 appearance-none rounded-xl border border-input bg-card py-2 pl-3 pr-9 text-sm font-semibold text-card-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 ${extraClass}`}
    >
      {data.availableOrganizations.map((org) => (
        <option key={org.id} value={org.id}>
          {org.name}
        </option>
      ))}
    </select>
  );

  return (
    <header className="border-b border-border bg-card">
      {/* Mobile / tablet: compact org label + theme + avatar button */}
      <div className="flex items-center gap-2 px-4 py-2.5 lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Active organization</p>
          <p className="truncate text-sm font-bold text-card-foreground">{data.organization.name}</p>
        </div>
        <ThemeControl compact />
        <button
          type="button"
          ref={staffMenu.mobileTriggerRef}
          onClick={staffMenu.toggle}
          aria-haspopup="dialog"
          aria-expanded={staffMenu.open && !staffMenu.isDesktop}
          aria-controls={staffMenu.menuId}
          aria-label={`Open staff menu for ${data.staff.displayName}`}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nav text-xs font-bold text-nav-active-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {data.staff.initials}
        </button>
      </div>

      {/* Only the surface for the active breakpoint mounts — never both. */}
      {!staffMenu.isDesktop && (
        <ProfileSheet
          id={staffMenu.menuId}
          open={staffMenu.open}
          onOpenChange={(next) => (next ? staffMenu.setOpen(true) : staffMenu.close())}
          data={data}
          callbacks={callbacks}
          onAction={staffMenu.runAndClose}
        />
      )}

      {/* Desktop: full header */}
      <div className="hidden min-h-16 items-center gap-3 px-4 sm:px-6 lg:flex lg:px-8">
        <div className="hidden min-w-0 flex-1 lg:block">
          <p className="truncate text-xs font-semibold uppercase tracking-[.16em] text-muted-foreground">Active organization</p>
          <p className="truncate text-sm font-semibold text-card-foreground">{data.organization.name}</p>
        </div>
        <label className="relative hidden lg:block">
          {orgSelect('')}
          <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </label>
        <div className="hidden lg:block">
          <ThemeControl />
        </div>
        <div className="relative hidden lg:block">
          <button
            type="button"
            ref={staffMenu.desktopTriggerRef}
            onClick={staffMenu.toggle}
            aria-haspopup="menu"
            aria-expanded={staffMenu.open && staffMenu.isDesktop}
            aria-controls={staffMenu.menuId}
            aria-label={`Open staff menu for ${data.staff.displayName}`}
            className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-nav text-xs font-bold text-nav-active-foreground">{data.staff.initials}</span>
            <span className="hidden xl:block">
              <span className="block text-sm font-semibold text-card-foreground">{data.staff.displayName}</span>
              <span className="block text-xs text-muted-foreground">{data.staff.roleLabel}</span>
            </span>
            <UserRound className="hidden h-4 w-4 text-muted-foreground lg:block" aria-hidden="true" />
          </button>
          {staffMenu.isDesktop && staffMenu.open && (
            <StaffMenuDropdown
              id={staffMenu.menuId}
              data={data}
              callbacks={callbacks}
              onAction={staffMenu.runAndClose}
              onClose={staffMenu.close}
              triggerRef={staffMenu.desktopTriggerRef}
            />
          )}
        </div>
        <button
          type="button"
          onClick={callbacks.onSignOut}
          aria-label="Sign out"
          className="hidden h-11 w-11 place-items-center rounded-xl text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
