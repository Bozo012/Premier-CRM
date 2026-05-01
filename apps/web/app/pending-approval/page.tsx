'use client'; // Client component required for session-aware membership checks and approval polling.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import {
  getMembershipStatus,
  type MembershipStatus,
} from '@/lib/auth-routing';
import { getBrowserSupabase } from '@/lib/supabase';

interface PendingState {
  email: string | null;
  membershipStatus: MembershipStatus;
}

export default function PendingApprovalPage() {
  const router = useRouter();
  const [data, setData] = useState<PendingState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    const loadState = async () => {
      setIsLoading(true);
      setError(null);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.replace('/login');
        return;
      }

      const membershipStatus = await getMembershipStatus(
        supabase,
        session.user.id
      );

      if (membershipStatus === 'active') {
        router.replace('/today');
        return;
      }

      setData({
        email: session.user.email ?? null,
        membershipStatus,
      });
      setIsLoading(false);
    };

    void loadState();
  }, [router]);

  const handleRefresh = async () => {
    const supabase = getBrowserSupabase();

    setIsLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) {
      router.replace('/login');
      return;
    }

    const membershipStatus = await getMembershipStatus(supabase, session.user.id);

    if (membershipStatus === 'active') {
      router.replace('/today');
      return;
    }

    setData({
      email: session.user.email ?? null,
      membershipStatus,
    });
    setIsLoading(false);
  };

  const handleSignOut = async () => {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    router.replace('/login');
  };

  if (isLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <p className="text-sm text-muted-foreground">
          Checking your membership status...
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {data?.membershipStatus === 'rejected'
            ? 'Access not approved'
            : 'Waiting for approval'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {data?.email ?? 'unknown user'}.
        </p>
        {data?.membershipStatus === 'rejected' ? (
          <p className="text-sm text-muted-foreground">
            Your membership was marked rejected. Contact Kevin or another owner
            to get access restored.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your account exists, but access is still being held. This usually
            means the membership came from an older self-signup flow or was
            intentionally left pending by an owner/admin.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={() => void handleRefresh()}>
          Check again
        </Button>
        <Button type="button" variant="outline" onClick={() => void handleSignOut()}>
          Sign out
        </Button>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
