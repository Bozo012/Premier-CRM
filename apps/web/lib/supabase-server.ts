import { cookies } from 'next/headers';

import { createServerClient } from '@premier/db';

/**
 * Returns a Supabase client bound to the current request's cookie store.
 *
 * Use this from server components, server actions, and route handlers when you
 * need reads/writes performed as the authenticated user (RLS-enforced). The
 * returned client shares its session with the browser client because both go
 * through @supabase/ssr cookie storage.
 *
 * Notes on cookie writes from server components:
 * Next.js does not allow `cookieStore.set()` inside server components; it only
 * allows it inside server actions and route handlers. Supabase's SSR helper
 * may attempt a refresh on read which calls setAll — we swallow the error in
 * that case so reads still work. If a session-refresh-on-read is desired,
 * wire it up via middleware in a follow-up PR.
 */
export async function getServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient({
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Called from a server component — cookie writes are not allowed there.
        // Reads still succeed; refresh-on-read can be added via middleware.
      }
    },
  });
}
