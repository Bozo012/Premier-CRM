'use server';

import { revalidatePath } from 'next/cache';

import {
  CreateInvoiceFromJobInputSchema,
  CreateQuoteFromJobInputSchema,
  ErrorCode,
  err,
  hasCapability,
  ok,
  type OrgRole,
  type Result,
} from '@premier/shared';
import {
  assignMemberToJob,
  createChangeOrderDraft,
  createDepositInvoice,
  createDraftInvoiceFromJob,
  createDraftQuote,
  createSchedulingSlot,
  createServiceClient,
  generateFinalInvoiceFromWorking,
  getActiveOrgContext,
  getJobById,
  listJobAssignments,
  logActivity,
  proposeChangeOrderRevision,
  removeMemberFromJob,
  requestPendingUpload,
  scheduleJob,
  setDepositRequirement,
  setJobLead,
  waiveDepositRequirement,
  withdrawChangeOrderRevision,
  type ActivityLogEventType,
  type ChangeOrderLineItemInput,
  type JobAssignment,
} from '@premier/db';

import { sendJobScheduledNotification } from '@/lib/customer-lifecycle-notifications';
import { finalizeSiteVisitUpload } from '@/lib/site-visit-attachments';
import { getServerSupabase } from '@/lib/supabase-server';

const JOB_LOG_TYPES = ['job_note_general', 'job_note_material', 'job_note_safety'] as const;
export type JobLogType = (typeof JOB_LOG_TYPES)[number];

export type CreateDraftQuoteActionState = Result<{ quoteId: string }>;
export type CreateInvoiceFromJobPageActionState = Result<{ invoiceId: string }>;
export type ScheduleJobActionState = Result<{
  jobId: string;
  notificationSent: boolean;
  scheduledEnd: string | null;
  scheduledStart: string;
  status: 'scheduled';
}>;

async function getJobActionContext(): Promise<
  Result<{ orgId: string; userId: string; role: OrgRole }>
> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(
      ErrorCode.FORBIDDEN,
      'You must be signed in to create a draft quote.'
    );
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  return ok({
    orgId: orgContextResult.data.orgId,
    userId: user.id,
    role: orgContextResult.data.role as OrgRole,
  });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function parseIsoDateTime(value: string, label: string): Result<string> {
  if (!value) {
    return err(ErrorCode.VALIDATION_ERROR, `${label} is required.`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return err(ErrorCode.VALIDATION_ERROR, `${label} is invalid.`);
  }

  return ok(parsed.toISOString());
}

export async function createDraftQuoteAction(
  _previousState: CreateDraftQuoteActionState | null,
  formData: FormData
): Promise<CreateDraftQuoteActionState> {
  const access = await getJobActionContext();

  if (!access.success) {
    return access;
  }

  // Creating a quote is a narrower capability than most job actions —
  // subcontractors are deliberately excluded (see canCreateQuote in
  // packages/shared/permissions.ts), matching the estimate-driven quote
  // creation path (estimates/actions.ts's createQuoteFromEstimateAction).
  if (!hasCapability(access.data.role, 'canCreateQuote')) {
    return err(ErrorCode.FORBIDDEN, 'Only an owner, admin, or employee can create a quote.');
  }

  const parsed = CreateQuoteFromJobInputSchema.safeParse({
    jobId: formData.get('jobId'),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid quote creation payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await createDraftQuote(serviceClient, {
    createdBy: access.data.userId,
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  return ok({ quoteId: result.data.id });
}

// ---------------------------------------------------------------------------
// Standalone job creation (customer + property, no prior quote) — per the
// post-MVP amendment, a second door alongside "quote accepted → create job."
// Jobs have no constraint requiring a quote/estimate origin, so this simply
// inserts directly; status defaults to 'lead' (there is no acceptance
// milestone to start from, unlike the quote-accepted path which starts jobs
// at 'approved').
// ---------------------------------------------------------------------------

export type CreateStandaloneJobActionState = Result<{ id: string }>;

export async function createStandaloneJobAction(
  _previousState: CreateStandaloneJobActionState | null,
  formData: FormData
): Promise<CreateStandaloneJobActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId } = access.data;

  const customerId =
    typeof formData.get('customerId') === 'string'
      ? (formData.get('customerId') as string).trim()
      : '';
  const propertyId =
    typeof formData.get('propertyId') === 'string'
      ? (formData.get('propertyId') as string).trim()
      : '';
  const title =
    typeof formData.get('title') === 'string'
      ? (formData.get('title') as string).trim()
      : '';
  const description =
    typeof formData.get('description') === 'string'
      ? (formData.get('description') as string).trim()
      : '';

  if (!customerId) return err(ErrorCode.VALIDATION_ERROR, 'A customer is required.');
  if (!propertyId) return err(ErrorCode.VALIDATION_ERROR, 'A property is required.');
  if (!title) return err(ErrorCode.VALIDATION_ERROR, 'A title is required.');

  const serviceClient = createServiceClient();

  const { data: customer, error: customerError } = await serviceClient
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (customerError) return err(ErrorCode.DB_ERROR, customerError.message);
  if (!customer) return err(ErrorCode.NOT_FOUND, 'Customer not found.');

  const { data: link, error: linkError } = await serviceClient
    .from('customer_properties')
    .select('property_id')
    .eq('customer_id', customerId)
    .eq('property_id', propertyId)
    .maybeSingle();

  if (linkError) return err(ErrorCode.DB_ERROR, linkError.message);
  if (!link) {
    return err(ErrorCode.VALIDATION_ERROR, 'The selected property is not linked to this customer.');
  }

  const { data: newJob, error: insertError } = await serviceClient
    .from('jobs')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      property_id: propertyId,
      title,
      description: description || null,
      created_by: userId,
    })
    .select('id')
    .single();

  if (insertError || !newJob) {
    return err(ErrorCode.DB_ERROR, insertError?.message ?? 'Failed to create job.');
  }

  revalidatePath('/jobs');

  return ok({ id: newJob.id });
}

export async function scheduleJobAction(
  _previousState: ScheduleJobActionState | null,
  formData: FormData
): Promise<ScheduleJobActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId, role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit scheduling jobs.');
  }

  const jobId = readString(formData, 'jobId');
  const scheduledStartInput = readString(formData, 'scheduledStart');
  const scheduledEndInput = readString(formData, 'scheduledEnd');

  if (!jobId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');
  }

  const scheduledStartResult = parseIsoDateTime(scheduledStartInput, 'Scheduled start');
  if (!scheduledStartResult.success) {
    return scheduledStartResult;
  }

  const scheduledEndResult = scheduledEndInput
    ? parseIsoDateTime(scheduledEndInput, 'Scheduled end')
    : ok<string | null>(null);
  if (!scheduledEndResult.success) {
    return scheduledEndResult;
  }

  const scheduledStart = scheduledStartResult.data;
  const scheduledEnd = scheduledEndResult.data;

  if (scheduledEnd && new Date(scheduledEnd).getTime() < new Date(scheduledStart).getTime()) {
    return err(
      ErrorCode.VALIDATION_ERROR,
      'Scheduled end must be after the scheduled start.'
    );
  }

  const serviceClient = createServiceClient();

  // Shared transition — identical to the customer portal's slot-booking
  // path (both call apply_job_scheduling under the hood).
  const scheduleResult = await scheduleJob(serviceClient, {
    orgId,
    jobId,
    scheduledStart,
    scheduledEnd,
    actorUserId: userId,
  });
  if (!scheduleResult.success) return scheduleResult;

  const { data: linkedRequest } = await serviceClient
    .from('service_requests')
    .select('id')
    .eq('job_id', jobId)
    .eq('org_id', orgId)
    .maybeSingle();

  const jobDetailResult = await getJobById(serviceClient, { jobId, orgId });
  const notificationSent = jobDetailResult.success
    ? (await sendJobScheduledNotification(jobDetailResult.data)).sent
    : false;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/jobs');
  revalidatePath('/requests');

  if (linkedRequest) {
    revalidatePath(`/requests/${linkedRequest.id}`);
  }

  return ok({
    jobId,
    notificationSent,
    scheduledEnd,
    scheduledStart,
    status: 'scheduled',
  });
}

export async function createInvoiceFromJobPageAction(
  _previousState: CreateInvoiceFromJobPageActionState | null,
  formData: FormData
): Promise<CreateInvoiceFromJobPageActionState> {
  const access = await getJobActionContext();

  if (!access.success) {
    return access;
  }

  const parsed = CreateInvoiceFromJobInputSchema.safeParse({
    jobId: formData.get('jobId'),
    kind: formData.get('kind') ?? 'standalone',
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstIssue?.message ?? 'Invalid invoice creation payload.'
    );
  }

  const serviceClient = createServiceClient();
  const result = await createDraftInvoiceFromJob(serviceClient, {
    createdBy: access.data.userId,
    input: parsed.data,
    orgId: access.data.orgId,
  });

  if (!result.success) {
    return result;
  }

  return ok({ invoiceId: result.data.id });
}

// ---------------------------------------------------------------------------
// Scheduling slots — staff-curated, so customer self-scheduling can never
// double-book against actual company availability.
// ---------------------------------------------------------------------------

export type CreateSchedulingSlotActionState = Result<{ slotId: string }>;

export async function createSchedulingSlotAction(
  _previousState: CreateSchedulingSlotActionState | null,
  formData: FormData
): Promise<CreateSchedulingSlotActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId, role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit managing the schedule.');
  }

  const startsAtResult = parseIsoDateTime(readString(formData, 'startsAt'), 'Slot start');
  if (!startsAtResult.success) return startsAtResult;
  const endsAtResult = parseIsoDateTime(readString(formData, 'endsAt'), 'Slot end');
  if (!endsAtResult.success) return endsAtResult;

  const capacityInput = readString(formData, 'capacity');
  const capacity = capacityInput ? Number(capacityInput) : 1;

  const serviceClient = createServiceClient();
  const result = await createSchedulingSlot(serviceClient, {
    orgId,
    startsAt: startsAtResult.data,
    endsAt: endsAtResult.data,
    capacity,
    createdByUserId: userId,
  });
  if (!result.success) return result;

  revalidatePath('/jobs');
  return ok({ slotId: result.data.slot.id });
}

// ---------------------------------------------------------------------------
// Deposits — owner/admin only (canManageDeposits). job_deposits is a
// requirement/config record; money stays on invoices/payments.
// ---------------------------------------------------------------------------

export type SetDepositRequirementActionState = Result<{ jobId: string }>;

export async function setDepositRequirementAction(
  _previousState: SetDepositRequirementActionState | null,
  formData: FormData
): Promise<SetDepositRequirementActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, role, userId } = access.data;

  if (!hasCapability(role, 'canManageDeposits')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit managing deposits.');
  }

  const jobId = readString(formData, 'jobId');
  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');

  const amountInput = readString(formData, 'requiredAmount');
  const percentageInput = readString(formData, 'requiredPercentage');
  const dueDateInput = readString(formData, 'dueDate');
  const blocksScheduling = formData.get('blocksScheduling') === 'on';
  const blocksWorkStart = formData.get('blocksWorkStart') !== 'off';

  const requiredAmount = amountInput ? Number(amountInput) : null;
  const requiredPercentage = percentageInput ? Number(percentageInput) : null;

  if (requiredAmount !== null && requiredPercentage !== null) {
    return err(ErrorCode.VALIDATION_ERROR, 'Set either a fixed amount or a percentage, not both.');
  }

  const serviceClient = createServiceClient();
  const result = await setDepositRequirement(serviceClient, {
    orgId,
    jobId,
    requiredAmount,
    requiredPercentage,
    dueDate: dueDateInput || null,
    blocksScheduling,
    blocksWorkStart,
    actorUserId: userId,
  });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  return ok({ jobId });
}

export type WaiveDepositActionState = Result<{ jobId: string }>;

export async function waiveDepositAction(
  _previousState: WaiveDepositActionState | null,
  formData: FormData
): Promise<WaiveDepositActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId, role } = access.data;

  if (!hasCapability(role, 'canManageDeposits')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit managing deposits.');
  }

  const jobId = readString(formData, 'jobId');
  const reason = readString(formData, 'reason');
  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');
  if (!reason) return err(ErrorCode.VALIDATION_ERROR, 'A waiver reason is required.');

  const serviceClient = createServiceClient();
  const result = await waiveDepositRequirement(serviceClient, { orgId, jobId, reason, waivedByUserId: userId });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  return ok({ jobId });
}

export type CreateDepositInvoiceActionState = Result<{ jobId: string; invoiceId: string }>;

export async function createDepositInvoiceAction(
  _previousState: CreateDepositInvoiceActionState | null,
  formData: FormData
): Promise<CreateDepositInvoiceActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, role, userId } = access.data;

  if (!hasCapability(role, 'canManageDeposits')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit managing deposits.');
  }

  const jobId = readString(formData, 'jobId');
  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');

  const serviceClient = createServiceClient();
  const result = await createDepositInvoice(serviceClient, { orgId, jobId, actorUserId: userId });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/invoices/${result.data.invoiceId}`);
  return ok({ jobId, invoiceId: result.data.invoiceId });
}

// ---------------------------------------------------------------------------
// Final invoice generation — snapshots the working invoice, never
// repurposes it in place.
// ---------------------------------------------------------------------------

export type GenerateFinalInvoiceActionState = Result<{ finalInvoiceId: string }>;

export async function generateFinalInvoiceAction(
  _previousState: GenerateFinalInvoiceActionState | null,
  formData: FormData
): Promise<GenerateFinalInvoiceActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, role, userId } = access.data;

  if (!hasCapability(role, 'canCreateInvoices')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit creating invoices.');
  }

  const jobId = readString(formData, 'jobId');
  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');

  const serviceClient = createServiceClient();
  const result = await generateFinalInvoiceFromWorking(serviceClient, { orgId, jobId, actorUserId: userId });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/invoices/${result.data.finalInvoiceId}`);
  return ok({ finalInvoiceId: result.data.finalInvoiceId });
}

// ---------------------------------------------------------------------------
// Change orders — draft/propose/withdraw. Staff can draft and propose;
// only the customer's response (portal) is contractual acceptance — see
// apps/web/app/portal/change-orders/actions.ts.
// ---------------------------------------------------------------------------

export type CreateChangeOrderDraftActionState = Result<{ revisionId: string; changeOrderId: string }>;

export async function createChangeOrderDraftAction(
  _previousState: CreateChangeOrderDraftActionState | null,
  formData: FormData
): Promise<CreateChangeOrderDraftActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId, role } = access.data;

  if (!hasCapability(role, 'canProposeChangeOrders')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit drafting change orders.');
  }

  const jobId = readString(formData, 'jobId');
  const changeOrderId = readString(formData, 'changeOrderId') || null;
  const reason = readString(formData, 'reason');
  const scopeChangeSummary = readString(formData, 'scopeChangeSummary');
  const scheduleOnly = formData.get('scheduleOnly') === 'on';
  const lineItemsJson = readString(formData, 'lineItemsJson');

  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');

  let lineItems: ChangeOrderLineItemInput[] = [];
  if (lineItemsJson) {
    try {
      lineItems = JSON.parse(lineItemsJson);
    } catch {
      return err(ErrorCode.VALIDATION_ERROR, 'Line items payload is invalid.');
    }
  }

  const serviceClient = createServiceClient();
  const result = await createChangeOrderDraft(serviceClient, {
    orgId,
    jobId,
    changeOrderId,
    initiator: 'contractor',
    requestedByUserId: userId,
    createdByUserId: userId,
    reason: reason || null,
    scopeChangeSummary: scopeChangeSummary || null,
    scheduleOnly,
    lineItems,
  });

  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  return ok({ revisionId: result.data.id, changeOrderId: result.data.change_order_id });
}

export type ProposeChangeOrderActionState = Result<{ revisionId: string }>;

export async function proposeChangeOrderAction(
  _previousState: ProposeChangeOrderActionState | null,
  formData: FormData
): Promise<ProposeChangeOrderActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { userId, role } = access.data;

  if (!hasCapability(role, 'canProposeChangeOrders')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit proposing change orders.');
  }

  const revisionId = readString(formData, 'revisionId');
  const jobId = readString(formData, 'jobId');
  if (!revisionId) return err(ErrorCode.VALIDATION_ERROR, 'Revision ID is required.');

  const serviceClient = createServiceClient();
  const result = await proposeChangeOrderRevision(serviceClient, { revisionId, actorUserId: userId });
  if (!result.success) return result;

  if (jobId) revalidatePath(`/jobs/${jobId}`);
  return ok({ revisionId: result.data.id });
}

export type WithdrawChangeOrderActionState = Result<{ revisionId: string }>;

export async function withdrawChangeOrderAction(
  _previousState: WithdrawChangeOrderActionState | null,
  formData: FormData
): Promise<WithdrawChangeOrderActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { userId } = access.data;

  const revisionId = readString(formData, 'revisionId');
  const jobId = readString(formData, 'jobId');
  if (!revisionId) return err(ErrorCode.VALIDATION_ERROR, 'Revision ID is required.');

  const serviceClient = createServiceClient();
  const result = await withdrawChangeOrderRevision(serviceClient, { revisionId, actorUserId: userId });
  if (!result.success) return result;

  if (jobId) revalidatePath(`/jobs/${jobId}`);
  return ok({ revisionId: result.data.id });
}

export type AddJobLogActionState = Result<{ jobId: string }>;

const JOB_LOG_TYPE_LABELS: Record<JobLogType, string> = {
  job_note_general: 'General note',
  job_note_material: 'Material note',
  job_note_safety: 'Safety note',
};

export async function addJobLogAction(
  _previousState: AddJobLogActionState | null,
  formData: FormData
): Promise<AddJobLogActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId, role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit adding job logs.');
  }

  const jobId = readString(formData, 'jobId');
  const logTypeInput = readString(formData, 'logType');
  const message = readString(formData, 'message');

  if (!jobId) return err(ErrorCode.VALIDATION_ERROR, 'Job ID is required.');
  if (!message) return err(ErrorCode.VALIDATION_ERROR, 'Log message is required.');
  if (message.length > 2000) {
    return err(ErrorCode.VALIDATION_ERROR, 'Log message must be 2000 characters or fewer.');
  }

  const logType = (JOB_LOG_TYPES as readonly string[]).includes(logTypeInput)
    ? (logTypeInput as JobLogType)
    : 'job_note_general';

  const serviceClient = createServiceClient();
  const jobResult = await getJobById(serviceClient, { jobId, orgId });
  if (!jobResult.success) return jobResult;

  await logActivity(serviceClient, {
    orgId,
    entityType: 'job',
    entityId: jobId,
    eventType: logType as ActivityLogEventType,
    message: `${JOB_LOG_TYPE_LABELS[logType]}: ${message}`,
    actorUserId: userId,
  });

  revalidatePath(`/jobs/${jobId}`);
  return ok({ jobId });
}

export type RequestJobPhotoUploadActionState = Result<{
  uploadId: string;
  pendingPath: string;
  signedUploadToken: string;
}>;

export async function requestJobPhotoUploadAction(input: {
  jobId: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
}): Promise<RequestJobPhotoUploadActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId, userId, role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit adding job photos.');
  }

  const supabase = await getServerSupabase();
  return requestPendingUpload(supabase, {
    orgId,
    entityType: 'job',
    entityId: input.jobId,
    actorUserId: userId,
    declaredMimeType: input.declaredMimeType,
    declaredSizeBytes: input.declaredSizeBytes,
  });
}

export type FinalizeJobPhotoUploadActionState = Result<{ vaultItemId: string; storagePath: string }>;

export async function finalizeJobPhotoUploadAction(
  uploadId: string,
  jobId: string
): Promise<FinalizeJobPhotoUploadActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId } = access.data;

  const supabase = await getServerSupabase();
  const { data: pendingOrgCheck, error: pendingOrgCheckError } = await supabase
    .from('pending_uploads')
    .select('id')
    .eq('id', uploadId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (pendingOrgCheckError) return err(ErrorCode.DB_ERROR, pendingOrgCheckError.message);
  if (!pendingOrgCheck) return err(ErrorCode.NOT_FOUND, 'Pending upload not found.');

  const serviceClient = createServiceClient();
  const result = await finalizeSiteVisitUpload(serviceClient, uploadId);
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath('/site-photos');
  return result;
}

// ---------------------------------------------------------------------------
// Job crew assignment (design/job-crew-assignment-model). Mutations call the
// assign_member_to_job/remove_member_from_job/set_job_lead RPCs via the
// caller's own RLS-scoped session client (not the service client) — those
// RPCs derive the actor from auth.uid() internally, matching the site-visit
// lifecycle RPCs' pattern, not scheduleJob's service-role + explicit
// actorUserId pattern. Capability checks here are a UX mirror only; each
// RPC independently re-verifies canScheduleJobs server-side.
// ---------------------------------------------------------------------------

export type ListJobAssignmentsActionState = Result<JobAssignment[]>;

export async function listJobAssignmentsAction(jobId: string): Promise<ListJobAssignmentsActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { orgId } = access.data;

  const supabase = await getServerSupabase();
  return listJobAssignments(supabase, { orgId, jobId });
}

export type AssignJobCrewMemberActionState = Result<{ assignmentId: string }>;

export async function assignJobCrewMemberAction(
  _previousState: AssignJobCrewMemberActionState | null,
  formData: FormData
): Promise<AssignJobCrewMemberActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit assigning crew to jobs.');
  }

  const jobId = readString(formData, 'jobId');
  const userId = readString(formData, 'userId');
  const isLead = readString(formData, 'isLead') === 'true';

  if (!jobId || !userId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Job ID and team member are required.');
  }

  const supabase = await getServerSupabase();
  const result = await assignMemberToJob(supabase, { jobId, userId, isLead });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  // No /team/[memberId] revalidation here: Team Member Detail's route
  // param is org_members.id, not user_id — no presentation reads this
  // yet (deliberately deferred, see design/job-crew-assignment-model),
  // so there's nothing real to revalidate; resolving org_members.id
  // from userId is a future-slice concern once that page exists.
  return result;
}

export type RemoveJobCrewMemberActionState = Result<null>;

export async function removeJobCrewMemberAction(
  _previousState: RemoveJobCrewMemberActionState | null,
  formData: FormData
): Promise<RemoveJobCrewMemberActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit removing crew from jobs.');
  }

  const jobId = readString(formData, 'jobId');
  const userId = readString(formData, 'userId');

  if (!jobId || !userId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Job ID and team member are required.');
  }

  const supabase = await getServerSupabase();
  const result = await removeMemberFromJob(supabase, { jobId, userId });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  // No /team/[memberId] revalidation here: Team Member Detail's route
  // param is org_members.id, not user_id — no presentation reads this
  // yet (deliberately deferred, see design/job-crew-assignment-model),
  // so there's nothing real to revalidate; resolving org_members.id
  // from userId is a future-slice concern once that page exists.
  return result;
}

export type SetJobLeadActionState = Result<null>;

export async function setJobLeadAction(
  _previousState: SetJobLeadActionState | null,
  formData: FormData
): Promise<SetJobLeadActionState> {
  const access = await getJobActionContext();
  if (!access.success) return access;
  const { role } = access.data;

  if (!hasCapability(role, 'canScheduleJobs')) {
    return err(ErrorCode.FORBIDDEN, 'Your role does not permit setting the lead technician.');
  }

  const jobId = readString(formData, 'jobId');
  const userId = readString(formData, 'userId');

  if (!jobId || !userId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Job ID and team member are required.');
  }

  const supabase = await getServerSupabase();
  const result = await setJobLead(supabase, { jobId, userId });
  if (!result.success) return result;

  revalidatePath(`/jobs/${jobId}`);
  // No /team/[memberId] revalidation here: Team Member Detail's route
  // param is org_members.id, not user_id — no presentation reads this
  // yet (deliberately deferred, see design/job-crew-assignment-model),
  // so there's nothing real to revalidate; resolving org_members.id
  // from userId is a future-slice concern once that page exists.
  return result;
}
