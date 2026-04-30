import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createBrowserClient as createSsrBrowserClient,
  createServerClient as createSsrServerClient,
  type CookieMethodsServer,
} from '@supabase/ssr';

import type { Database } from './types';

function getPublicSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }

  return value;
}

function getPublicSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error('Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  return value;
}

function getSupabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!value) {
    throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  return value;
}

/**
 * Browser-side Supabase client. Uses @supabase/ssr so the session JWT is
 * stored in cookies (shared with the server-side client). Replaces the
 * previous @supabase/supabase-js createClient call which stored the JWT in
 * localStorage — cookies are required so server components can see the
 * user's session and RLS can enforce org isolation server-side.
 *
 * Return type is intentionally inferred (not explicitly annotated as
 * SupabaseClient<Database>) because @supabase/ssr bundles its own copy of
 * @supabase/supabase-js types, which TypeScript treats as nominally distinct
 * from this package's @supabase/supabase-js types even when structurally
 * identical. Inference avoids the false-positive TS2322 mismatch.
 */
export function createBrowserClient() {
  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  return createSsrBrowserClient<Database>(url, anonKey);
}

/**
 * Server-side Supabase client tied to the request's cookie store. The caller
 * supplies cookie read/write methods (typically wired to Next.js's `cookies()`
 * helper via apps/web/lib/supabase-server.ts). RLS still enforces org
 * isolation per session — no service-role bypass.
 *
 * Use this from server components, server actions, and route handlers when
 * you want reads/writes performed as the authenticated user.
 *
 * Return type intentionally inferred — see note on `createBrowserClient`.
 */
export function createServerClient(cookies: CookieMethodsServer) {
  if (typeof window !== 'undefined') {
    throw new Error('createServerClient() must only be called on the server.');
  }

  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  return createSsrServerClient<Database>(url, anonKey, { cookies });
}

/**
 * Shape of the SSR-backed Supabase client returned by both
 * `createBrowserClient` and `createServerClient`. Use this as the parameter
 * type for query functions that work against either side of the SSR/CSR
 * boundary. Inferred from `createBrowserClient` so the type stays in sync
 * with whatever `@supabase/ssr` returns.
 */
export type DbClient = ReturnType<typeof createBrowserClient>;

/**
 * Service-role Supabase client. Bypasses RLS — only use for trusted
 * server-side operations like webhook handlers, cron jobs, and migration
 * scripts. Never expose this client to user-facing routes; use
 * `createServerClient` instead.
 */
export function createServiceClient(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    throw new Error('createServiceClient() must only be called on the server.');
  }

  const url = getPublicSupabaseUrl();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
