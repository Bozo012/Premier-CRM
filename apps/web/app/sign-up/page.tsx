import Link from 'next/link';

import { Button } from '@/components/ui/button';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Team invites only
        </h1>
        <p className="text-sm text-muted-foreground">
          Contractor and staff accounts are now provisioned by an owner or admin
          from the in-app team access screen.
        </p>
        <p className="text-sm text-muted-foreground">
          If you need access, ask Kevin or another owner/admin to send you an
          invite. If you already have an account, use the sign-in or password
          reset flow.
        </p>
      </div>

      <Button asChild>
        <Link href="/login">Back to sign in</Link>
      </Button>

      <Link
        href="/forgot-password"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Already invited? Set or reset your password
      </Link>
    </main>
  );
}
