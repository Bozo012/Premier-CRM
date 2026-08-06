'use client'; // Contains the org-switcher <select onChange> and button handlers.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/StaffMenuPanel.tsx (contains the org-switcher
// <select> — Base44 has no separate org-switcher component). Markup
// unchanged; typed against this app's ForgeShellData/ForgeShellCallbacks
// (types.ts) instead of Base44's TodayViewModel/TodayCallbacks, and
// `forge-*` tokens swapped for the existing equivalent tokens.
import { ChevronDown, LogOut, Settings, UserRound, UsersRound } from 'lucide-react';
import Link from 'next/link';

import { ThemeControl } from './ThemeControl';
import type { ForgeShellCallbacks, ForgeShellData } from './types';

const linkIcons: Record<string, typeof UsersRound> = { team: UsersRound, settings: Settings };

/**
 * Shared staff-menu content. Both the desktop dropdown and the mobile sheet render
 * this, so the two surfaces always expose the same functional actions.
 * Only items supplied by Forge / the harness are rendered.
 */
export function StaffMenuPanel({
  data,
  callbacks,
  onAction,
  showIdentity = true,
}: {
  data: ForgeShellData;
  /** The mobile sheet shows identity in its own header, so it hides this block. */
  showIdentity?: boolean;
  callbacks: ForgeShellCallbacks;
  /** Wraps a supplied action so the single shared menu closes afterwards. */
  onAction: (action: () => void) => void;
}) {
  const supplied = data.navigation.filter((item) => item.id === 'team' || item.id === 'settings');

  return (
    <div className="px-4 py-3">
      {showIdentity ? (
        <div>
          <p className="text-sm font-bold text-card-foreground">{data.staff.displayName}</p>
          <p className="text-xs text-muted-foreground">{data.staff.email}</p>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">{data.staff.roleLabel}</p>
        </div>
      ) : (
        <p className="text-xs font-semibold text-muted-foreground">{data.staff.roleLabel}</p>
      )}

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-1 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Active organization</p>
        <p className="mb-2.5 text-sm font-semibold text-card-foreground">{data.organization.name}</p>
        <label className="relative block">
          <span className="sr-only">Switch organization</span>
          <select
            aria-label="Switch organization"
            value={data.organization.id}
            onChange={(event) => callbacks.onSwitchOrganization(event.target.value)}
            disabled={data.availableOrganizations.length <= 1}
            className="min-h-11 w-full appearance-none rounded-xl border border-input bg-card py-2 pl-3 pr-9 text-sm font-semibold text-card-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
          >
            {data.availableOrganizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </label>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onAction(() => callbacks.onOpenAction('account-profile'))}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm font-semibold text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Account &amp; profile
        </button>
        {supplied.map((item) => {
          const Icon = linkIcons[item.id] || Settings;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm font-semibold text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Appearance</p>
        <ThemeControl />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => onAction(() => callbacks.onSignOut())}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-xl bg-destructive px-3 text-sm font-bold text-destructive-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );
}
