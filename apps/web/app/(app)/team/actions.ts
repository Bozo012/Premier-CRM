'use server';

import { revalidatePath } from 'next/cache';

import {
  ErrorCode,
  TeamMemberApprovalSchema,
  TeamMemberInviteSchema,
  err,
  ok,
  type Result,
  type TeamMemberApprovalStatus,
  type TeamMemberApprovalRole,
} from '@premier/shared';
import { createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type UpdateTeamMemberActionState = Result<{
  memberId: string;
  status: TeamMemberApprovalStatus;
}>;

export type InviteTeamMemberActionState = Result<{
  email: string;
  message: string;
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

export async function inviteTeamMemberAction(
  _previousState: InviteTeamMemberActionState | null,
  formData: FormData
): Promise<InviteTeamMemberActionState> {
  const parsed = TeamMemberInviteSchema.safeParse({
    email: formData.get('email'),
    fullName: formData.get('fullName'),
    role: formData.get('role'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid invite request.'
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to invite team members.');
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
      'Your membership is not active, so you cannot invite team members.'
    );
  }

  if (actingMembership.role !== 'owner' && actingMembership.role !== 'admin') {
    return err(
      ErrorCode.FORBIDDEN,
      'Only owners and admins can invite team members.'
    );
  }

  if ((user.email ?? '').toLowerCase() === normalizedEmail) {
    return err(
      ErrorCode.FORBIDDEN,
      'Use Forgot password for your own account instead of sending yourself an invite.'
    );
  }

  const serviceClient = createServiceClient();
  const redirectTo = getPasswordSetupRedirectUrl();
  const authUser = await findAuthUserByEmail(serviceClient, normalizedEmail);

  if (authUser) {
    const membershipResult = await provisionMembershipForInvitedUser({
      serviceClient,
      orgId: actingMembership.org_id,
      role: parsed.data.role,
      userId: authUser.id,
    });

    if (!membershipResult.success) {
      return membershipResult;
    }

    const { error: profileError } = await serviceClient.from('user_profiles').upsert(
      {
        id: authUser.id,
        full_name: parsed.data.fullName,
      },
      { onConflict: 'id' }
    );

    if (profileError) {
      return err(ErrorCode.DB_ERROR, profileError.message);
    }

    const { error: resetError } = await serviceClient.auth.resetPasswordForEmail(
      normalizedEmail,
      {
        redirectTo,
      }
    );

    if (resetError) {
      return err(ErrorCode.DB_ERROR, resetError.message);
    }

    revalidatePath('/team');
    revalidatePath('/today');

    return ok({
      email: normalizedEmail,
      message:
        membershipResult.data.previousStatus === 'active'
          ? 'Member already had access. Sent a password setup/reset email.'
          : 'Activated the membership and sent a password setup email.',
    });
  }

  const { data: inviteData, error: inviteError } =
    await serviceClient.auth.admin.inviteUserByEmail(normalizedEmail, {
      data: {
        full_name: parsed.data.fullName,
      },
      redirectTo,
    });

  if (inviteError) {
    return err(ErrorCode.DB_ERROR, inviteError.message);
  }

  const invitedUserId = inviteData.user?.id;

  if (!invitedUserId) {
    return err(
      ErrorCode.UNKNOWN,
      'Supabase returned no invited user id for this invite request.'
    );
  }

  const membershipResult = await provisionMembershipForInvitedUser({
    serviceClient,
    orgId: actingMembership.org_id,
    role: parsed.data.role,
    userId: invitedUserId,
  });

  if (!membershipResult.success) {
    return membershipResult;
  }

  revalidatePath('/team');
  revalidatePath('/today');

  return ok({
    email: normalizedEmail,
    message: 'Invite sent. The user can set their password from the email link.',
  });
}

async function provisionMembershipForInvitedUser(args: {
  orgId: string;
  role: TeamMemberApprovalRole;
  serviceClient: ReturnType<typeof createServiceClient>;
  userId: string;
}): Promise<
  Result<{
    memberId: string;
    previousStatus: string | null;
  }>
> {
  const { data: existingMember, error: existingMemberError } = await args.serviceClient
    .from('org_members')
    .select('id, status')
    .eq('org_id', args.orgId)
    .eq('user_id', args.userId)
    .limit(1)
    .maybeSingle();

  if (existingMemberError) {
    return err(ErrorCode.DB_ERROR, existingMemberError.message);
  }

  if (existingMember) {
    const { error: updateError } = await args.serviceClient
      .from('org_members')
      .update({
        role: args.role,
        status: 'active',
      })
      .eq('id', existingMember.id);

    if (updateError) {
      return err(ErrorCode.DB_ERROR, updateError.message);
    }

    return ok({
      memberId: existingMember.id,
      previousStatus: existingMember.status,
    });
  }

  const { data: insertedMember, error: insertError } = await args.serviceClient
    .from('org_members')
    .insert({
      org_id: args.orgId,
      role: args.role,
      status: 'active',
      user_id: args.userId,
    })
    .select('id')
    .limit(1)
    .single();

  if (insertError) {
    return err(ErrorCode.DB_ERROR, insertError.message);
  }

  return ok({
    memberId: insertedMember.id,
    previousStatus: null,
  });
}

async function findAuthUserByEmail(
  serviceClient: ReturnType<typeof createServiceClient>,
  email: string
) {
  const { data, error } = await serviceClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    return null;
  }

  return (
    data.users.find((authUser) => authUser.email?.toLowerCase() === email) ??
    null
  );
}

function getPasswordSetupRedirectUrl(): string {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000';

  return `${appUrl.replace(/\/$/, '')}/update-password`;
}
