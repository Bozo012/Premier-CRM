'use client'; // Add/remove/set-lead are form submissions against real server actions; needs router.refresh() after each mutation.

// Real crew-management widget for Job Detail (design/job-crew-assignment-model,
// PR #131's backend + this slice's UI). Not part of the generic
// RecordDetailView kit — Base44's detail sections are pure display data
// (fields/related/timeline/etc.), none of which supports an interactive
// add/remove/promote-to-lead control, so this is a real, bespoke Forge
// component composed alongside RecordDetailView on the page, matching the
// established pattern from PR #128 (Add property) of layering real
// interactive capabilities the generic kit has no slot for.
import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

import type { AssignableTeamMember, JobAssignment } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  assignJobCrewMemberAction,
  removeJobCrewMemberAction,
  setJobLeadAction,
  type AssignJobCrewMemberActionState,
  type RemoveJobCrewMemberActionState,
  type SetJobLeadActionState,
} from '../actions';

const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Available',
  on_job: 'On job',
  off_shift: 'Off shift',
  on_leave: 'On leave',
};

/** Real conflict signal — no fabricated double-booking detection. A member
 * whose own `team_member_availability.availability_status` is `on_leave` or
 * `off_shift` is flagged; anything else (including no availability row at
 * all) is treated as no known conflict. */
function isConflicted(status: string | null): boolean {
  return status === 'on_leave' || status === 'off_shift';
}

export function CrewSection({
  jobId,
  assignments,
  availableMembers,
  canManageCrew,
}: {
  jobId: string;
  assignments: JobAssignment[];
  availableMembers: AssignableTeamMember[];
  canManageCrew: boolean;
}) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isTransitionPending, startTransition] = useTransition();

  const [assignState, assignFormAction, isAssignPending] = useActionState<AssignJobCrewMemberActionState | null, FormData>(
    assignJobCrewMemberAction,
    null
  );
  const [removeState, removeFormAction, isRemovePending] = useActionState<RemoveJobCrewMemberActionState | null, FormData>(
    removeJobCrewMemberAction,
    null
  );
  const [leadState, leadFormAction, isLeadPending] = useActionState<SetJobLeadActionState | null, FormData>(
    setJobLeadAction,
    null
  );

  useEffect(() => {
    if (!assignState) return;
    if (assignState.success) {
      toast.success('Crew member assigned.');
      setSelectedUserId('');
      router.refresh();
    } else {
      toast.error(assignState.error ?? 'Could not assign crew member.');
    }
  }, [assignState]);

  useEffect(() => {
    if (!removeState) return;
    if (removeState.success) {
      toast.success('Crew member removed.');
      router.refresh();
    } else {
      toast.error(removeState.error ?? 'Could not remove crew member.');
    }
  }, [removeState]);

  useEffect(() => {
    if (!leadState) return;
    if (leadState.success) {
      toast.success('Lead technician updated.');
      router.refresh();
    } else {
      toast.error(leadState.error ?? 'Could not set the lead technician.');
    }
  }, [leadState]);

  const assignedUserIds = new Set(assignments.map((a) => a.userId));
  const pickableMembers = availableMembers.filter((m) => !assignedUserIds.has(m.userId));
  const isPending = isAssignPending || isRemovePending || isLeadPending || isTransitionPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crew</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crew assigned to this job yet.</p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((assignment) => {
              const member = availableMembers.find((m) => m.userId === assignment.userId);
              const conflict = member ? isConflicted(member.availabilityStatus) : false;
              return (
                <li key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{assignment.displayName}</span>
                      {assignment.isLead ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">Lead</span>
                      ) : null}
                      {member?.availabilityStatus ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${conflict ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground'}`}
                        >
                          {AVAILABILITY_LABELS[member.availabilityStatus] ?? member.availabilityStatus}
                        </span>
                      ) : null}
                    </div>
                    {conflict ? (
                      <p className="text-xs text-amber-700">
                        This member&apos;s availability is set to {AVAILABILITY_LABELS[member!.availabilityStatus!]?.toLowerCase()} — Forge flags this as a
                        possible crew conflict.
                      </p>
                    ) : null}
                  </div>
                  {canManageCrew ? (
                    <div className="flex gap-2">
                      {!assignment.isLead ? (
                        <form
                          action={(formData) => startTransition(() => leadFormAction(formData))}
                        >
                          <input type="hidden" name="jobId" value={jobId} />
                          <input type="hidden" name="userId" value={assignment.userId} />
                          <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                            Make lead
                          </Button>
                        </form>
                      ) : null}
                      <form action={(formData) => startTransition(() => removeFormAction(formData))}>
                        <input type="hidden" name="jobId" value={jobId} />
                        <input type="hidden" name="userId" value={assignment.userId} />
                        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
                          Remove
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {canManageCrew ? (
          <form
            action={(formData) => startTransition(() => assignFormAction(formData))}
            className="flex flex-wrap items-end gap-2 border-t pt-3"
          >
            <input type="hidden" name="jobId" value={jobId} />
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label htmlFor={`crew-member-${jobId}`} className="text-xs font-medium text-muted-foreground">
                Add crew member
              </label>
              <select
                id={`crew-member-${jobId}`}
                name="userId"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a team member…</option>
                {pickableMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.displayName}
                    {member.availabilityStatus ? ` — ${AVAILABILITY_LABELS[member.availabilityStatus] ?? member.availabilityStatus}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <input type="hidden" name="isLead" value="false" />
            <Button type="submit" size="sm" disabled={isPending || !selectedUserId}>
              <UserPlus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Assign
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
