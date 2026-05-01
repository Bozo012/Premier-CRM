'use client'; // Client component required for interactive invite submission state.

import { useActionState } from 'react';

import { type TeamMemberApprovalRole } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  inviteTeamMemberAction,
  type InviteTeamMemberActionState,
} from '../actions';

const INVITE_ROLE_OPTIONS: Array<{
  label: string;
  value: TeamMemberApprovalRole;
}> = [
  { label: 'Employee', value: 'employee' },
  { label: 'Admin', value: 'admin' },
  { label: 'Subcontractor', value: 'subcontractor' },
  { label: 'Viewer', value: 'viewer' },
];

export function InviteTeamMemberForm() {
  const [state, formAction, isPending] = useActionState<
    InviteTeamMemberActionState | null,
    FormData
  >(inviteTeamMemberAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="invite-full-name">Full name</Label>
          <Input
            id="invite-full-name"
            name="fullName"
            type="text"
            required
            autoComplete="name"
            placeholder="New team member name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="teammate@company.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="employee"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:max-w-56"
        >
          {INVITE_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Sending invite...' : 'Send invite'}
      </Button>

      {state?.success ? (
        <p className="text-sm text-emerald-700">{state.data.message}</p>
      ) : null}
      {state && !state.success ? (
        <p className="text-sm text-red-600">{state.error}</p>
      ) : null}
    </form>
  );
}
