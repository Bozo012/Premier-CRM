import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut, Plus } from 'lucide-react';

import { getActiveOrgContext } from '@premier/db';

import { ThemeControl } from '@/components/theme/theme-control';
import { Button } from '@/components/ui/button';
import { getServerSupabase } from '@/lib/supabase-server';

import { signOutAction } from '@/app/(app)/today/actions';
import { OrgSwitcher } from '@/app/(app)/today/_components/org-switcher';
import { AppAccountMenu } from './app-account-menu';

const createLinks = [
  { href: '/requests/new', label: 'Create request' },
  { href: '/customers/new', label: 'Create customer' },
  { href: '/estimates/new', label: 'Create estimate' },
  { href: '/jobs/new', label: 'Schedule work' },
] as const;

export async function AppTopbar() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login?redirectTo=/today');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);
  const profile = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const orgName = orgContext.success ? orgContext.data.orgName : 'No active organization';
  const displayName = profile.data?.full_name?.trim() || user.email || 'Staff';
  const email = user.email ?? 'No email';
  const initials = getInitials(displayName);
  const roleLabel = orgContext.success ? formatRoleLabel(orgContext.data.role) : 'No active role';

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 px-3 py-2 backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Active organization
            </p>
            {orgContext.success && orgContext.data.hasMultipleOrgs && orgContext.data.availableOrgs ? (
              <OrgSwitcher
                currentOrgId={orgContext.data.orgId}
                availableOrgs={orgContext.data.availableOrgs}
                className="mt-1 w-full"
              />
            ) : (
              <p className="truncate text-sm font-bold text-foreground">{orgName}</p>
            )}
          </div>
          <AppAccountMenu displayName={displayName} email={email} initials={initials} orgName={orgName} roleLabel={roleLabel} />
        </div>
      </header>

      <header className="sticky top-0 z-30 hidden min-h-16 border-b border-border bg-card/95 px-6 backdrop-blur md:block">
        <div className="flex min-h-16 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 lg:block">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Active organization</p>
              <p className="truncate text-sm font-bold text-foreground">{orgName}</p>
            </div>
            <Button asChild className="h-11 rounded-xl px-4 font-bold">
              <Link href="/requests/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create
              </Link>
            </Button>
            <nav className="hidden items-center gap-2 xl:flex" aria-label="Create shortcuts">
              {createLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-bold text-foreground transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex min-w-0 items-center gap-3">
            {orgContext.success && orgContext.data.hasMultipleOrgs && orgContext.data.availableOrgs ? (
              <OrgSwitcher currentOrgId={orgContext.data.orgId} availableOrgs={orgContext.data.availableOrgs} />
            ) : (
              <div className="hidden max-w-[280px] rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold lg:block">
                <span className="block truncate">{orgName}</span>
              </div>
            )}
            <ThemeControl />
            <AppAccountMenu displayName={displayName} email={email} initials={initials} orgName={orgName} roleLabel={roleLabel} />
            <form action={signOutAction}>
              <Button type="submit" variant="ghost" size="icon" aria-label="Sign out">
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
      </header>
    </>
  );
}

function formatRoleLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getInitials(value: string): string {
  const parts = value
    .replace(/@.*/, '')
    .split(/\s+|[._-]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (parts[0]?.[0] ?? 'S').concat(parts[1]?.[0] ?? '').toUpperCase();
}
