'use client'; // Client component required for form state and Supabase browser auth APIs.

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getBrowserSupabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo = searchParams.get('redirectTo') || '/today';

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSubmitting(true);
    setStatus(null);

    const supabase = getBrowserSupabase();
    const redirectUrl = new URL('/today', window.location.origin);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: redirectUrl.toString(),
      },
    });

    if (error) {
      setStatus(error.message);
      setIsSubmitting(false);
      return;
    }

    setStatus('Magic link sent. Check your email and open it on this device.');
    setIsSubmitting(false);
  };

  const continueIfSignedIn = async () => {
    const supabase = getBrowserSupabase();
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      router.replace(redirectTo);
      return;
    }

    setStatus('No active session found yet. Open your magic link first.');
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to Premier</h1>
        <p className="text-sm text-muted-foreground">Use a magic link sent to your email.</p>
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

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Sending…' : 'Send magic link'}
        </Button>
      </form>

      <Button variant="outline" onClick={continueIfSignedIn}>
        I already clicked my link
      </Button>

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
    </main>
  );
}
