'use client'; // Client component required for signup-confirmation session handling and Supabase browser auth APIs.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { establishSessionFromCallback } from '@/lib/auth-callback';
import { getBrowserSupabase } from '@/lib/supabase';

function getMarketingPortalUrl(): string {
  const origin = (process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? 'https://www.ppmnky.com').replace(
    /\/+$/,
    ''
  );
  return `${origin}/customer-portal`;
}

/**
 * Landing page for the customer portal's "Confirm signup" email
 * (`createCustomerPortalAccount`'s `emailRedirectTo`). Uses the same
 * explicit code/token_hash/hash-fragment detection as `/update-password`
 * (see `lib/auth-callback.ts`) rather than relying only on
 * `onAuthStateChange`, since this project has already been bitten once by
 * assuming a single callback shape (see `auth/accept-invite/page.tsx`'s
 * doc comment).
 */
export default function PortalConfirmPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = getBrowserSupabase();

    const finalize = async () => {
      const { hasSession: sessionEstablished } = await establishSessionFromCallback(supabase);
      if (!isMounted) return;

      if (sessionEstablished) {
        router.replace('/portal/dashboard');
        return;
      }

      setHasSession(false);
      setIsReady(true);
    };

    void finalize();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (event === 'SIGNED_IN' && session) {
        setHasSession(true);
        router.replace('/portal/dashboard');
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [router]);

  if (!isReady && !hasSession) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <p className="text-sm text-muted-foreground">Confirming your account...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Confirmation link unavailable</h1>
        <p className="text-sm text-muted-foreground">
          This confirmation link is missing, expired, or has already been used. Try signing in —
          if that fails, create your account again.
        </p>
      </div>
      <Button asChild>
        <Link href={getMarketingPortalUrl()}>Go to customer portal</Link>
      </Button>
    </main>
  );
}
