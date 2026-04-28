'use client'; // Client component required for session-aware Supabase reads and sign-out interactions.

import { useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getBrowserSupabase } from '@/lib/supabase';

interface TodayState {
  userEmail: string;
  userName: string;
  orgName: string;
  orgRole: string;
  customerCount: number;
  jobCount: number;
}

export default function TodayPage() {
  const [data, setData] = useState<TodayState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      const firstName = fullName ? fullName.split(' ')[0] : null;

      setData({
        userEmail: user.email || 'No email found',
        userName: firstName ?? user.email ?? 'there',
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

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading your dashboard...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-red-600">{error}</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6 md:p-10">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Hi {data?.userName}</h1>
          <p className="text-sm text-muted-foreground">{data?.userEmail}</p>
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-medium">{data?.orgName}</p>
            <p className="text-sm text-muted-foreground capitalize">Role: {data?.orgRole}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{data?.customerCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{data?.jobCount}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
