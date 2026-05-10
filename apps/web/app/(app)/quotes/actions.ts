'use server';

import { revalidatePath } from 'next/cache';

import {
  AddLineItemInputSchema,
  ErrorCode,
  RemoveLineItemInputSchema,
  UpdateLineItemInputSchema,
  err,
  ok,
  type Result,
} from '@premier/shared';
import {
  addQuoteLineItem,
  removeQuoteLineItem,
  updateQuoteLineItem,
  createServiceClient,
} from '@premier/db';

import { getServerSupabase } from '@/lib/supabase-server';

export type LineItemActionState = Result<{ lineItemId: string }>;

interface QuoteActionContext {
  orgId: string;
}

async function getQuoteActionContext(): Promise<Result<QuoteActionContext>> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return err(ErrorCode.FORBIDDEN, 'You must be signed in to edit quotes.');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return err(ErrorCode.DB_ERROR, membershipError.message);
  }

  if (!membership?.org_id) {
    return err(ErrorCode.FORBIDDEN, 'No active organization membership found.');
  }

  return ok({ orgId: membership.org_id });
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalString(
  formData: FormData,
  key: string
): string | undefined {
  const value = readString(formData, key);
  return value.length > 0 ? value : undefined;
}

export async function addLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    quoteId: readString(formData, 'quoteId'),
    serviceId: readOptionalString(formData, 'serviceId'),
    name: readString(formData, 'name'),
    description: readOptionalString(formData, 'description'),
    unit: readString(formData, 'unit'),
    quantity: readString(formData, 'quantity'),
    unitPrice: readString(formData, 'unitPrice'),
    markupPct: readOptionalString(formData, 'markupPct'),
  };

  const parsed = AddLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstError?.message ?? 'Invalid line item input.'
    );
  }

  const client = createServiceClient();
  const result = await addQuoteLineItem(client, {
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  return ok({ lineItemId: result.data.id });
}

export async function updateLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    lineItemId: readString(formData, 'lineItemId'),
    quoteId: readString(formData, 'quoteId'),
    name: readString(formData, 'name'),
    description: readOptionalString(formData, 'description'),
    unit: readString(formData, 'unit'),
    quantity: readString(formData, 'quantity'),
    unitPrice: readString(formData, 'unitPrice'),
    markupPct: readOptionalString(formData, 'markupPct'),
  };

  const parsed = UpdateLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstError?.message ?? 'Invalid line item input.'
    );
  }

  const client = createServiceClient();
  const result = await updateQuoteLineItem(client, {
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  return ok({ lineItemId: result.data.id });
}

export async function removeLineItemAction(
  _prevState: LineItemActionState | null,
  formData: FormData
): Promise<LineItemActionState> {
  const contextResult = await getQuoteActionContext();
  if (!contextResult.success) {
    return contextResult;
  }
  const { orgId } = contextResult.data;

  const rawInput = {
    lineItemId: readString(formData, 'lineItemId'),
    quoteId: readString(formData, 'quoteId'),
  };

  const parsed = RemoveLineItemInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return err(
      ErrorCode.VALIDATION_ERROR,
      firstError?.message ?? 'Invalid remove request.'
    );
  }

  const client = createServiceClient();
  const result = await removeQuoteLineItem(client, {
    input: parsed.data,
    orgId,
  });

  if (!result.success) {
    return result;
  }

  revalidatePath(`/quotes/${parsed.data.quoteId}`);
  return ok({ lineItemId: parsed.data.lineItemId });
}
