import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createCustomerPortalAccount, signInCustomerPortal } from '../actions';

interface PortalLoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readMessage(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return raw.length <= 240 ? raw : null;
}

export default async function PortalLoginPage({ searchParams }: PortalLoginPageProps) {
  const params = await searchParams;
  const message = readMessage(params.message);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-2 text-center">
        <Link href="/portal" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Premier customer portal
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to your customer account</h1>
        <p className="text-sm text-muted-foreground">
          Customer portal accounts use Supabase Auth and are separate from internal Premier roles.
        </p>
      </header>

      {message ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {message}
        </p>
      ) : null}

      <section className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use the email and password for your customer portal account.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={signInCustomerPortal} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input id="signin-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input id="signin-password" name="password" type="password" autoComplete="current-password" required />
              </div>
              <Button type="submit" className="w-full">Sign in</Button>
            </form>
            <Link
              href="/portal/forgot-password"
              className="mt-3 inline-flex text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Create account</CardTitle>
            <CardDescription>
              Create a normal customer account. This does not add you to Premier staff or org_members.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createCustomerPortalAccount} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full name</Label>
                <Input id="signup-name" name="fullName" autoComplete="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input id="signup-email" name="email" type="email" autoComplete="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
              </div>
              <Button type="submit" className="w-full">Create customer account</Button>
            </form>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
