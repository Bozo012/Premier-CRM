'use server';

import { redirect } from 'next/navigation';

import { AcceptTeamMemberInviteSchema } from '@premier/shared';
import { acceptOrgInvite, createServiceClient, getInviteByToken } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectWithMessage(token: string, message: string): never {
  redirect(`/invite/${token}?message=${encodeURIComponent(message)}`);
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = readRequiredString(formData, 'token');
  const fullName = readRequiredString(formData, 'fullName');
  const password = readRequiredString(formData, 'password');

  if (!token) {
    redirect('/login');
  }

  const parsed = AcceptTeamMemberInviteSchema.safeParse({ token, fullName, password });
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    redirectWithMessage(token, firstIssue?.message ?? 'Enter your name and a password.');
  }

  const serviceClient = createServiceClient();

  const inviteResult = await getInviteByToken(serviceClient, { token });
  if (!inviteResult.success) {
    redirectWithMessage(token, 'This invite could not be found.');
  }
  const invite = inviteResult.data;

  if (invite.status !== 'pending') {
    redirectWithMessage(token, 'This invite has already been used or is no longer valid.');
  }
  if (new Date(invite.expires_at) < new Date()) {
    redirectWithMessage(token, 'This invite has expired. Ask an owner or admin to send a new one.');
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email: invite.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        account_type: 'staff',
      },
    },
  });

  if (error || !data.user) {
    redirectWithMessage(
      token,
      error?.message ?? 'Could not create your account. Please try again.'
    );
  }

  const acceptResult = await acceptOrgInvite(serviceClient, {
    token,
    userId: data.user.id,
    fullName: parsed.data.fullName,
  });

  if (!acceptResult.success) {
    redirectWithMessage(
      token,
      `Your account was created, but we couldn't finish joining the team: ${acceptResult.error}. Contact an owner or admin.`
    );
  }

  redirect('/today');
}
