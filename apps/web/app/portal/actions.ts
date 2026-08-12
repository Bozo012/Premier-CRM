'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { sendCustomerMessage, startCustomerThread } from '@premier/db';
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import { parseContactRecordKey } from './_lib/portal-contact-view-model';
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

// ---------------------------------------------------------------------------
// Customer / Staff Threaded Messaging — replaces the old one-shot
// submitPortalContactAction (activity_log('portal_contact_requested'),
// no thread identity, no staff-reply model, no staff-facing surface at
// all) with real start/reply actions. Identity (customer_id/org_id) is
// derived server-side inside the RPCs from auth.uid() via
// customer_accounts — never trusted from the client — so these actions
// only need the user's own session client, no manual lookup here.
// ---------------------------------------------------------------------------

export type StartConversationActionState = Result<{ threadId: string }>;

export async function startConversationAction(
  _previousState: StartConversationActionState | null,
  formData: FormData
): Promise<StartConversationActionState> {
  const subject = readRequiredString(formData, 'subject');
  const message = readRequiredString(formData, 'message');
  const categoryId = readOptionalString(formData, 'categoryId');
  const relatedRecordKey = readOptionalString(formData, 'relatedRecordKey');

  if (!subject) return err(ErrorCode.VALIDATION_ERROR, 'Add a short subject.');
  if (!message) return err(ErrorCode.VALIDATION_ERROR, 'Write your message.');

  const parsedRecord = relatedRecordKey ? parseContactRecordKey(relatedRecordKey) : null;
  if (relatedRecordKey && !parsedRecord) {
    return err(ErrorCode.VALIDATION_ERROR, 'Choose a valid related record.');
  }

  const supabase = await getServerSupabase();
  const result = await startCustomerThread(supabase, {
    subject,
    body: message,
    category: categoryId,
    relatedRequestId: parsedRecord?.type === 'request' ? parsedRecord.id : null,
    relatedPropertyId: parsedRecord?.type === 'property' ? parsedRecord.id : null,
  });
  if (!result.success) return result;

  revalidatePath('/portal/messages');
  revalidatePath('/portal/dashboard');
  return ok({ threadId: result.data.id });
}

export type SendCustomerMessageActionState = Result<null>;

export async function sendCustomerMessageAction(
  _previousState: SendCustomerMessageActionState | null,
  formData: FormData
): Promise<SendCustomerMessageActionState> {
  const threadId = readRequiredString(formData, 'threadId');
  const body = readRequiredString(formData, 'body');
  if (!threadId) return err(ErrorCode.VALIDATION_ERROR, 'Missing conversation.');
  if (!body) return err(ErrorCode.VALIDATION_ERROR, 'Write a message.');

  const supabase = await getServerSupabase();
  const result = await sendCustomerMessage(supabase, threadId, body);
  if (!result.success) return result;

  revalidatePath(`/portal/messages/${threadId}`);
  return ok(null);
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

