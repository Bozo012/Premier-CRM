'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  approveExpense,
  createExpense,
  createServiceClient,
  getActiveOrgContext,
  rejectExpense,
  submitExpense,
  voidExpense,
} from '@premier/db';
import {
  ApproveExpenseInputSchema,
  CreateExpenseInputSchema,
  ErrorCode,
  RejectExpenseInputSchema,
  SubmitExpenseInputSchema,
  VoidExpenseInputSchema,
  err,
  hasCapability,
  ok,
  type Capability,
  type Result,
} from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

interface ExpenseActionContext {
  orgId: string;
  userId: string;
}

const CAPABILITY_LABELS: Record<Capability, string> = {
  canApproveEstimatePricing: 'approve estimate pricing',
  canApproveExpenses: 'approve or reject expenses',
  canCreateDirectWorkOrder: 'create a direct work order',
  canCreateEstimates: 'create estimates',
  canCreateExpenses: 'create or edit expenses',
  canCreateInvoices: 'create or edit invoices',
  canCreateQuote: 'create a quote',
  canDeleteInvoices: 'delete invoices',
  canEditEstimate: 'edit the estimate',
  canEditWorkingInvoice: 'edit the working invoice',
  canIssueRefunds: 'issue refunds',
  canManageDeposits: 'manage deposits',
  canManageInspectionTemplates: 'manage inspection templates',
  canProposeChangeOrders: 'propose change orders',
  canRecordPayments: 'record payments',
  canScheduleJobs: 'schedule jobs',
  canSendEstimates: 'send estimates',
  canSendInvoices: 'send invoices',
  canSendQuote: 'send a quote',
  canTriageRequests: 'triage requests',
  canVoidInvoices: 'void invoices',
};

async function getExpenseActionContext(
  capability: Capability
): Promise<Result<ExpenseActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to manage expenses.');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);
  if (!orgContextResult.success) {
    return err(orgContextResult.code, orgContextResult.error);
  }

  const { orgId, role } = orgContextResult.data;
  if (!hasCapability(role, capability)) {
    return err(
      ErrorCode.FORBIDDEN,
      `Your role does not have permission to ${CAPABILITY_LABELS[capability]}.`
    );
  }

  return ok({ orgId, userId: user.id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(formData: FormData, key: string): string | undefined {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

function redirectWithError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createExpenseAction(formData: FormData): Promise<never> {
  const contextResult = await getExpenseActionContext('canCreateExpenses');
  if (!contextResult.success) redirectWithError('/expenses/new', contextResult.error);

  const rawInput = {
    amount: readString(formData, 'amount'),
    billingTreatment: readOptionalString(formData, 'billingTreatment') ?? 'pending_review',
    category: readString(formData, 'category'),
    customerChargeAmount: readOptionalString(formData, 'customerChargeAmount'),
    customerVisibleDescription: readOptionalString(formData, 'customerVisibleDescription'),
    description: readString(formData, 'description'),
    internalNotes: readOptionalString(formData, 'internalNotes') ?? '',
    jobId: readString(formData, 'jobId'),
    markupPct: readOptionalString(formData, 'markupPct'),
    paymentMethod: readOptionalString(formData, 'paymentMethod') ?? 'other',
    purchaseDate: readString(formData, 'purchaseDate'),
    receiptVisibility: readOptionalString(formData, 'receiptVisibility') ?? 'internal',
    tax: readOptionalString(formData, 'tax') ?? '0',
    vendor: readOptionalString(formData, 'vendor') ?? '',
  };

  const parsed = CreateExpenseInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    redirectWithError('/expenses/new', firstError?.message ?? 'Invalid expense.');
  }

  const client = createServiceClient();
  const result = await createExpense(client, {
    createdBy: contextResult.data.userId,
    input: parsed.data,
    orgId: contextResult.data.orgId,
  });

  if (!result.success) redirectWithError('/expenses/new', result.error);

  revalidatePath('/expenses');
  revalidatePath(`/jobs/${parsed.data.jobId}`);
  redirect(`/expenses/${result.data.id}?message=${encodeURIComponent('Expense created.')}`);
}

export async function submitExpenseAction(formData: FormData): Promise<never> {
  const contextResult = await getExpenseActionContext('canCreateExpenses');
  if (!contextResult.success) redirectWithError('/expenses', contextResult.error);

  const parsed = SubmitExpenseInputSchema.safeParse({
    expenseId: readString(formData, 'expenseId'),
  });
  if (!parsed.success) redirectWithError('/expenses', 'Invalid expense ID.');

  const client = createServiceClient();
  const result = await submitExpense(client, {
    actorUserId: contextResult.data.userId,
    expenseId: parsed.data.expenseId,
    orgId: contextResult.data.orgId,
  });
  if (!result.success) redirectWithError(`/expenses/${parsed.data.expenseId}`, result.error);

  revalidatePath('/expenses');
  revalidatePath(`/expenses/${parsed.data.expenseId}`);
  redirect(`/expenses/${parsed.data.expenseId}?message=${encodeURIComponent('Expense submitted for review.')}`);
}

export async function approveExpenseAction(formData: FormData): Promise<never> {
  const contextResult = await getExpenseActionContext('canApproveExpenses');
  if (!contextResult.success) redirectWithError('/expenses', contextResult.error);

  const parsed = ApproveExpenseInputSchema.safeParse({
    approvalComment: readOptionalString(formData, 'approvalComment') ?? '',
    billingTreatment: readString(formData, 'billingTreatment'),
    customerChargeAmount: readOptionalString(formData, 'customerChargeAmount'),
    expenseId: readString(formData, 'expenseId'),
  });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    redirectWithError('/expenses', firstError?.message ?? 'Invalid approval.');
  }

  const client = createServiceClient();
  const result = await approveExpense(client, {
    actorUserId: contextResult.data.userId,
    input: parsed.data,
    orgId: contextResult.data.orgId,
  });
  if (!result.success) redirectWithError(`/expenses/${parsed.data.expenseId}`, result.error);

  revalidatePath('/expenses');
  revalidatePath(`/expenses/${parsed.data.expenseId}`);
  redirect(`/expenses/${parsed.data.expenseId}?message=${encodeURIComponent('Expense approved.')}`);
}

export async function rejectExpenseAction(formData: FormData): Promise<never> {
  const contextResult = await getExpenseActionContext('canApproveExpenses');
  if (!contextResult.success) redirectWithError('/expenses', contextResult.error);

  const parsed = RejectExpenseInputSchema.safeParse({
    expenseId: readString(formData, 'expenseId'),
    rejectionComment: readString(formData, 'rejectionComment'),
  });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    redirectWithError('/expenses', firstError?.message ?? 'Invalid rejection.');
  }

  const client = createServiceClient();
  const result = await rejectExpense(client, {
    actorUserId: contextResult.data.userId,
    input: parsed.data,
    orgId: contextResult.data.orgId,
  });
  if (!result.success) redirectWithError(`/expenses/${parsed.data.expenseId}`, result.error);

  revalidatePath('/expenses');
  revalidatePath(`/expenses/${parsed.data.expenseId}`);
  redirect(`/expenses/${parsed.data.expenseId}?message=${encodeURIComponent('Expense rejected.')}`);
}

export async function voidExpenseAction(formData: FormData): Promise<never> {
  const contextResult = await getExpenseActionContext('canApproveExpenses');
  if (!contextResult.success) redirectWithError('/expenses', contextResult.error);

  const parsed = VoidExpenseInputSchema.safeParse({
    expenseId: readString(formData, 'expenseId'),
  });
  if (!parsed.success) redirectWithError('/expenses', 'Invalid expense ID.');

  const client = createServiceClient();
  const result = await voidExpense(client, {
    actorUserId: contextResult.data.userId,
    expenseId: parsed.data.expenseId,
    orgId: contextResult.data.orgId,
  });
  if (!result.success) redirectWithError(`/expenses/${parsed.data.expenseId}`, result.error);

  revalidatePath('/expenses');
  revalidatePath(`/expenses/${parsed.data.expenseId}`);
  redirect(`/expenses/${parsed.data.expenseId}?message=${encodeURIComponent('Expense voided.')}`);
}
