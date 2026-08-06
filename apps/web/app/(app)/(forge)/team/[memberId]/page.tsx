import { notFound, redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { createServiceClient, getActiveOrgContext, getTeamMemberById, TEAM_AVAILABILITY_STATUSES, formatTeamAvailabilityLabel } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { Button } from '@/components/ui/button';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from '../_lib/forge-shell-context';
import { toTeamMemberDetailModel, type AssignedSiteVisitRow, type UpcomingAppointmentRow } from '../_lib/forge-team-detail-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { TeamShell } from '../_components/team-shell';
import { TeamMemberDetailContainer } from '../_components/team-member-detail-container';
import { updateTeamAvailabilityFormAction } from '../actions';

interface TeamMemberDetailPageProps {
  params: Promise<{ memberId: string }>;
}

export default async function TeamMemberDetailPage({ params }: TeamMemberDetailPageProps) {
  const { memberId } = await params;

  if (!isUuid(memberId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/team/${memberId}`)}`);
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

  // Org-scoped by design (getTeamMemberById filters org_id = orgId) — a
  // member id belonging to a different org resolves to NOT_FOUND, not a
  // data leak, exactly like getCustomer360/getPropertyMemory elsewhere.
  const result = await getTeamMemberById(supabase, { orgId, memberId });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const shellData = buildForgeShellData({
      orgContext: orgContextResult.data,
      userId: user.id,
      displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
      email: user.email ?? 'No email',
    });
    return (
      <TeamShell shellData={shellData} mobileNav={buildMobileNavConfig()}>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Failed to load team member: {result.error}
          </p>
        </main>
      </TeamShell>
    );
  }

  const { member, profile: memberProfile, availability } = result.data;
  const isSelf = member.user_id === user.id;
  const canEditAvailability = canManageTeam || isSelf;

  const [{ data: authUser }, visitsResult, appointmentsResult, profile] = await Promise.all([
    getMemberEmail(member.user_id),
    supabase.from('site_visits').select('id, status, completed_at').eq('org_id', orgId).eq('assigned_user_id', member.user_id).in('status', ['scheduled', 'in_progress']),
    supabase
      .from('site_visit_appointments')
      .select('id, site_visit_id, scheduled_start, status')
      .eq('org_id', orgId)
      .eq('assigned_user_id', member.user_id)
      .eq('status', 'scheduled')
      .order('scheduled_start', { ascending: true }),
    supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
  ]);

  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });

  const model = toTeamMemberDetailModel({
    member,
    profile: memberProfile,
    availability,
    email: authUser?.user?.email ?? null,
    assignedSiteVisits: (visitsResult.data ?? []) as AssignedSiteVisitRow[],
    upcomingAppointments: (appointmentsResult.data ?? []) as UpcomingAppointmentRow[],
    canManageTeam,
    isSelf,
  });

  return (
    <TeamShell shellData={shellData} mobileNav={buildMobileNavConfig()}>
      <TeamMemberDetailContainer model={model} />

      {/* Availability editing is real (upsertTeamMemberAvailability via
          updateTeamAvailabilityFormAction) but needs a <select>, which
          doesn't fit RecordDetailView's id-only action contract — rendered
          as its own real form here, gated the same way the pre-existing
          list page gated it (owner/admin, or the member editing their own
          availability). */}
      <div className="mx-auto max-w-3xl px-4 pb-10 sm:px-6">
        <form action={updateTeamAvailabilityFormAction} className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-4">
          <input name="userId" type="hidden" value={member.user_id} />
          <label className="text-sm font-bold text-card-foreground" htmlFor="availabilityStatus">
            Update availability
          </label>
          <select
            id="availabilityStatus"
            name="availabilityStatus"
            defaultValue={availability?.availability_status ?? 'available'}
            disabled={!canEditAvailability}
            className="min-h-9 flex-1 rounded-md border border-input bg-background px-2 text-xs font-semibold text-foreground disabled:opacity-60"
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
      </div>
    </TeamShell>
  );
}

async function getMemberEmail(userId: string): Promise<{ data: { user: { email: string | null } | null } }> {
  try {
    const serviceClient = createServiceClient();
    const { data } = await serviceClient.auth.admin.getUserById(userId);
    return { data: { user: data.user ? { email: data.user.email ?? null } : null } };
  } catch {
    return { data: { user: null } };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
