import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Mail, Phone, Plus, Search, SearchX } from 'lucide-react';

import {
  createServiceClient,
  formatTeamAvailabilityLabel,
  getActiveOrgContext,
  resolveDisplayedTeamAvailability,
  TEAM_AVAILABILITY_STATUSES,
  type Database,
  type OrgInvite,
  type TeamAvailabilityStatus,
} from '@premier/db';

import { ForgeCard, ForgePage } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';
import { cn } from '@/lib/utils';

import { CopyInviteLinkButton } from './_components/copy-invite-link-button';
import { InviteMemberForm } from './_components/invite-member-form';
import { ResendInviteButton } from './_components/resend-invite-button';
import { RevokeInviteButton } from './_components/revoke-invite-button';
import { updateTeamAvailabilityFormAction } from './actions';

type OrgMember = Database['public']['Tables']['org_members']['Row'];
type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type TeamAvailability = Database['public']['Tables']['team_member_availability']['Row'];

interface TeamPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

interface TeamMemberView {
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

const availabilityDotColors: Record<TeamAvailabilityStatus, string> = {
  available: 'bg-emerald-500',
  off_shift: 'bg-slate-400',
  on_job: 'bg-indigo-500',
  on_leave: 'bg-amber-500',
};

const defaultSkillsByRole: Record<OrgMember['role'], string[]> = {
  admin: ['Scheduling', 'Estimating', 'Customer relations'],
  employee: ['Field work', 'Customer updates'],
  owner: ['Scheduling', 'Estimating', 'Customer relations'],
  subcontractor: ['Field work', 'Specialty service'],
  viewer: ['Pricing review', 'Reporting'],
};

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const activeFilter = readAvailabilityFilter(params.filter);
  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/team');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <TeamPageShell canManageTeam={false} search={search} activeFilter={activeFilter} filters={emptyFilters()}>
        <ErrorPanel message={orgContextResult.error} />
      </TeamPageShell>
    );
  }

  const { orgId, role } = orgContextResult.data;
  const canManageTeam = role === 'owner' || role === 'admin';

  const { data: members, error: membersError } = await supabase
    .from('org_members')
    .select('id, user_id, role, joined_at, org_id, status')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (membersError) {
    return (
      <TeamPageShell canManageTeam={canManageTeam} search={search} activeFilter={activeFilter} filters={emptyFilters()}>
        <ErrorPanel message={membersError.message} />
      </TeamPageShell>
    );
  }

  const activeMembers = (members ?? []) as OrgMember[];
  const userIds = Array.from(new Set(activeMembers.map((member) => member.user_id)));

  const [profilesResult, availabilityResult, visitsResult, appointmentsResult, pendingInvitesResult] =
    await Promise.all([
      userIds.length
        ? supabase.from('user_profiles').select('id, full_name, phone').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from('team_member_availability').select('*').eq('org_id', orgId).in('user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from('site_visits')
            .select('assigned_user_id, status')
            .eq('org_id', orgId)
            .in('status', ['scheduled', 'in_progress'])
            .in('assigned_user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase
            .from('site_visit_appointments')
            .select('assigned_user_id, status')
            .eq('org_id', orgId)
            .eq('status', 'scheduled')
            .in('assigned_user_id', userIds)
        : Promise.resolve({ data: [], error: null }),
      canManageTeam
        ? supabase
            .from('org_invites')
            .select('*')
            .eq('org_id', orgId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

  const firstDataError =
    profilesResult.error ?? availabilityResult.error ?? visitsResult.error ?? appointmentsResult.error;
  if (firstDataError) {
    return (
      <TeamPageShell canManageTeam={canManageTeam} search={search} activeFilter={activeFilter} filters={emptyFilters()}>
        <ErrorPanel message={firstDataError.message} />
      </TeamPageShell>
    );
  }

  const profileById = new Map<string, Pick<UserProfile, 'full_name' | 'phone'>>();
  for (const profile of profilesResult.data ?? []) {
    profileById.set(profile.id, {
      full_name: profile.full_name,
      phone: profile.phone,
    });
  }

  const availabilityByUserId = new Map<string, TeamAvailability>();
  for (const availability of (availabilityResult.data ?? []) as TeamAvailability[]) {
    availabilityByUserId.set(availability.user_id, availability);
  }

  const activeAssignmentsByUserId = new Map<string, number>();
  for (const assignment of [...(visitsResult.data ?? []), ...(appointmentsResult.data ?? [])]) {
    if (!assignment.assigned_user_id) continue;
    activeAssignmentsByUserId.set(
      assignment.assigned_user_id,
      (activeAssignmentsByUserId.get(assignment.assigned_user_id) ?? 0) + 1
    );
  }

  const emailByUserId = await loadEmailMap(userIds);
  const teamMembers = activeMembers.map((member) =>
    buildTeamMemberView({
      activeAssignments: activeAssignmentsByUserId.get(member.user_id) ?? 0,
      availability: availabilityByUserId.get(member.user_id),
      emailByUserId,
      member,
      profile: profileById.get(member.user_id),
    })
  );

  const filters = buildFilters(teamMembers);
  const filteredMembers = filterTeamMembers(teamMembers, { activeFilter, search });

  return (
    <TeamPageShell
      activeFilter={activeFilter}
      canManageTeam={canManageTeam}
      filters={filters}
      search={search}
    >
      {filteredMembers.length === 0 ? (
        <EmptyState hasSearch={Boolean(search) || activeFilter !== 'all'} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredMembers.map((member) => (
            <TeamMemberCard
              canEditAvailability={canManageTeam || member.userId === user.id}
              key={member.id}
              member={member}
            />
          ))}
        </div>
      )}

      {canManageTeam ? (
        <section id="invite-member" className="mt-8 space-y-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold tracking-tight text-foreground">Invite a team member</h2>
            <p className="text-sm text-muted-foreground">
              Invitations keep using Premier&apos;s existing Supabase auth flow.
            </p>
          </div>
          <InviteMemberForm />
        </section>
      ) : null}

      {canManageTeam && pendingInvitesResult.data && pendingInvitesResult.data.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold tracking-tight text-foreground">Pending invites</h2>
          <div className="space-y-3">
            {(pendingInvitesResult.data as OrgInvite[]).map((invite) => (
              <Card key={invite.id} data-testid={`pending-invite-${invite.email}`}>
                <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-bold text-foreground">{invite.full_name}</p>
                    <p className="text-sm text-muted-foreground">{invite.email}</p>
                    <p className="text-sm capitalize text-muted-foreground">{invite.role}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyInviteLinkButton token={invite.token} />
                    <ResendInviteButton inviteId={invite.id} />
                    <RevokeInviteButton inviteId={invite.id} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </TeamPageShell>
  );
}

function TeamPageShell({
  activeFilter,
  canManageTeam,
  children,
  filters,
  search,
}: {
  activeFilter: TeamAvailabilityStatus | 'all';
  canManageTeam: boolean;
  children: React.ReactNode;
  filters: Array<{ count: number; id: TeamAvailabilityStatus | 'all'; label: string }>;
  search: string;
}) {
  return (
    <ForgePage className="max-w-6xl gap-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Team</h1>
          <p className="text-sm text-muted-foreground">
            Manage staff members, roles, and field availability.
          </p>
        </div>
        {canManageTeam ? (
          <Button asChild className="min-h-11 rounded-xl font-bold">
            <Link href="#invite-member">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Invite member
            </Link>
          </Button>
        ) : null}
      </header>

      <form action="/team" className="space-y-4">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            aria-label="Search team members"
            className="min-h-12 w-full rounded-xl border border-input bg-card py-2.5 pl-10 pr-4 text-sm font-medium text-card-foreground shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            defaultValue={search}
            name="q"
            placeholder="Search by name, role, or skill…"
            type="search"
          />
        </div>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter team members">
        {filters.map((filter) => {
          const active = filter.id === activeFilter;
          const href = buildFilterHref(filter.id, search);
          return (
            <Link
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              href={href}
              key={filter.id}
              role="tab"
            >
              {filter.label}
              <span className={cn('rounded-full px-1.5 text-[10px]', active ? 'bg-primary-foreground/20' : 'bg-muted')}>
                {filter.count}
              </span>
            </Link>
          );
        })}
      </div>

      {children}
    </ForgePage>
  );
}

function TeamMemberCard({
  canEditAvailability,
  member,
}: {
  canEditAvailability: boolean;
  member: TeamMemberView;
}) {
  return (
    <ForgeCard className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {initialsFor(member.fullName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h2 className="truncate font-bold text-card-foreground">{member.fullName}</h2>
            <AvailabilityDot status={member.availability} />
          </div>
          <p className="mt-0.5 text-xs capitalize text-muted-foreground">{roleLabel(member.role)}</p>
        </div>
      </div>

      <div className="mt-3 space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="h-3 w-3" aria-hidden="true" />
          {member.email ?? 'Email unavailable'}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" aria-hidden="true" />
          {member.phone ?? 'Phone unavailable'}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {member.skills.slice(0, 3).map((skill) => (
          <span key={skill} className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {skill}
          </span>
        ))}
        {member.skills.length > 3 ? (
          <span className="text-[10px] text-muted-foreground">+{member.skills.length - 3}</span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {member.activeAssignments} active {member.activeAssignments === 1 ? 'assignment' : 'assignments'}
        </span>
        <span className="text-xs text-muted-foreground">{member.lastActiveLabel}</span>
      </div>

      <form action={updateTeamAvailabilityFormAction} className="mt-4 flex items-center gap-2">
        <input name="userId" type="hidden" value={member.userId} />
        <select
          aria-label={`Availability for ${member.fullName}`}
          className="min-h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs font-semibold text-foreground disabled:opacity-60"
          defaultValue={member.manualAvailability}
          disabled={!canEditAvailability}
          name="availabilityStatus"
        >
          {TEAM_AVAILABILITY_STATUSES.map((status) => (
            <option key={status} value={status}>
              {formatTeamAvailabilityLabel(status)}
            </option>
          ))}
        </select>
        <Button className="h-9 rounded-md px-3 text-xs" disabled={!canEditAvailability} type="submit">
          Save
        </Button>
      </form>
    </ForgeCard>
  );
}

function AvailabilityDot({ status }: { status: TeamAvailabilityStatus }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-muted-foreground">
      <span className={cn('h-2 w-2 rounded-full', availabilityDotColors[status])} />
      <span className="sr-only">{formatTeamAvailabilityLabel(status)}</span>
    </span>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="grid min-h-[40vh] place-items-center px-4 text-center">
      <div>
        {hasSearch ? <SearchX className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" /> : null}
        <h2 className="mt-3 text-lg font-bold text-foreground">
          {hasSearch ? 'No team members found' : 'No team members yet'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasSearch ? 'Try adjusting your search or filters.' : 'Invite staff to join your workspace.'}
        </p>
      </div>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <ForgeCard>
      <p className="text-sm text-red-600">{message}</p>
    </ForgeCard>
  );
}

function buildTeamMemberView(args: {
  activeAssignments: number;
  availability: TeamAvailability | undefined;
  emailByUserId: Map<string, string>;
  member: OrgMember;
  profile: Pick<UserProfile, 'full_name' | 'phone'> | undefined;
}): TeamMemberView {
  const manualAvailability = args.availability?.availability_status ?? 'available';
  const skills = args.availability?.skills?.length
    ? args.availability.skills
    : defaultSkillsByRole[args.member.role];

  return {
    activeAssignments: args.activeAssignments,
    availability: resolveDisplayedTeamAvailability({
      activeAssignmentCount: args.activeAssignments,
      manualStatus: manualAvailability,
    }),
    email: args.emailByUserId.get(args.member.user_id) ?? null,
    fullName: args.profile?.full_name?.trim() || 'Unnamed user',
    id: args.member.id,
    joinedLabel: formatDate(args.member.joined_at),
    lastActiveLabel: formatLastActive(args.availability?.last_seen_at, args.member.joined_at),
    manualAvailability,
    phone: args.profile?.phone ?? null,
    role: args.member.role,
    skills,
    userId: args.member.user_id,
  };
}

function buildFilters(teamMembers: TeamMemberView[]) {
  return [
    { id: 'all' as const, label: 'All', count: teamMembers.length },
    ...TEAM_AVAILABILITY_STATUSES.map((status) => ({
      id: status,
      label: formatTeamAvailabilityLabel(status),
      count: teamMembers.filter((member) => member.availability === status).length,
    })),
  ];
}

function emptyFilters() {
  return [
    { id: 'all' as const, label: 'All', count: 0 },
    ...TEAM_AVAILABILITY_STATUSES.map((status) => ({
      id: status,
      label: formatTeamAvailabilityLabel(status),
      count: 0,
    })),
  ];
}

function filterTeamMembers(
  teamMembers: TeamMemberView[],
  args: { activeFilter: TeamAvailabilityStatus | 'all'; search: string }
) {
  const normalizedSearch = args.search.trim().toLowerCase();
  return teamMembers.filter((member) => {
    const matchesFilter = args.activeFilter === 'all' || member.availability === args.activeFilter;
    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;

    return [
      member.fullName,
      roleLabel(member.role),
      member.email ?? '',
      member.phone ?? '',
      ...member.skills,
    ]
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearch);
  });
}

function readStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 120);
}

function readAvailabilityFilter(value: string | string[] | undefined): TeamAvailabilityStatus | 'all' {
  if (typeof value !== 'string' || value === 'all') return 'all';
  return TEAM_AVAILABILITY_STATUSES.includes(value as TeamAvailabilityStatus)
    ? (value as TeamAvailabilityStatus)
    : 'all';
}

function buildFilterHref(filter: TeamAvailabilityStatus | 'all', search: string): string {
  const params = new URLSearchParams();
  if (search) params.set('q', search);
  if (filter !== 'all') params.set('filter', filter);
  const query = params.toString();
  return query ? `/team?${query}` : '/team';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatLastActive(lastSeenAt: string | null | undefined, fallbackDate: string): string {
  if (!lastSeenAt) return `Joined ${formatDate(fallbackDate)}`;
  const elapsedMs = Date.now() - new Date(lastSeenAt).getTime();
  const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60000));
  if (elapsedMinutes < 1) return 'Now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  return `${Math.floor(elapsedHours / 24)}d ago`;
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function roleLabel(role: OrgMember['role']): string {
  return role.replaceAll('_', ' ');
}

async function loadEmailMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  try {
    const serviceClient = createServiceClient();
    const requestedUserIds = new Set(userIds);
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (error) {
      return new Map<string, string>();
    }

    const emailByUserId = new Map<string, string>();

    for (const authUser of data.users) {
      if (requestedUserIds.has(authUser.id) && authUser.email) {
        emailByUserId.set(authUser.id, authUser.email);
      }
    }

    return emailByUserId;
  } catch {
    return new Map<string, string>();
  }
}
