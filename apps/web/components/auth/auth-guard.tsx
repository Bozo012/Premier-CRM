'use client'; // Client component required for checking browser auth session and redirecting.

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { getMembershipStatus } from '@/lib/auth-routing';
import { getBrowserSupabase } from '@/lib/supabase';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabase();

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session?.user) {
        const redirectPath = encodeURIComponent(pathname || '/today');
        router.replace(`/login?redirectTo=${redirectPath}`);
        return;
      }

      const membershipStatus = await getMembershipStatus(
        supabase,
        data.session.user.id
      );

      if (membershipStatus !== 'active') {
        router.replace('/pending-approval');
        return;
      }

      setIsLoading(false);
    };

    void checkSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user) {
          const redirectPath = encodeURIComponent(pathname || '/today');
          router.replace(`/login?redirectTo=${redirectPath}`);
          return;
        }

        const membershipStatus = await getMembershipStatus(
          supabase,
          session.user.id
        );

        if (membershipStatus !== 'active') {
          router.replace('/pending-approval');
        }
      }
    );

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Checking your session...</p>
      </main>
    );
  }

  return <>{children}</>;
}
