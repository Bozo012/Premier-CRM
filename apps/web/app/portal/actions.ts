'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { createServiceClient } from '@premier/db';
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import {
  PORTAL_CONTACT_CATEGORIES,
  PORTAL_CONTACT_REPLY_METHODS,
  parseContactRecordKey,
} from './_lib/portal-contact-view-model';
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

export type SubmitPortalContactActionState = Result<{
  referenceNumber: string;
  categoryLabel: string;
  replyMethodLabel: string;
}>;

interface ActivePortalCustomer {
  customerId: string;
  email: string;
  orgId: string;
  userId: string;
}

async function resolveActivePortalCustomer(): Promise<Result<ActivePortalCustomer>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return err(ErrorCode.FORBIDDEN, 'You must be signed in to the portal.');

  const serviceClient = createServiceClient();
  const { data: account, error } = await serviceClient
    .from('customer_accounts')
    .select('customer_id, email, org_id, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  if (!account || account.status !== 'active') {
    return err(ErrorCode.FORBIDDEN, 'No active portal account link found.');
  }

  return ok({
    customerId: account.customer_id,
    email: account.email,
    orgId: account.org_id,
    userId: user.id,
  });
}

export async function submitPortalContactAction(
  _previousState: SubmitPortalContactActionState | null,
  formData: FormData
): Promise<SubmitPortalContactActionState> {
  const identity = await resolveActivePortalCustomer();
  if (!identity.success) return identity;

  const categoryId = readRequiredString(formData, 'categoryId');
  const relatedRecordKey = readOptionalString(formData, 'relatedRecordKey');
  const subject = readRequiredString(formData, 'subject');
  const message = readRequiredString(formData, 'message');
  const replyMethodId = readRequiredString(formData, 'replyMethodId');

  const category = PORTAL_CONTACT_CATEGORIES.find((item) => item.id === categoryId);
  const replyMethod = PORTAL_CONTACT_REPLY_METHODS.find((item) => item.id === replyMethodId);

  if (!category) return err(ErrorCode.VALIDATION_ERROR, 'Choose what your message is about.');
  if (!replyMethod) return err(ErrorCode.VALIDATION_ERROR, 'Choose how you would like us to reply.');
  if (!subject) return err(ErrorCode.VALIDATION_ERROR, 'Add a short subject.');
  if (!message) return err(ErrorCode.VALIDATION_ERROR, 'Write your message.');
  if (subject.length > 120) return err(ErrorCode.VALIDATION_ERROR, 'Keep the subject under 120 characters.');
  if (message.length > 2_000) return err(ErrorCode.VALIDATION_ERROR, 'Keep the message under 2,000 characters.');
  if (category.requiresRecord && !relatedRecordKey) {
    return err(ErrorCode.VALIDATION_ERROR, 'Select the record your question is about.');
  }

  const serviceClient = createServiceClient();
  const related = relatedRecordKey
    ? await resolvePortalContactRelatedRecord(serviceClient, {
        customerId: identity.data.customerId,
        orgId: identity.data.orgId,
        relatedRecordKey,
      })
    : ok(null);

  if (!related.success) return related;
  if (related.data && !category.recordTypes.includes(related.data.type)) {
    return err(ErrorCode.VALIDATION_ERROR, 'That record does not match the selected topic.');
  }

  const referenceNumber = makePortalContactReference();
  const entityType = related.data?.entityType ?? 'customer';
  const entityId = related.data?.entityId ?? identity.data.customerId;
  const activityMessage = [
    `Portal contact ${referenceNumber}`,
    `Category: ${category.label}`,
    `Subject: ${subject}`,
    `Reply by: ${replyMethod.label}`,
    related.data ? `Related: ${related.data.label}` : null,
    `Message: ${message}`,
  ]
    .filter(Boolean)
    .join('\n');

  const { error } = await serviceClient.from('activity_log').insert({
    actor_user_id: identity.data.userId,
    entity_id: entityId,
    entity_type: entityType,
    event_type: 'portal_contact_requested',
    message: activityMessage,
    org_id: identity.data.orgId,
    related_ids: {
      customer_id: identity.data.customerId,
      portal_contact_reference: referenceNumber,
      related_record_id: related.data?.id ?? null,
      related_record_type: related.data?.type ?? null,
      reply_method: replyMethod.id,
    },
  });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  revalidatePath('/portal/dashboard');
  return ok({
    referenceNumber,
    categoryLabel: category.label,
    replyMethodLabel: replyMethod.label,
  });
}

function readOptionalString(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function resolvePortalContactRelatedRecord(
  serviceClient: ReturnType<typeof createServiceClient>,
  args: { customerId: string; orgId: string; relatedRecordKey: string }
): Promise<
  Result<{
    entityId: string;
    entityType: string;
    id: string;
    label: string;
    type: 'request' | 'property';
  } | null>
> {
  const parsed = parseContactRecordKey(args.relatedRecordKey);
  if (!parsed) return err(ErrorCode.VALIDATION_ERROR, 'Choose a valid related record.');

  if (parsed.type === 'request') {
    const { data: request, error } = await serviceClient
      .from('service_requests')
      .select('id, request_number, service_title, customer_id, org_id')
      .eq('id', parsed.id)
      .maybeSingle();

    if (error) return err(ErrorCode.DB_ERROR, error.message);
    if (!request || request.customer_id !== args.customerId || request.org_id !== args.orgId) {
      return err(ErrorCode.FORBIDDEN, 'This request does not belong to your portal account.');
    }

    return ok({
      entityId: request.id,
      entityType: 'service_request',
      id: request.id,
      label: `${request.request_number} · ${request.service_title}`,
      type: 'request',
    });
  }

  const { data: propertyLink, error } = await serviceClient
    .from('customer_properties')
    .select('customer_id, property_id, properties(id, address_line_1, city, state, zip)')
    .eq('customer_id', args.customerId)
    .eq('property_id', parsed.id)
    .maybeSingle();

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  const property = propertyLink
    ? (propertyLink.properties as {
        address_line_1?: string;
        city?: string;
        id?: string;
        state?: string;
        zip?: string;
      } | null)
    : null;

  if (!propertyLink || propertyLink.customer_id !== args.customerId || !property?.id) {
    return err(ErrorCode.FORBIDDEN, 'This property does not belong to your portal account.');
  }

  return ok({
    entityId: property.id,
    entityType: 'property',
    id: property.id,
    label: `${property.address_line_1}, ${property.city}, ${property.state} ${property.zip}`,
    type: 'property',
  });
}

function makePortalContactReference(): string {
  return `PC-${Date.now().toString(36).toUpperCase()}`;
}
