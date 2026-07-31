'use server';

import { revalidatePath } from 'next/cache';

import { bookSchedulingSlot, createServiceClient } from '@premier/db';
import { ErrorCode, err, ok, type Result } from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

export type BookSchedulingSlotActionState = Result<{ jobId: string }>;

export async function bookSchedulingSlotAction(
  _previousState: BookSchedulingSlotActionState | null,
  formData: FormData
): Promise<BookSchedulingSlotActionState> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return err(ErrorCode.FORBIDDEN, 'You must be signed in to the portal.');

  const serviceClient = createServiceClient();
  const { data: account } = await serviceClient
    .from('customer_accounts')
    .select('customer_id, status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!account || account.status !== 'active') {
    return err(ErrorCode.FORBIDDEN, 'No active portal account link found.');
  }

  const slotId = formData.get('slotId');
  const jobId = formData.get('jobId');
  if (typeof slotId !== 'string' || !slotId || typeof jobId !== 'string' || !jobId) {
    return err(ErrorCode.VALIDATION_ERROR, 'Slot and job are required.');
  }

  const result = await bookSchedulingSlot(serviceClient, {
    slotId,
    jobId,
    actorCustomerId: account.customer_id,
  });
  if (!result.success) return result;

  revalidatePath('/portal/dashboard');
  return ok({ jobId });
}
