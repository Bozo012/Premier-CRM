'use client'; // Client component required for form state, auth redirects, and Supabase browser auth APIs.

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getPostAuthRedirectPath,
  normalizeRedirectPath,
} from '@/lib/auth-routing';
import { getBrowserSupabase } from '@/lib/supabase';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  const redirectTo = normalizeRedirectPath(searchParams.get('redirectTo'));

  useEffect(() => {
    const supabase = getBrowserSupabase();

    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (data.session) {
        const destination = await getPostAuthRedirectPath(
          supabase,
          data.session.user.id,
          redirectTo
        );
        router.replace(destination);
        return;
      }

      setIsCheckingSession(false);
    };

    void checkExistingSession();
  }, [redirectTo, router]);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setStatus(null);

    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setStatus(error.message);
      setIsSubmitting(false);
      return;
    }

    const destination = await getPostAuthRedirectPath(
      supabase,
      data.user.id,
      redirectTo
    );
    router.replace(destination);
  };

  if (isCheckingSession) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
        <p className="text-sm text-muted-foreground">Checking your session...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Sign in to Premier
        </h1>
        <p className="text-sm text-muted-foreground">
          Contractor and staff accounts use email and password.
        </p>
        <p className="text-sm text-muted-foreground">
          If your account was created during the magic-link phase, use password
          reset once to set your password.
        </p>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <Link
              href={`/forgot-password?email=${encodeURIComponent(email)}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <div className="text-sm text-muted-foreground">
        New to Premier?{' '}
        <Link className="underline-offset-4 hover:underline" href="/sign-up">
          Create your account
        </Link>
      </div>

      {status ? <p className="text-sm text-red-600">{status}</p> : null}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
