import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { createServiceClient, getActiveOrgContext, type Database, type OrgInvite, type TeamAvailabilityStatus } from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { Card, CardContent } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { buildTeamMemberView, toTeamListViewModel, type TeamMemberView } from './_lib/forge-team-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { TeamShell } from './_components/team-shell';
import { TeamListContainer } from './_components/team-list-container';
import { CopyInviteLinkButton } from './_components/copy-invite-link-button';
import { InviteMemberForm } from './_components/invite-member-form';
import { ResendInviteButton } from './_components/resend-invite-button';
import { RevokeInviteButton } from './_components/revoke-invite-button';

export const metadata: Metadata = { title: 'Team' };

type OrgMember = Database['public']['Tables']['org_members']['Row'];
type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
type TeamAvailability = Database['public']['Tables']['team_member_availability']['Row'];

interface TeamPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const AVAILABILITY_FILTER_VALUES = ['all', 'available', 'on_job', 'off_shift', 'on_leave'] as const;

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
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const { orgId, role } = orgContextResult.data;
  const canManageTeam = role === 'owner' || role === 'admin';

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  // Real query/join logic, extracted unchanged from the pre-existing
  // (legacy)/team/page.tsx (org_members + user_profiles +
  // team_member_availability + site_visits + site_visit_appointments +
  // org_invites, plus an admin.listUsers()-backed email map).
  const { data: members, error: membersError } = await supabase
    .from('org_members')
    .select('id, user_id, role, joined_at, org_id, status')
    .eq('org_id', orgId)
    .eq('status', 'active')
    .order('joined_at', { ascending: false });

  if (membersError) {
    return (
      <TeamShell shellData={shellData} mobileNav={mobileNav}>
        <TeamListContainer model={toTeamListViewModel({ members: [], searchQuery: search, activeFilter, error: { title: 'Team could not be loaded', message: membersError.message } })} />
      </TeamShell>
    );
  }

  const activeMembers = (members ?? []) as OrgMember[];
  const userIds = Array.from(new Set(activeMembers.map((member) => member.user_id)));

  const [profilesResult, availabilityResult, visitsResult, appointmentsResult, pendingInvitesResult] = await Promise.all([
    userIds.length ? supabase.from('user_profiles').select('id, full_name, phone').in('id', userIds) : Promise.resolve({ data: [], error: null }),
    userIds.length ? supabase.from('team_member_availability').select('*').eq('org_id', orgId).in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase.from('site_visits').select('assigned_user_id, status').eq('org_id', orgId).in('status', ['scheduled', 'in_progress']).in('assigned_user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    userIds.length
      ? supabase.from('site_visit_appointments').select('assigned_user_id, status').eq('org_id', orgId).eq('status', 'scheduled').in('assigned_user_id', userIds)
      : Promise.resolve({ data: [], error: null }),
    canManageTeam
      ? supabase.from('org_invites').select('*').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstDataError = profilesResult.error ?? availabilityResult.error ?? visitsResult.error ?? appointmentsResult.error;
  if (firstDataError) {
    return (
      <TeamShell shellData={shellData} mobileNav={mobileNav}>
        <TeamListContainer model={toTeamListViewModel({ members: [], searchQuery: search, activeFilter, error: { title: 'Team could not be loaded', message: firstDataError.message } })} />
      </TeamShell>
    );
  }

  const profileById = new Map<string, Pick<UserProfile, 'full_name' | 'phone'>>();
  for (const p of profilesResult.data ?? []) {
    profileById.set(p.id, { full_name: p.full_name, phone: p.phone });
  }

  const availabilityByUserId = new Map<string, TeamAvailability>();
  for (const availability of (availabilityResult.data ?? []) as TeamAvailability[]) {
    availabilityByUserId.set(availability.user_id, availability);
  }

  const activeAssignmentsByUserId = new Map<string, number>();
  for (const assignment of [...(visitsResult.data ?? []), ...(appointmentsResult.data ?? [])]) {
    if (!assignment.assigned_user_id) continue;
    activeAssignmentsByUserId.set(assignment.assigned_user_id, (activeAssignmentsByUserId.get(assignment.assigned_user_id) ?? 0) + 1);
  }

  const emailByUserId = await loadEmailMap(userIds);
  const teamMembers: TeamMemberView[] = activeMembers.map((member) =>
    buildTeamMemberView({
      activeAssignments: activeAssignmentsByUserId.get(member.user_id) ?? 0,
      availability: availabilityByUserId.get(member.user_id),
      email: emailByUserId.get(member.user_id) ?? null,
      member,
      profile: profileById.get(member.user_id),
    })
  );

  const model = toTeamListViewModel({ members: teamMembers, searchQuery: search, activeFilter });

  return (
    <TeamShell shellData={shellData} mobileNav={mobileNav}>
      <TeamListContainer model={model} />

      {canManageTeam ? (
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <section id="invite-member" className="mt-2 space-y-4 border-t border-border pt-8">
            <div className="space-y-1">
              <h2 className="text-lg font-bold tracking-tight text-foreground">Invite a team member</h2>
              <p className="text-sm text-muted-foreground">Invitations keep using Premier&apos;s existing Supabase auth flow.</p>
            </div>
            <InviteMemberForm />
          </section>

          {pendingInvitesResult.data && pendingInvitesResult.data.length > 0 ? (
            <section className="mt-8 space-y-3 pb-8">
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
        </div>
      ) : null}
    </TeamShell>
  );
}

function readStringParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, 120);
}

function readAvailabilityFilter(value: string | string[] | undefined): TeamAvailabilityStatus | 'all' {
  const raw = Array.isArray(value) ? value[0] : value;
  return (AVAILABILITY_FILTER_VALUES as readonly string[]).includes(raw ?? '') ? (raw as TeamAvailabilityStatus | 'all') : 'all';
}

async function loadEmailMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map<string, string>();

  try {
    const serviceClient = createServiceClient();
    const requestedUserIds = new Set(userIds);
    const { data, error } = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return new Map<string, string>();

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
