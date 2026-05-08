'use server';

import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceClient } from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

const PREMIER_ORG_ID =
  process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';

function readRequiredString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitName(name: string): { firstName: string | null; lastName: string | null } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1] ?? null,
  };
}

function redirectWithMessage(message: string): never {
  redirect(`/portal/login?message=${encodeURIComponent(message)}`);
}

async function ensureCustomerAccount(args: {
  authUserId: string;
  email: string;
  fullName: string;
}): Promise<void> {
  const serviceClient = createServiceClient() as unknown as SupabaseClient;
  const { authUserId, email, fullName } = args;

  const { data: existingCustomer, error: lookupError } = await serviceClient
    .from('customers')
    .select('id')
    .eq('org_id', PREMIER_ORG_ID)
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error('Customer portal lookup failed', lookupError);
    redirectWithMessage('We could not link your account yet. Please try again.');
  }

  let customerId =
    existingCustomer && typeof existingCustomer === 'object' && 'id' in existingCustomer
      ? existingCustomer.id
      : null;

  if (typeof customerId !== 'string') {
    const { firstName, lastName } = splitName(fullName);
    const { data: createdCustomer, error: createError } = await serviceClient
      .from('customers')
      .insert({
        org_id: PREMIER_ORG_ID,
        type: 'residential',
        first_name: firstName,
        last_name: lastName,
        email,
        preferred_channel: 'portal',
        source: 'customer_portal',
        tags: ['customer_portal'],
      })
      .select('id')
      .single();

    customerId =
      createdCustomer && typeof createdCustomer === 'object' && 'id' in createdCustomer
        ? createdCustomer.id
        : null;

    if (createError || typeof customerId !== 'string') {
      console.error('Customer portal customer creation failed', createError);
      redirectWithMessage('We could not create your customer profile yet. Please try again.');
    }
  }

  const { error: accountError } = await serviceClient
    .from('customer_accounts')
    .upsert(
      {
        org_id: PREMIER_ORG_ID,
        customer_id: customerId,
        auth_user_id: authUserId,
        email,
        status: 'active',
        invited_at: new Date().toISOString(),
        accepted_at: new Date().toISOString(),
      },
      { onConflict: 'auth_user_id' }
    );

  if (accountError) {
    console.error('Customer portal account link failed', accountError);
    redirectWithMessage('We could not finish linking your portal account. Please try again.');
  }
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
    },
  });

  if (error || !data.user) {
    redirectWithMessage('Could not create that portal account. Try signing in instead.');
  }

  await ensureCustomerAccount({
    authUserId: data.user.id,
    email,
    fullName,
  });

  redirect('/portal/dashboard');
}

export async function signOutCustomerPortal(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect('/portal/login');
}
