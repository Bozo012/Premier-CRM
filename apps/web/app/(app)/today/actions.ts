'use server';

import { redirect } from 'next/navigation';

import { getServerSupabase } from '@/lib/supabase-server';

export async function signOutAction(): Promise<void> {
  const supabase = await getServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}
