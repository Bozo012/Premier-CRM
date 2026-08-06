'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { ErrorCode, err, ok, type Result } from '@premier/shared';

import { getServerSupabase } from '@/lib/supabase-server';

export async function signOutAction(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Switches the signed-in user's active organization for accounts with more
 * than one active membership (e.g. Kevin in both Premier Property
 * Maintenance and Forge Demonstration). Delegates entirely to the
 * guarded switch_active_org() RPC, which verifies the caller actually holds
 * an active membership in the target org before writing anything — this
 * action never writes org_members or user_profiles directly. Revalidates
 * the whole app layout so every already-rendered page picks up the new
 * active org on next navigation, not just this one.
 */
export async function switchActiveOrgAction(
  _prevState: Result<null> | null,
  formData: FormData
): Promise<Result<null>> {
  const orgId = String(formData.get('orgId') ?? '').trim();
  if (!orgId) return err(ErrorCode.VALIDATION_ERROR, 'Missing organization ID.');

  const supabase = await getServerSupabase();
  const { error } = await supabase.rpc('switch_active_org', { p_org_id: orgId });
  if (error) return err(ErrorCode.FORBIDDEN, error.message);

  revalidatePath('/', 'layout');
  return ok(null);
}
