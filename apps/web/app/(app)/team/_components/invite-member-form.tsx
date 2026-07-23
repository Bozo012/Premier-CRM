'use client';
// Client component: needs useActionState for the invite form and toast feedback.

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { createInviteAction, type CreateInviteActionState } from '../actions';

const ROLE_OPTIONS = [
  { label: 'Employee', value: 'employee' },
  { label: 'Admin', value: 'admin' },
  { label: 'Subcontractor', value: 'subcontractor' },
  { label: 'Viewer', value: 'viewer' },
];

export function InviteMemberForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<CreateInviteActionState | null, FormData>(
    createInviteAction,
    null
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(
        state.data.emailSent
          ? `Invite sent to ${state.data.invite.email}.`
          : `Invite created for ${state.data.invite.email}, but the email failed to send. Share the link manually.`
      );
      router.refresh();
    } else if (state && !state.success) {
      toast.error(state.error ?? 'Could not send the invite. Please try again.');
    }
  }, [state, router]);

  return (
    <form action={formAction} className="space-y-4 rounded-md border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="invite-fullName">Full name</Label>
          <Input id="invite-fullName" name="fullName" required maxLength={120} placeholder="Jane Doe" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" required placeholder="jane@example.com" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue="employee"
            required
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? 'Sending invite…' : 'Send invite'}
        </Button>
        {state && !state.success ? <span className="text-sm text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
