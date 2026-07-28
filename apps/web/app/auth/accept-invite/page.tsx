'use client'; // Client component required for invite-link session handling and Supabase browser auth APIs.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getBrowserSupabase } from '@/lib/supabase';

import { completeInviteAcceptanceAction } from './actions';

/**
 * Landing page for Supabase's own "Invite user" email (Auth Reset
 * architecture — replaces the old custom /invite/[token] signUp() +
 * /auth/confirm + /invite/[token]/continue chain). The invited person gets
 * exactly one email, from Supabase itself, with a link straight to this
 * page (set via `redirectTo` on `supabase.auth.admin.inviteUserByEmail()` —
 * see team/actions.ts's createInviteAction).
 *
 * That link uses the same implicit-flow mechanism as password recovery
 * (see update-password/page.tsx, the proven working precedent this page
 * mirrors): Supabase's own hosted verify endpoint establishes a real
 * session and redirects here with the session in a URL hash fragment,
 * which never reaches the server — only the browser Supabase client can
 * see and process it, via `onAuthStateChange`'s `SIGNED_IN` event. There is
 * no token or code in this page's own URL to read, store, or log.
 *
 * Once a session exists, this page collects a full name + password (a
 * brand-new invited user has neither yet) and hands off to
 * completeInviteAcceptanceAction(), which resolves the invite by the
 * session's own verified email and activates org_members — see that
 * action's doc comment for why this is idempotent and safe to re-open.
 */
export default function AcceptInvitePage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [alreadyAcceptedOrgName, setAlreadyAcceptedOrgName] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const supabase = getBrowserSupabase();

    const finalizeStateFromSession = async () => {
      // Supabase's invite link (like its own hosted verify endpoint for
      // every email link type) redirects here with the session in a URL
      // HASH fragment — implicit-flow tokens (access_token/refresh_token),
      // never a server-visible query param. This app's Supabase client
      // (@supabase/ssr's createBrowserClient, used for cookie-based
      // sessions server components can also see) does NOT auto-detect that
      // hash the way plain @supabase/supabase-js does — it has to be
      // parsed and handed to `setSession()` explicitly, or the session is
      // silently never established at all. Verified directly: without
      // this, `getSession()`/`onAuthStateChange` never fire, even though
      // the URL correctly contains a real, valid hash fragment.
      const hash = window.location.hash;
      if (hash.length > 1) {
        const params = new URLSearchParams(hash.slice(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          // Strip the tokens from the address bar regardless of outcome —
          // they must never linger in browser history.
          window.history.replaceState(null, '', window.location.pathname);

          if (!isMounted) return;
          if (!error) {
            setHasSession(true);
            setIsReady(true);
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;
      setHasSession(Boolean(data.session));
      setIsReady(true);
    };

    void finalizeStateFromSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_IN') {
        setHasSession(Boolean(session));
        setIsReady(true);
        return;
      }
      if (event === 'SIGNED_OUT') {
        setHasSession(false);
        setIsReady(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!fullName.trim()) {
      setStatus('Enter your full name.');
      return;
    }
    if (password.length < 8) {
      setStatus('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setStatus('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    const supabase = getBrowserSupabase();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName.trim() },
    });

    if (updateError) {
      setStatus(updateError.message);
      setIsSubmitting(false);
      return;
    }

    const result = await completeInviteAcceptanceAction(fullName.trim());

    if (!result.success) {
      setStatus(result.error);
      setIsSubmitting(false);
      return;
    }

    if (result.data.alreadyAccepted) {
      setAlreadyAcceptedOrgName(result.data.orgName);
      setIsSubmitting(false);
      return;
    }

    router.replace('/today');
  };

  if (!isReady) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <p className="text-sm text-muted-foreground">Verifying your invitation link...</p>
      </main>
    );
  }

  if (!hasSession) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Invitation link unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link is missing, expired, or has already been used. Ask an owner or
            admin to send you a new one.
          </p>
        </div>
        <Button asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </main>
    );
  }

  if (alreadyAcceptedOrgName) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">You&apos;re already set up</h1>
          <p className="text-sm text-muted-foreground">
            This invitation to {alreadyAcceptedOrgName} was already accepted. Continue to your
            dashboard.
          </p>
        </div>
        <Button onClick={() => router.replace('/today')}>Go to dashboard</Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Set up your account</h1>
        <p className="text-sm text-muted-foreground">
          Finish setting up your account to join your team&apos;s workspace.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="accept-invite-fullName">Full name</Label>
          <Input
            id="accept-invite-fullName"
            name="fullName"
            autoComplete="name"
            required
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accept-invite-password">Password</Label>
          <Input
            id="accept-invite-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accept-invite-confirmPassword">Confirm password</Label>
          <Input
            id="accept-invite-confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Setting up...' : 'Create account'}
        </Button>
      </form>

      {status ? <p className="text-sm text-red-600">{status}</p> : null}
    </main>
  );
}
