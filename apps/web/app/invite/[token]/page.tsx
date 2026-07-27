import { notFound } from 'next/navigation';

import { createServiceClient, getInviteByToken } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { acceptInviteAction } from '../actions';

interface InvitePageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readMessage(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  return raw.length <= 300 ? raw : null;
}

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { token } = await params;
  const query = await searchParams;
  const message = readMessage(query.message);
  const isPendingConfirmation = query.pending === '1';

  if (!isUuid(token)) {
    notFound();
  }

  const client = createServiceClient();
  const result = await getInviteByToken(client, { token });

  if (!result.success) {
    notFound();
  }

  const invite = result.data;
  const isExpired = invite.status === 'pending' && new Date(invite.expires_at) < new Date();
  const isUsable = invite.status === 'pending' && !isExpired;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Join Premier</h1>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been invited to join the Premier team workspace as {formatRole(invite.role)}.
        </p>
      </div>

      {message ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      ) : null}

      {isPendingConfirmation ? (
        <Card>
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a confirmation link to {invite.email}. Click it to finish setting up your
              account.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : !isUsable ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {isExpired || invite.status === 'expired' ? 'Invite expired' : 'Invite no longer valid'}
            </CardTitle>
            <CardDescription>
              {isExpired || invite.status === 'expired'
                ? 'Ask an owner or admin to send you a new invite.'
                : invite.status === 'accepted'
                  ? 'This invite has already been accepted. Sign in instead.'
                  : 'This invite was revoked. Ask an owner or admin to send you a new one.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <a href="/login">Go to sign in</a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Set up your account</CardTitle>
            <CardDescription>{invite.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={acceptInviteAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />

              <div className="space-y-2">
                <Label htmlFor="accept-fullName">Full name</Label>
                <Input
                  id="accept-fullName"
                  name="fullName"
                  autoComplete="name"
                  defaultValue={invite.full_name}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="accept-password">Password</Label>
                <Input
                  id="accept-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>

              <Button type="submit" className="w-full">
                Create account
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function formatRole(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
