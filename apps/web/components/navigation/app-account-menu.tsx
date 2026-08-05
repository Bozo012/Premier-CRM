'use client';

import Link from 'next/link';
import { LogOut, UserRound } from 'lucide-react';

import { ThemeControl } from '@/components/theme/theme-control';
import { Button } from '@/components/ui/button';

import { signOutAction } from '@/app/(app)/today/actions';

export function AppAccountMenu({
  displayName,
  email,
  initials,
  orgName,
  roleLabel,
}: {
  displayName: string;
  email: string;
  initials: string;
  orgName: string;
  roleLabel: string;
}) {
  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1 py-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-nav text-sm font-bold text-nav-active-foreground">
          {initials}
        </span>
        <span className="hidden min-w-0 text-left xl:block">
          <span className="block truncate text-sm font-bold text-foreground">{displayName}</span>
          <span className="block truncate text-xs text-muted-foreground">{roleLabel}</span>
        </span>
        <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </summary>

      <div className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-xl">
        <div className="space-y-4 p-4">
          <div>
            <p className="text-base font-bold">{displayName}</p>
            <p className="text-sm text-muted-foreground">{email}</p>
            <p className="mt-2 text-sm font-semibold">{roleLabel}</p>
          </div>

          <div className="border-t pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Active organization</p>
            <p className="mt-1 text-sm font-bold">{orgName}</p>
          </div>

          <div className="border-t pt-4">
            <Link
              href="/settings"
              className="flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Account & profile
            </Link>
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Appearance</p>
            <ThemeControl className="w-fit" />
          </div>
        </div>

        <form action={signOutAction} className="border-t p-4">
          <Button type="submit" variant="destructive" className="w-full justify-start">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </Button>
        </form>
      </div>
    </details>
  );
}
