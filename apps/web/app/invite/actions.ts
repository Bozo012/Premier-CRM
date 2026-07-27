'use server';

import { redirect } from 'next/navigation';

import { AcceptTeamMemberInviteSchema } from '@premier/shared';
import { createServiceClient, getInviteByToken } from '@premier/db';

import { getAppUrl } from '@/lib/email';
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
      // Carried through Supabase's confirmation email as the `next` param
      // (see the "Confirm signup" email template and apps/web/app/auth/confirm/route.ts)
      // so the invite token survives the confirmation round-trip. Actually
      // joining the org (accept_org_invite) happens at this continue route,
      // once a real confirmed session exists — not here, immediately after
      // signUp() — since email confirmation is required on this project and
      // signUp() returns no usable session until it's completed.
      emailRedirectTo: `${getAppUrl()}/invite/${token}/continue`,
    },
  });

  if (error || !data.user) {
    redirectWithMessage(
      token,
      error?.message ?? 'Could not create your account. Please try again.'
    );
  }

  redirect(`/invite/${token}?pending=1`);
}
