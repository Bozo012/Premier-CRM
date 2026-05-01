'use client'; // Client component required for password recovery event handling and Supabase browser auth APIs.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getBrowserSupabase } from '@/lib/supabase';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [canUpdatePassword, setCanUpdatePassword] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = getBrowserSupabase();

    const finalizeStateFromSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      setCanUpdatePassword(Boolean(data.session));
      setIsReady(true);
    };

    void finalizeStateFromSession();

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) {
          return;
        }

        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
          setCanUpdatePassword(Boolean(session));
          setIsReady(true);
          return;
        }

        if (event === 'SIGNED_OUT') {
          setCanUpdatePassword(false);
          setIsReady(true);
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

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
    const { error } = await supabase.auth.updateUser({
      password,
    });

    if (error) {
      setStatus(error.message);
      setIsSubmitting(false);
      return;
    }

    router.replace('/today');
  };

  if (!isReady) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <p className="text-sm text-muted-foreground">
          Verifying your password reset link...
        </p>
      </main>
    );
  }

  if (!canUpdatePassword) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Reset link unavailable
          </h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is missing, expired, or has already been
            used.
          </p>
        </div>

        <Button asChild>
          <Link href="/forgot-password">Request a new reset link</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Set your password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter a new password for your contractor or staff account.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm password</Label>
          <Input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            placeholder="Re-enter your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Saving...' : 'Save password'}
        </Button>
      </form>

      {status ? <p className="text-sm text-red-600">{status}</p> : null}
    </main>
  );
}
