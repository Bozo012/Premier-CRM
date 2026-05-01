'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  TeamMemberApprovalSchema,
  err,
  ok,
  type Result,
  type TeamMemberApprovalStatus,
} from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

export type UpdateTeamMemberActionState = Result<{
  memberId: string;
  status: TeamMemberApprovalStatus;
}>;

export async function updateTeamMemberStatusAction(
  _previousState: UpdateTeamMemberActionState | null,
  formData: FormData
): Promise<UpdateTeamMemberActionState> {
  const parsed = TeamMemberApprovalSchema.safeParse({
    memberId: formData.get('memberId'),
    role: formData.get('role') || undefined,
    status: formData.get('status'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid approval request.'
    );
  }

  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to manage team access.');
  }

  const { data: actingMembership, error: actingMembershipError } = await supabase
    .from('org_members')
    .select('org_id, role, status')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (actingMembershipError) {
    return err(ErrorCode.DB_ERROR, actingMembershipError.message);
  }

  if (!actingMembership || actingMembership.status !== 'active') {
    return err(
      ErrorCode.FORBIDDEN,
      'Your membership is not active, so you cannot approve team members.'
    );
  }

  if (actingMembership.role !== 'owner' && actingMembership.role !== 'admin') {
    return err(
      ErrorCode.FORBIDDEN,
      'Only owners and admins can approve team members.'
    );
  }

  const { data: targetMember, error: targetMemberError } = await supabase
    .from('org_members')
    .select('id, org_id, role, status, user_id')
    .eq('id', parsed.data.memberId)
    .limit(1)
    .maybeSingle();

  if (targetMemberError) {
    return err(ErrorCode.DB_ERROR, targetMemberError.message);
  }

  if (!targetMember) {
    return err(ErrorCode.NOT_FOUND, 'That team member could not be found.');
  }

  if (targetMember.org_id !== actingMembership.org_id) {
    return err(
      ErrorCode.FORBIDDEN,
      'You can only manage team members in your own organization.'
    );
  }

  if (targetMember.user_id === user.id) {
    return err(
      ErrorCode.FORBIDDEN,
      'You cannot change your own membership from this screen.'
    );
  }

  if (targetMember.role === 'owner') {
    return err(
      ErrorCode.FORBIDDEN,
      'Owner memberships cannot be changed from this screen.'
    );
  }

  if (targetMember.status !== 'pending') {
    return err(
      ErrorCode.FORBIDDEN,
      'Only pending team members can be approved or rejected here.'
    );
  }

  const updates =
    parsed.data.status === 'active'
      ? { role: parsed.data.role, status: parsed.data.status }
      : { status: parsed.data.status };

  const { error: updateError } = await supabase
    .from('org_members')
    .update(updates)
    .eq('id', targetMember.id)
    .eq('org_id', actingMembership.org_id);

  if (updateError) {
    return err(ErrorCode.DB_ERROR, updateError.message);
  }

  revalidatePath('/team');
  revalidatePath('/today');

  return ok({
    memberId: targetMember.id,
    status: parsed.data.status,
  });
}
