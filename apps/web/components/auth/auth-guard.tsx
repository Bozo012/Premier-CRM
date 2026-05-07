'use client'; // Client component required for checking browser auth session and redirecting.

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';

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

    const redirectToLogin = () => {
      const redirectPath = encodeURIComponent(pathname || '/today');
      router.replace(`/login?redirectTo=${redirectPath}`);
    };

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session?.user) {
        redirectToLogin();
        return;
      }

      setIsLoading(false);
    };

    void checkSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session?.user) {
          redirectToLogin();
          return;
        }

        setIsLoading(false);
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
