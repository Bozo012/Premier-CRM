/**
 * Team Member detail (`/team/:memberId`, where `memberId` is `org_members.id`
 * — the natural PK, same convention as `/customers/:customerId` and
 * `/properties/:propertyId`). This was a confirmed real gap in the Base44
 * route matrix (no Forge route existed at all). Composes existing
 * building blocks (`user_profiles`, `team_member_availability`, assigned
 * site visits/appointments) rather than introducing a new RPC — no
 * schema/RLS change required.
 */
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import type { DbClient } from '../client';
import type { Database } from '../types';

export type OrgMember = Database['public']['Tables']['org_members']['Row'];
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type TeamMemberAvailabilityRow = Database['public']['Tables']['team_member_availability']['Row'];

export interface TeamMemberAssignment {
  id: string;
  status: string;
  serviceRequestTitle: string;
  customerDisplayName: string;
  propertyAddress: string | null;
  scheduledStart: string | null;
}

export interface TeamMemberDetail {
  member: OrgMember;
  profile: Pick<UserProfile, 'full_name' | 'phone'> | null;
  email: string | null;
  availability: TeamMemberAvailabilityRow | null;
  activeAssignments: TeamMemberAssignment[];
}

/**
 * `email` is resolved by the caller (via `supabase.auth.admin.listUsers`,
 * same as `team/page.tsx`'s `loadEmailMap`) and passed in — this module
 * intentionally never touches `auth.admin.*` itself, keeping the
 * service-role-only admin API call at the one existing call site.
 */
export async function getTeamMemberDetail(
  client: DbClient,
  args: { orgId: string; memberId: string; email: string | null }
): Promise<Result<TeamMemberDetail>> {
  const { data: member, error: memberError } = await client
    .from('org_members')
    .select('*')
    .eq('org_id', args.orgId)
    .eq('id', args.memberId)
    .eq('status', 'active')
    .maybeSingle();

  if (memberError) return err(ErrorCode.DB_ERROR, memberError.message);
  if (!member) return err(ErrorCode.NOT_FOUND, `Team member ${args.memberId} not found`);

  const [profileResult, availabilityResult] = await Promise.all([
    client
      .from('user_profiles')
      .select('full_name, phone')
      .eq('id', member.user_id)
      .maybeSingle(),
    client
      .from('team_member_availability')
      .select('*')
      .eq('org_id', args.orgId)
      .eq('user_id', member.user_id)
      .maybeSingle(),
  ]);

  if (profileResult.error) return err(ErrorCode.DB_ERROR, profileResult.error.message);
  if (availabilityResult.error) return err(ErrorCode.DB_ERROR, availabilityResult.error.message);

  const assignmentsResult = await loadActiveAssignments(client, {
    orgId: args.orgId,
    userId: member.user_id,
  });
  if (!assignmentsResult.success) return assignmentsResult;

  return ok({
    member: member as OrgMember,
    profile: profileResult.data ?? null,
    email: args.email,
    availability: (availabilityResult.data as TeamMemberAvailabilityRow | null) ?? null,
    activeAssignments: assignmentsResult.data,
  });
}

interface SiteVisitAssignmentRow {
  id: string;
  status: string;
  service_requests:
    | { service_title: string; customers: { display_name: string | null; first_name: string | null; last_name: string | null; company_name: string | null } | Array<{ display_name: string | null; first_name: string | null; last_name: string | null; company_name: string | null }> | null; properties: { address_line_1: string; city: string; state: string } | Array<{ address_line_1: string; city: string; state: string }> | null }
    | Array<{ service_title: string; customers: unknown; properties: unknown }>
    | null;
}

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function customerLabel(customer: {
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
} | null): string {
  if (!customer) return 'Unknown customer';
  if (customer.company_name?.trim()) return customer.company_name.trim();
  if (customer.display_name?.trim()) return customer.display_name.trim();
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim() || 'Unknown customer';
}

async function loadActiveAssignments(
  client: DbClient,
  args: { orgId: string; userId: string }
): Promise<Result<TeamMemberAssignment[]>> {
  const { data: visits, error: visitsError } = await client
    .from('site_visits')
    .select(
      `
      id,
      status,
      service_requests (
        service_title,
        customers ( display_name, first_name, last_name, company_name ),
        properties ( address_line_1, city, state )
      )
    `
    )
    .eq('org_id', args.orgId)
    .eq('assigned_user_id', args.userId)
    .in('status', ['scheduled', 'in_progress'])
    .order('created_at', { ascending: false });

  if (visitsError) return err(ErrorCode.DB_ERROR, visitsError.message);

  const { data: appointments, error: appointmentsError } = await client
    .from('site_visit_appointments')
    .select('id, status, scheduled_start, site_visit_id')
    .eq('org_id', args.orgId)
    .eq('assigned_user_id', args.userId)
    .eq('status', 'scheduled');

  if (appointmentsError) return err(ErrorCode.DB_ERROR, appointmentsError.message);

  const scheduledStartByVisitId = new Map(
    (appointments ?? []).map((appointment) => [appointment.site_visit_id, appointment.scheduled_start])
  );

  const assignments = ((visits ?? []) as unknown as SiteVisitAssignmentRow[]).map((visit): TeamMemberAssignment => {
    const request = firstOrNull(visit.service_requests) as
      | { service_title: string; customers: unknown; properties: unknown }
      | null;
    const customer = firstOrNull(request?.customers as never) as {
      display_name: string | null;
      first_name: string | null;
      last_name: string | null;
      company_name: string | null;
    } | null;
    const property = firstOrNull(request?.properties as never) as {
      address_line_1: string;
      city: string;
      state: string;
    } | null;

    return {
      id: visit.id,
      status: visit.status,
      serviceRequestTitle: request?.service_title ?? 'Site visit',
      customerDisplayName: customerLabel(customer),
      propertyAddress: property ? `${property.address_line_1}, ${property.city}, ${property.state}` : null,
      scheduledStart: scheduledStartByVisitId.get(visit.id) ?? null,
    };
  });

  return ok(assignments);
}
