'use client'; // Lead radio selection needs local state to keep the hidden leadUserId input in sync with the checked crew checkboxes, and the conflict pre-check needs local state for the warning/override UI.

// Real "Schedule and crew" fields for the manual job-creation flow (Base44-
// exact job creation's Step 3, folded into the single real form
// CustomerPropertyWorkForm submits — see createJobWithScheduleAction's doc
// comment in ../actions.ts). Purely additive: renders into
// CustomerPropertyWorkForm's `extraFields` slot, reading from the same
// FormData the rest of the form already submits.
//
// V1 scheduling reliability (20260814010000_scheduling_conflict_detection.sql,
// Phase 8): before final create, this runs a live conflict pre-check
// (checkSchedulingConflictsAction, the same centralized query the atomic
// creation RPC re-checks at commit time) against the proposed schedule and
// selected crew, and requires an explicit "Schedule anyway" confirmation
// before allowing submit if conflicts are found — warning + override, not
// a silent pass-through and not a hard block.
import { useState } from 'react';

import type { AssignableTeamMember, SchedulingConflict } from '@premier/db';

import { checkSchedulingConflictsAction } from '../actions';

const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Available',
  on_job: 'On job',
  off_shift: 'Off shift',
  on_leave: 'On leave',
};

export function ScheduleCrewFields({ availableMembers, canScheduleJobs }: { availableMembers: AssignableTeamMember[]; canScheduleJobs: boolean }) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [leadUserId, setLeadUserId] = useState<string>('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [scheduledEnd, setScheduledEnd] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [conflicts, setConflicts] = useState<SchedulingConflict[] | null>(null);
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);

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
    setConflicts(null);
    setOverrideConfirmed(false);
  };

  async function checkForConflicts() {
    if (!scheduledStart || selectedUserIds.length === 0) {
      setConflicts(null);
      return;
    }
    const start = new Date(scheduledStart);
    if (Number.isNaN(start.getTime())) return;
    const end = scheduledEnd ? new Date(scheduledEnd) : new Date(start.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(end.getTime())) return;

    setIsChecking(true);
    setOverrideConfirmed(false);
    const result = await checkSchedulingConflictsAction(selectedUserIds, start.toISOString(), end.toISOString());
    setIsChecking(false);
    setConflicts(result.success ? result.data : null);
  }

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
            value={scheduledStart}
            onChange={(event) => {
              setScheduledStart(event.target.value);
              setConflicts(null);
              setOverrideConfirmed(false);
            }}
            onBlur={checkForConflicts}
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
            value={scheduledEnd}
            onChange={(event) => {
              setScheduledEnd(event.target.value);
              setConflicts(null);
              setOverrideConfirmed(false);
            }}
            onBlur={checkForConflicts}
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
                      onChange={() => {
                        toggleMember(member.userId);
                        // Re-check shortly after the checkbox state settles.
                        setTimeout(checkForConflicts, 0);
                      }}
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

      {isChecking ? <p className="text-xs text-muted-foreground">Checking schedule…</p> : null}

      {conflicts && conflicts.length > 0 ? (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="font-medium text-amber-900 dark:text-amber-200">Schedule conflict</p>
          <p className="text-amber-800 dark:text-amber-300">Assigned crew already has:</p>
          <ul className="space-y-1">
            {conflicts.map((c) => (
              <li key={`${c.recordType}-${c.recordId}`} className="text-amber-800 dark:text-amber-300">
                {c.title ?? 'Untitled'} · {new Date(c.conflictStart).toLocaleString()}–{new Date(c.conflictEnd).toLocaleTimeString()}
                {c.propertyAddress ? ` · ${c.propertyAddress}` : ''}
              </li>
            ))}
          </ul>
          <label className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <input
              type="checkbox"
              checked={overrideConfirmed}
              onChange={(event) => setOverrideConfirmed(event.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Schedule anyway
          </label>
        </div>
      ) : null}

      <input type="hidden" name="overrideConflicts" value={overrideConfirmed ? 'true' : 'false'} />
    </section>
  );
}
