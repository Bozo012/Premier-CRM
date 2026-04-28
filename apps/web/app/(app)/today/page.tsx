'use client'; // Client component required for session-aware Supabase reads and sign-out interactions.

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBrowserSupabase } from '@/lib/supabase';

interface TodayState {
  userEmail: string;
  firstName: string;
  orgName: string;
  orgRole: string;
  customerCount: number;
  jobCount: number;
}

const quickActions = [
  { id: 'capture-note', label: 'Capture note' },
  { id: 'new-customer', label: 'New customer' },
  { id: 'new-job', label: 'New job' },
  { id: 'new-estimate', label: 'New estimate' },
] as const;

export default function TodayPage() {
  const [data, setData] = useState<TodayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusText, setStatusText] = useState<string | null>(null);

  const supabase = useMemo(
    () => getBrowserSupabase() as unknown as SupabaseClient,
    []
  );

  useEffect(() => {
    const loadDashboard = async () => {
      setIsLoading(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;

      if (!user) {
        setError('No active session found. Please sign in again.');
        setIsLoading(false);
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from('org_members')
        .select('org_id, role, status, organizations(name)')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (membershipError) {
        setError(membershipError.message);
        setIsLoading(false);
        return;
      }

      if (!membership?.org_id) {
        setError('No active organization membership found for this user.');
        setIsLoading(false);
        return;
      }

      const orgNameValue =
        typeof membership.organizations === 'object' &&
        membership.organizations !== null &&
        'name' in membership.organizations
          ? String(membership.organizations.name)
          : 'Unknown org';

      const [customersResult, jobsResult, profileResult] = await Promise.all([
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('org_id', membership.org_id),
        supabase.from('jobs').select('*', { count: 'exact', head: true }).eq('org_id', membership.org_id),
        supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);

      if (customersResult.error || jobsResult.error) {
        setError(customersResult.error?.message || jobsResult.error?.message || 'Failed to load counts.');
        setIsLoading(false);
        return;
      }

      const fullName = profileResult.data?.full_name ?? null;
      const firstNameFromProfile = fullName ? fullName.split(' ')[0] : null;
      const firstNameFromEmail = user.email ? user.email.split('@')[0] : null;
      const resolvedFirstName = firstNameFromProfile ?? firstNameFromEmail ?? 'there';

      setData({
        userEmail: user.email || 'No email found',
        firstName: resolvedFirstName,
        orgName: orgNameValue,
        orgRole: membership.role,
        customerCount: customersResult.count || 0,
        jobCount: jobsResult.count || 0,
      });
      setIsLoading(false);
    };

    void loadDashboard();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handlePlaceholderAction = (label: string) => {
    setStatusText(`${label} is unavailable in this preview.`);
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) {
      return 'Good morning';
    }

    if (hour < 18) {
      return 'Good afternoon';
    }

    return 'Good evening';
  }, []);

  const formattedDate = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }),
    []
  );

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}, {data?.firstName}
            </h1>
            <p className="text-sm text-muted-foreground">{formattedDate}</p>
          </div>
          <div className="rounded-xl border bg-muted/30 px-3 py-2 text-right">
            <p className="text-xs font-medium text-foreground">{data?.firstName}</p>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-0 py-0 text-xs font-normal text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="inline-flex max-w-full items-center rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
          <span className="truncate">
            {data?.orgName} • <span className="capitalize">{data?.orgRole}</span>
          </span>
        </div>

        <p className="text-xs text-muted-foreground">Signed in as {data?.userEmail}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((action) => (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              className="h-16 justify-start px-4 text-left text-sm sm:text-base"
              onClick={() => handlePlaceholderAction(action.label)}
            >
              {action.label}
            </Button>
          ))}
        </div>
        <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
          {statusText ?? 'Actions are placeholders for this foundation pass.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Business snapshot</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customers</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">{data?.customerCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">{data?.jobCount}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Open tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">0</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">0</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s work</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">No jobs scheduled for today yet.</p>
            <Button
              variant="outline"
              type="button"
              onClick={() => handlePlaceholderAction('Import jobs')}
            >
              Import jobs or create your first job
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Next Best Step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Import your Jobber data or capture your first field note to start building your business memory.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => handlePlaceholderAction('Import customers')}>
                Import customers
              </Button>
              <Button type="button" variant="outline" onClick={() => handlePlaceholderAction('Capture field note')}>
                Capture field note
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ul className="mx-auto grid w-full max-w-5xl grid-cols-5 text-xs">
          {['Today', 'Capture', 'Jobs', 'Customers', 'More'].map((item) => (
            <li key={item} className="flex">
              <button
                type="button"
                className={`min-h-14 w-full px-2 py-3 text-center ${
                  item === 'Today' ? 'font-semibold text-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => {
                  if (item !== 'Today') {
                    handlePlaceholderAction(`${item} navigation`);
                  }
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
