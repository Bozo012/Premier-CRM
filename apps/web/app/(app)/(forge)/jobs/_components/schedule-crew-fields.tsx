'use client'; // Lead radio selection needs local state to keep the hidden leadUserId input in sync with the checked crew checkboxes.

// Real "Schedule and crew" fields for the manual job-creation flow (Base44-
// exact job creation's Step 3, folded into the single real form
// CustomerPropertyWorkForm submits — see createJobWithScheduleAction's doc
// comment in ../actions.ts for why this is a sequential multi-step server
// action, not a single atomic RPC). Purely additive: renders into
// CustomerPropertyWorkForm's `extraFields` slot, reading from the same
// FormData the rest of the form already submits.
import { useState } from 'react';

import type { AssignableTeamMember } from '@premier/db';

const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Available',
  on_job: 'On job',
  off_shift: 'Off shift',
  on_leave: 'On leave',
};

export function ScheduleCrewFields({ availableMembers, canScheduleJobs }: { availableMembers: AssignableTeamMember[]; canScheduleJobs: boolean }) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [leadUserId, setLeadUserId] = useState<string>('');

  if (!canScheduleJobs) {
    // Scheduling/crew assignment requires canScheduleJobs (re-verified
    // server-side too) — a role without it gets a manual job with no
    // schedule/crew step, matching every other real-permission UI mirror in
    // this program.
    return null;
  }

  const toggleMember = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      if (!next.includes(leadUserId)) setLeadUserId(next[0] ?? '');
      return next;
    });
  };

  return (
    <section className="space-y-4 rounded-md border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">4. Schedule and crew (optional)</h2>
      <p className="text-xs text-muted-foreground">
        Leave blank to create the job unscheduled — you can schedule and assign crew from the job&apos;s detail page later.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="new-job-scheduled-start" className="text-sm font-medium text-foreground">
            Scheduled start
          </label>
          <input
            id="new-job-scheduled-start"
            name="scheduledStart"
            type="datetime-local"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="new-job-scheduled-end" className="text-sm font-medium text-foreground">
            Scheduled end <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <input
            id="new-job-scheduled-end"
            name="scheduledEnd"
            type="datetime-local"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Assign crew</p>
        {availableMembers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active team members to assign.</p>
        ) : (
          <ul className="space-y-1.5">
            {availableMembers.map((member) => {
              const checked = selectedUserIds.includes(member.userId);
              return (
                <li key={member.userId} className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      name="crewUserId"
                      value={member.userId}
                      checked={checked}
                      onChange={() => toggleMember(member.userId)}
                      className="h-4 w-4 rounded border-input"
                    />
                    {member.displayName}
                    {member.availabilityStatus ? (
                      <span className="text-xs text-muted-foreground">({AVAILABILITY_LABELS[member.availabilityStatus] ?? member.availabilityStatus})</span>
                    ) : null}
                  </label>
                  {checked ? (
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="leadUserIdRadio"
                        checked={leadUserId === member.userId}
                        onChange={() => setLeadUserId(member.userId)}
                        className="h-3.5 w-3.5"
                      />
                      Lead
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <input type="hidden" name="leadUserId" value={leadUserId} />
    </section>
  );
}
