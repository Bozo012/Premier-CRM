import { getServerSupabase } from '@/lib/supabase-server';

export async function RequestsBadge() {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: membership } = await supabase
      .from('org_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (!membership?.org_id) return null;

    const { count } = await supabase
      .from('service_requests')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', membership.org_id)
      .eq('status', 'new');

    if (!count || count === 0) return null;

    return (
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold leading-none text-white">
        {count > 99 ? '99+' : count}
      </span>
    );
  } catch {
    return null;
  }
}
