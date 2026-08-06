// Layer 2 adapter (Forge V1.1 Base44-exact UI rebuild) — extracted, UNCHANGED
// in behavior, from the pre-existing (legacy)/team/page.tsx's inline field
// computation (activeAssignments, availability via
// resolveDisplayedTeamAvailability, joinedLabel, lastActiveLabel, skills).
// The actual org_members/user_profiles/team_member_availability/
// site_visits/site_visit_appointments/org_invites queries stay in page.tsx
// (same split as ../../customers/page.tsx: fetches in the server component,
// pure mapping here) — this file only converts already-fetched rows into
// the TeamMemberView / TeamListViewModel / TeamMember (ported-contract)
// shapes.
import { formatTeamAvailabilityLabel, resolveDisplayedTeamAvailability, TEAM_AVAILABILITY_STATUSES, type OrgMember, type TeamAvailabilityRecord, type TeamAvailabilityStatus } from '@premier/db';

import type { TeamFilter, TeamListViewModel, TeamMember } from './forge-team-contracts';

export interface TeamMemberView {
  activeAssignments: number;
  availability: TeamAvailabilityStatus;
  email: string | null;
  fullName: string;
  id: string;
  joinedLabel: string;
  lastActiveLabel: string;
  manualAvailability: TeamAvailabilityStatus;
  phone: string | null;
  role: OrgMember['role'];
  skills: string[];
  userId: string;
}

const DEFAULT_SKILLS_BY_ROLE: Record<OrgMember['role'], string[]> = {
  admin: ['Scheduling', 'Estimating', 'Customer relations'],
  employee: ['Field work', 'Customer updates'],
  owner: ['Scheduling', 'Estimating', 'Customer relations'],
  subcontractor: ['Field work', 'Specialty service'],
  viewer: ['Pricing review', 'Reporting'],
};

export function formatJoinedDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * `lastActiveLabel` is derived from `team_member_availability.last_seen_at`
 * — real, persisted whenever a member updates their own availability (see
 * upsertTeamMemberAvailability in packages/db/queries/team-availability.ts,
 * which only stamps `last_seen_at` when the actor updates their own row).
 * It is NOT a general last-login/last-request timestamp — a member who
 * never touches their availability control shows their join date instead.
 * Unchanged from the pre-existing (legacy) page.tsx.
 */
export function formatLastActive(lastSeenAt: string | null | undefined, fallbackJoinedDate: string): string {
  if (!lastSeenAt) return `Joined ${formatJoinedDate(fallbackJoinedDate)}`;
  const elapsedMs = Date.now() - new Date(lastSeenAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  if (elapsedMinutes < 1) return 'Now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

export function roleLabel(role: OrgMember['role']): string {
  return role.replaceAll('_', ' ');
}

export function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * `activeAssignments` counts open `site_visits` + `site_visit_appointments`
 * rows assigned to this user — Forge has no first-class "job crew" model.
 * See the gap report: "job crew assignment" is backend-completion-required,
 * intentionally not simulated by overloading this field.
 */
export function buildTeamMemberView(args: {
  activeAssignments: number;
  availability: TeamAvailabilityRecord | undefined;
  email: string | null;
  member: OrgMember;
  profile: Pick<{ full_name: string | null; phone: string | null }, 'full_name' | 'phone'> | undefined;
}): TeamMemberView {
  const manualAvailability = args.availability?.availability_status ?? 'available';
  const skills = args.availability?.skills?.length ? args.availability.skills : DEFAULT_SKILLS_BY_ROLE[args.member.role];

  return {
    activeAssignments: args.activeAssignments,
    availability: resolveDisplayedTeamAvailability({ activeAssignmentCount: args.activeAssignments, manualStatus: manualAvailability }),
    email: args.email,
    fullName: args.profile?.full_name?.trim() || 'Unnamed user',
    id: args.member.id,
    joinedLabel: formatJoinedDate(args.member.joined_at),
    lastActiveLabel: formatLastActive(args.availability?.last_seen_at, args.member.joined_at),
    manualAvailability,
    phone: args.profile?.phone ?? null,
    role: args.member.role,
    skills,
    userId: args.member.user_id,
  };
}

function toTeamMember(view: TeamMemberView): TeamMember {
  return {
    id: view.id,
    name: view.fullName,
    email: view.email ?? 'Email unavailable',
    phone: view.phone ?? 'Phone unavailable',
    role: roleLabel(view.role),
    initials: initialsFor(view.fullName),
    availability: view.availability,
    availabilityLabel: formatTeamAvailabilityLabel(view.availability),
    // Labeled "active assignments" in the ported TeamList card (not "active
    // jobs" as Base44's fixture copy read) since the real source is
    // site-visit assignments, not a job-crew model — see the gap report.
    assignedJobs: view.activeAssignments,
    skills: view.skills,
    lastActiveLabel: view.lastActiveLabel,
  };
}

export function buildTeamFilters(members: TeamMemberView[]): TeamFilter[] {
  return [
    { id: 'all', label: 'All', count: members.length },
    ...TEAM_AVAILABILITY_STATUSES.map((status) => ({
      id: status,
      label: formatTeamAvailabilityLabel(status),
      count: members.filter((member) => member.availability === status).length,
    })),
  ];
}

export function toTeamListViewModel(args: {
  members: TeamMemberView[];
  searchQuery: string;
  activeFilter: TeamAvailabilityStatus | 'all';
  error?: { title: string; message: string } | null;
}): TeamListViewModel {
  const { members, searchQuery, activeFilter, error = null } = args;
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filtered = members.filter((member) => {
    const matchesFilter = activeFilter === 'all' || member.availability === activeFilter;
    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;
    return [member.fullName, roleLabel(member.role), member.email ?? '', member.phone ?? '', ...member.skills]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });

  return {
    members: filtered.map(toTeamMember),
    searchQuery,
    activeFilter,
    filters: buildTeamFilters(members),
    isLoading: false,
    error,
  };
}
