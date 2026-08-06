// Layer 2 adapter — maps a real TeamMemberRecord
// (packages/db/queries/team.ts:getTeamMemberById) plus real assignment rows
// into the generic RecordDetailModel shape RecordDetailView renders,
// following the exact pattern of
// ../../customers/_lib/forge-customer-detail-view-model.ts and Base44's own
// TeamMemberDetailRoute (which also renders through the generic
// RecordDetailView kit — see src/fixtures/recordDetails/teamMemberDetails.ts
// — rather than a bespoke layout).
//
// Capability summary is derived from packages/shared/permissions.ts's
// EXISTING hasCapability()/OrgRole — no new capability name is invented
// here. Gaps vs. Base44's fixture (documented in the report, NOT
// fabricated): first-class job-crew assignment (real source is site-visit
// assignments only), completed-work aggregation (no query exists),
// internal notes and activity history (no per-member table exists).
import { hasCapability, type Capability, type OrgRole } from '@premier/shared';
import type { TeamAvailabilityRecord, OrgMember } from '@premier/db';
import { formatTeamAvailabilityLabel, resolveDisplayedTeamAvailability, type TeamAvailabilityStatus } from '@premier/db';

import type { DetailSection, DetailTone, RecordDetailModel } from '@/components/forge-shell/recordDetail.types';

import { formatJoinedDate, formatLastActive, initialsFor, roleLabel } from './forge-team-view-model';

const AVAILABILITY_TONE: Record<TeamAvailabilityStatus, DetailTone> = {
  available: 'success',
  on_job: 'info',
  off_shift: 'neutral',
  on_leave: 'warning',
};

const SUMMARY_CAPABILITIES: { id: Capability; label: string }[] = [
  { id: 'canTriageRequests', label: 'Triage requests' },
  { id: 'canScheduleJobs', label: 'Schedule jobs' },
  { id: 'canCreateEstimates', label: 'Create estimates' },
  { id: 'canApproveEstimatePricing', label: 'Approve estimate pricing' },
  { id: 'canCreateQuote', label: 'Create quotes' },
  { id: 'canCreateInvoices', label: 'Create invoices' },
  { id: 'canRecordPayments', label: 'Record payments' },
  { id: 'canManageDeposits', label: 'Manage deposits' },
];

export function buildCapabilitySummary(role: OrgRole): string {
  const granted = SUMMARY_CAPABILITIES.filter((c) => hasCapability(role, c.id)).map((c) => c.label);
  return granted.length > 0 ? granted.join(', ') : 'No elevated capabilities for this role.';
}

export interface AssignedSiteVisitRow {
  id: string;
  status: string;
  completed_at: string | null;
}

export interface UpcomingAppointmentRow {
  id: string;
  site_visit_id: string;
  scheduled_start: string;
  status: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function formatEnumLabel(value: string): string {
  return value
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

export function toTeamMemberDetailModel(args: {
  member: OrgMember;
  profile: { full_name: string | null; phone: string | null } | null;
  availability: TeamAvailabilityRecord | null;
  email: string | null;
  assignedSiteVisits: AssignedSiteVisitRow[];
  upcomingAppointments: UpcomingAppointmentRow[];
  canManageTeam: boolean;
  isSelf: boolean;
}): RecordDetailModel {
  const { member, profile, availability, email, assignedSiteVisits, upcomingAppointments, canManageTeam, isSelf } = args;
  const fullName = profile?.full_name?.trim() || 'Unnamed user';
  const manualAvailability = availability?.availability_status ?? 'available';
  const displayedAvailability = resolveDisplayedTeamAvailability({ activeAssignmentCount: assignedSiteVisits.length, manualStatus: manualAvailability });
  const skills = availability?.skills?.length ? availability.skills : [];
  const canEditAvailability = canManageTeam || isSelf;

  const sections: DetailSection[] = [
    {
      kind: 'fields',
      id: 'contact',
      title: 'Contact & account',
      fields: [
        { label: 'Email', value: email ?? 'Email unavailable' },
        { label: 'Phone', value: profile?.phone ?? 'Phone unavailable' },
        { label: 'Role', value: roleLabel(member.role) },
        { label: 'Joined', value: formatJoinedDate(member.joined_at) },
        { label: 'Last active', value: formatLastActive(availability?.last_seen_at, member.joined_at) },
      ],
    },
    {
      kind: 'fields',
      id: 'capabilities',
      title: 'Capabilities',
      fields: [
        { label: 'Skills', value: skills.length > 0 ? skills.join(' · ') : 'None recorded' },
        { label: 'Capability summary', value: buildCapabilitySummary(member.role) },
        { label: 'Availability', value: formatTeamAvailabilityLabel(displayedAvailability) },
      ],
    },
    {
      kind: 'related',
      id: 'assigned',
      title: 'Current assignments',
      emptyMessage: 'No open site-visit assignments right now.',
      items: assignedSiteVisits.map((visit) => ({
        id: visit.id,
        label: `Site visit · ${formatEnumLabel(visit.status)}`,
        sublabel: visit.completed_at ? `Completed ${formatDate(visit.completed_at)}` : undefined,
        badge: formatEnumLabel(visit.status),
        badgeTone: visit.status === 'in_progress' ? 'info' : 'neutral',
        route: `/site-visits/${visit.id}`,
        recordType: 'site visit',
      })),
    },
    {
      kind: 'related',
      id: 'schedule',
      title: 'Upcoming schedule',
      emptyMessage: 'Nothing scheduled for this member.',
      items: upcomingAppointments.map((appt) => ({
        id: appt.id,
        label: `Site-visit appointment · ${formatDate(appt.scheduled_start)}`,
        sublabel: formatEnumLabel(appt.status),
        route: `/site-visits/${appt.site_visit_id}`,
        recordType: 'site visit',
      })),
    },
  ];

  return {
    recordType: 'Team member',
    identity: initialsFor(fullName),
    title: fullName,
    statusLabel: formatTeamAvailabilityLabel(displayedAvailability),
    statusTone: AVAILABILITY_TONE[displayedAvailability],
    backLabel: 'Back to team',
    contextChips: [
      { id: 'role', label: roleLabel(member.role) },
      { id: 'assignments', label: `${assignedSiteVisits.length} assigned site ${assignedSiteVisits.length === 1 ? 'visit' : 'visits'}` },
      { id: 'active', label: `Last active ${formatLastActive(availability?.last_seen_at, member.joined_at)}` },
    ],
    summaryTiles: [
      { id: 'avail', label: 'Availability', value: formatTeamAvailabilityLabel(displayedAvailability), tone: displayedAvailability === 'on_leave' ? 'warning' : 'neutral' },
      { id: 'assignments', label: 'Assigned site visits', value: String(assignedSiteVisits.length) },
      { id: 'role', label: 'Role', value: roleLabel(member.role) },
      { id: 'active', label: 'Last active', value: formatLastActive(availability?.last_seen_at, member.joined_at) },
    ],
    // No real "edit member" / "change role" / "deactivate" / "reactivate"
    // action or server action exists anywhere in this codebase today
    // (verified: apps/web/app/(app)/(forge)/team/actions.ts only has
    // create/resend/revoke-invite and update-availability) — not wired,
    // not simulated. Availability editing IS real (upsertTeamMemberAvailability)
    // but doesn't fit RecordDetailView's id-only action contract (it needs
    // a <select>), so it's rendered as a real form below this container
    // (see [memberId]/page.tsx), gated by the same canEditAvailability rule
    // used by the pre-existing list page.
    primaryAction: null,
    secondaryActions: canEditAvailability ? [] : [],
    sections,
  };
}
