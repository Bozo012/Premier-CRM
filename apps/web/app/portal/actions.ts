'use server';

import { redirect } from 'next/navigation';

import { getAppUrl } from '@/lib/email';
import { ensureCustomerAccount } from '@/lib/customer-portal-account';
import { buildMarketingPortalUrl } from '@/lib/customer-portal-handoff';
import { getServerSupabase } from '@/lib/supabase-server';

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function redirectWithMessage(message: string): never {
  redirect(`/portal/login?message=${encodeURIComponent(message)}`);
}

export async function signInCustomerPortal(formData: FormData): Promise<void> {
  const email = readRequiredString(formData, 'email')?.toLowerCase();
  const password = readRequiredString(formData, 'password');

  if (!email || !password) {
    redirectWithMessage('Enter your email and password to sign in.');
  }

  const supabase = await getServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirectWithMessage('Could not sign in with those portal credentials.');
  }

  redirect('/portal/dashboard');
}

export async function createCustomerPortalAccount(formData: FormData): Promise<void> {
  const fullName = readRequiredString(formData, 'fullName');
  const email = readRequiredString(formData, 'email')?.toLowerCase();
  const password = readRequiredString(formData, 'password');

  if (!fullName || !email || !password) {
    redirectWithMessage('Enter your name, email, and password to create an account.');
  }

  if (password.length < 8) {
    redirectWithMessage('Use at least 8 characters for your portal password.');
  }

  const supabase = await getServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        account_type: 'customer',
      },
      emailRedirectTo: new URL('/portal/confirm', getAppUrl()).toString(),
    },
  });

  if (error || !data.user) {
    redirectWithMessage('Could not create that portal account. Try signing in instead.');
  }

  const accountResult = await ensureCustomerAccount({
    authUserId: data.user.id,
    email,
    fullName,
  });
  if (!accountResult.success) {
    redirectWithMessage('We could not finish linking your portal account. Please try again.');
  }

  if (!data.session) {
    redirectWithMessage(
      'Account created. Check your email to confirm it, then sign in.'
    );
  }

  redirect('/portal/dashboard');
}

export async function signOutCustomerPortal(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect(buildMarketingPortalUrl('signed-out'));
}
