'use client'; // Client component required for per-row server action state and submit feedback.

import { useActionState } from 'react';

import {
  type Result,
  type TeamMemberApprovalRole,
} from '@premier/shared';

import { Button } from '@/components/ui/button';

import {
  updateTeamMemberStatusAction,
  type UpdateTeamMemberActionState,
} from '../actions';

const APPROVAL_ROLE_OPTIONS: Array<{
  label: string;
  value: TeamMemberApprovalRole;
}> = [
  { label: 'Employee', value: 'employee' },
  { label: 'Admin', value: 'admin' },
  { label: 'Subcontractor', value: 'subcontractor' },
  { label: 'Viewer', value: 'viewer' },
];

export interface PendingTeamMember {
  email: string | null;
  fullName: string;
  id: string;
  joinedLabel: string;
  phone: string | null;
}

interface TeamApprovalListProps {
  members: PendingTeamMember[];
}

export function TeamApprovalList({ members }: TeamApprovalListProps) {
  return (
    <div className="space-y-4">
      {members.map((member) => (
        <PendingApprovalCard key={member.id} member={member} />
      ))}
    </div>
  );
}

function PendingApprovalCard({ member }: { member: PendingTeamMember }) {
  const [approveState, approveAction, isApproving] = useActionState<
    UpdateTeamMemberActionState | null,
    FormData
  >(updateTeamMemberStatusAction, null);
  const [rejectState, rejectAction, isRejecting] = useActionState<
    UpdateTeamMemberActionState | null,
    FormData
  >(updateTeamMemberStatusAction, null);
  const roleSelectId = `team-role-${member.id}`;

  return (
    <article className="rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="text-base font-medium text-foreground">
          {member.fullName}
        </h3>
        <p className="text-sm text-muted-foreground">
          {member.email ?? 'Email unavailable'}
        </p>
        <p className="text-sm text-muted-foreground">
          Requested {member.joinedLabel}
          {member.phone ? ` · ${member.phone}` : ''}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <form
          action={approveAction}
          className="flex flex-col gap-3 md:flex-row md:items-end"
        >
          <input type="hidden" name="memberId" value={member.id} />
          <input type="hidden" name="status" value="active" />
          <div className="space-y-2">
            <label
              htmlFor={roleSelectId}
              className="text-sm font-medium text-foreground"
            >
              Role on approval
            </label>
            <select
              id={roleSelectId}
              name="role"
              defaultValue="employee"
              className="flex h-9 min-w-48 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {APPROVAL_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={isApproving || isRejecting}>
            {isApproving ? 'Approving...' : 'Approve'}
          </Button>
        </form>

        <form action={rejectAction}>
          <input type="hidden" name="memberId" value={member.id} />
          <input type="hidden" name="status" value="rejected" />
          <Button
            type="submit"
            variant="outline"
            disabled={isApproving || isRejecting}
          >
            {isRejecting ? 'Rejecting...' : 'Reject'}
          </Button>
        </form>
      </div>

      <ActionMessage state={approveState} successMessage="Member approved." />
      <ActionMessage state={rejectState} successMessage="Member rejected." />
    </article>
  );
}

function ActionMessage({
  state,
  successMessage,
}: {
  state: Result<{ memberId: string; status: 'active' | 'rejected' }> | null;
  successMessage: string;
}) {
  if (!state) {
    return null;
  }

  if (!state.success) {
    return <p className="mt-3 text-sm text-red-600">{state.error}</p>;
  }

  return <p className="mt-3 text-sm text-emerald-700">{successMessage}</p>;
}
