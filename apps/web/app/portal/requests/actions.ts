'use server';

// Server action for the portal "New request" flow. Calls
// create_portal_service_request(...) (supabase/migrations/20260810120000_
// create_portal_service_request_rpc.sql) through the RLS-authenticated
// portal client (resolveActivePortalAccount()'s portalClient), not the
// service-role client — the RPC is SECURITY DEFINER and resolves the
// caller's customer_id/org_id from auth.uid() itself, so the call must go
// through with the signed-in user's JWT for that to work. Input is also
// validated here (thin, mirrors the RPC's own checks) purely for fast,
// friendly client-facing errors — the RPC remains the actual authority and
// re-validates everything server-side regardless of what this action does.

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { createPortalServiceRequest, type DbClient } from '@premier/db';
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import { resolveActivePortalAccount } from '../_lib/portal-session';

const CreatePortalRequestSchema = z.object({
  serviceTitle: z.string().trim().min(1, 'A title is required.').max(200, 'Keep the title under 200 characters.'),
  serviceDescription: z
    .string()
    .trim()
    .min(1, 'A description is required.')
    .max(5000, 'Keep the description under 5,000 characters.'),
  propertyId: z.string().trim().uuid('Choose a valid property.').optional().or(z.literal('')),
  // What the customer says about urgency — never priority. See
  // 20260813020000_portal_customer_reported_urgency.sql: this is a
  // separate column, staff-facing context only, and is never copied into
  // service_requests.priority anywhere in this action, the RPC, or the DB.
  customerReportedUrgency: z.enum(['routine', 'soon', 'urgent']).optional().or(z.literal('')),
});

export type CreatePortalServiceRequestActionState = Result<{
  serviceRequestId: string;
  requestNumber: string | null;
  status: string;
}>;

export async function createPortalServiceRequestAction(
  _previousState: CreatePortalServiceRequestActionState | null,
  formData: FormData
): Promise<CreatePortalServiceRequestActionState> {
  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to the portal to submit a request.');
  }

  const rawPropertyId = formData.get('propertyId');
  const rawUrgency = formData.get('customerReportedUrgency');
  const parsed = CreatePortalRequestSchema.safeParse({
    serviceTitle: formData.get('serviceTitle'),
    serviceDescription: formData.get('serviceDescription'),
    // FormData.get() returns null for a missing/empty field; the schema's
    // .optional() only accepts undefined, so normalize null -> undefined
    // here rather than widening the schema to accept null everywhere.
    propertyId: typeof rawPropertyId === 'string' ? rawPropertyId : undefined,
    customerReportedUrgency: typeof rawUrgency === 'string' ? rawUrgency : undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(ErrorCode.VALIDATION_ERROR, firstIssue?.message ?? 'Check the form and try again.');
  }

  const propertyId = parsed.data.propertyId ? parsed.data.propertyId : null;
  const customerReportedUrgency = parsed.data.customerReportedUrgency ? parsed.data.customerReportedUrgency : null;

  const result = await createPortalServiceRequest(portalClient as unknown as DbClient, {
    serviceTitle: parsed.data.serviceTitle,
    serviceDescription: parsed.data.serviceDescription,
    propertyId,
    customerReportedUrgency,
  });

  if (!result.success) return result;

  revalidatePath('/portal/requests');

  return ok({
    serviceRequestId: result.data.serviceRequestId,
    requestNumber: result.data.requestNumber,
    status: result.data.status,
  });
}
