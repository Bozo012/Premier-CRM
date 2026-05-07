import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createServiceClient, type Database } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

type OrgMember = Database['public']['Tables']['org_members']['Row'];
type UserProfile = Database['public']['Tables']['user_profiles']['Row'];

interface TeamMemberView {
  email: string | null;
  fullName: string;
  id: string;
  joinedLabel: string;
  phone: string | null;
  role: OrgMember['role'];
}

export default async function TeamPage() {
  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/team');
  }

  const { data: currentMembership, error: currentMembershipError } =
    await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

  if (currentMembershipError) {
    return (
      <TeamPageShell>
        <ErrorCard message={currentMembershipError.message} />
      </TeamPageShell>
    );
  }

  if (!currentMembership) {
    return (
      <TeamPageShell>
        <ErrorCard message="No organization membership was found for your account." />
      </TeamPageShell>
    );
  }

  if (!canManageTeam(currentMembership.role)) {
    return (
      <TeamPageShell>
        <Card>
          <CardHeader>
            <CardTitle>Team access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Only owners and admins can view team access.
            </p>
            <Button asChild variant="outline">
              <Link href="/today">Back to dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </TeamPageShell>
    );
  }

  const { data: members, error: membersError } = await supabase
    .from('org_members')
    .select('id, user_id, role, joined_at, org_id')
    .eq('org_id', currentMembership.org_id)
    .order('joined_at', { ascending: false });

  if (membersError) {
    return (
      <TeamPageShell>
        <ErrorCard message={membersError.message} />
      </TeamPageShell>
    );
  }

  const userIds = Array.from(new Set((members ?? []).map((member) => member.user_id)));
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase
        .from('user_profiles')
        .select('id, full_name, phone')
        .in('id', userIds)
    : { data: [], error: null };

  if (profilesError) {
    return (
      <TeamPageShell>
        <ErrorCard message={profilesError.message} />
      </TeamPageShell>
    );
  }

  const profileById = new Map<string, Pick<UserProfile, 'full_name' | 'phone'>>();
  for (const profile of profiles ?? []) {
    profileById.set(profile.id, {
      full_name: profile.full_name,
      phone: profile.phone,
    });
  }

  const emailByUserId = await loadEmailMap(userIds);
  const teamMembers = (members ?? []).map((member) =>
    buildTeamMemberView(member, profileById.get(member.user_id), emailByUserId)
  );

  return (
    <TeamPageShell>
      <section className="grid gap-3 md:grid-cols-2">
        <SummaryCard label="Team members" value={teamMembers.length} />
        <SummaryCard
          label="Admins + owners"
          value={
            teamMembers.filter(
              (member) => member.role === 'owner' || member.role === 'admin'
            ).length
          }
        />
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Current team</h2>
          <p className="text-sm text-muted-foreground">
            Accounts listed here already have access through their organization
            membership. New accounts are created manually until owner invites land.
          </p>
        </div>

        <div className="space-y-3">
          {teamMembers.map((member) => (
            <Card key={member.id}>
              <CardContent className="flex flex-col gap-1 pt-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">{member.fullName}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.email ?? 'Email unavailable'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Joined {member.joinedLabel}
                    {member.phone ? ` · ${member.phone}` : ''}
                  </p>
                </div>
                <p className="text-sm capitalize text-muted-foreground">
                  {member.role}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </TeamPageShell>
  );
}

function TeamPageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Team access
            </h1>
            <p className="text-sm text-muted-foreground">
              Review the manually-created accounts that can access the app.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/today">Back to dashboard</Link>
          </Button>
        </div>
      </header>
      {children}
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold leading-none tracking-tight sm:text-5xl">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-red-600">{message}</p>
        <Button asChild variant="outline">
          <Link href="/today">Back to dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function canManageTeam(role: OrgMember['role']): boolean {
  return role === 'owner' || role === 'admin';
}

function buildTeamMemberView(
  member: Pick<OrgMember, 'id' | 'joined_at' | 'role' | 'user_id'>,
  profile: Pick<UserProfile, 'full_name' | 'phone'> | undefined,
  emailByUserId: Map<string, string>
): TeamMemberView {
  return {
    email: emailByUserId.get(member.user_id) ?? null,
    fullName: profile?.full_name?.trim() || 'Unnamed user',
    id: member.id,
    joinedLabel: formatDate(member.joined_at),
    phone: profile?.phone ?? null,
    role: member.role,
  };
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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
