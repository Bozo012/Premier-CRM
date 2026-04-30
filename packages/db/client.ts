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
 * Canonical Supabase client type used across the codebase. We deliberately
 * pin this to the OUTER `@supabase/supabase-js`'s `SupabaseClient<Database>`
 * (i.e. the one apps/web depends on directly), rather than to the version
 * bundled inside `@supabase/ssr`. Both have the same shape at runtime, but
 * TypeScript treats them as nominally distinct identities. Pinning here lets
 * query functions, server components, and call sites all share one identity
 * and lets `.from('table').select(...)` chains preserve `Database` typing
 * end-to-end.
 */
export type DbClient = SupabaseClient<Database>;

/**
 * Browser-side Supabase client. Uses @supabase/ssr so the session JWT is
 * stored in cookies (shared with the server-side client). Replaces the
 * previous @supabase/supabase-js createClient call which stored the JWT in
 * localStorage — cookies are required so server components can see the
 * user's session and RLS can enforce org isolation server-side.
 *
 * Cast at the boundary: `@supabase/ssr` returns its own bundled
 * `SupabaseClient<Database>` type. The cast unifies it with `DbClient`
 * so callers see one consistent type. Runtime contract is unchanged.
 */
export function createBrowserClient(): DbClient {
  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  return createSsrBrowserClient<Database>(url, anonKey) as unknown as DbClient;
}

/**
 * Server-side Supabase client tied to the request's cookie store. The caller
 * supplies cookie read/write methods (typically wired to Next.js's `cookies()`
 * helper via apps/web/lib/supabase-server.ts). RLS still enforces org
 * isolation per session — no service-role bypass.
 *
 * Use this from server components, server actions, and route handlers when
 * you want reads/writes performed as the authenticated user.
 */
export function createServerClient(cookies: CookieMethodsServer): DbClient {
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
    throw new Error('createServerClient() must only be called on the server.');
  }

  const url = getPublicSupabaseUrl();
  const anonKey = getPublicSupabaseAnonKey();

  return createSsrServerClient<Database>(url, anonKey, { cookies }) as unknown as DbClient;
}

/**
 * Service-role Supabase client. Bypasses RLS — only use for trusted
 * server-side operations like webhook handlers, cron jobs, and migration
 * scripts. Never expose this client to user-facing routes; use
 * `createServerClient` instead.
 */
export function createServiceClient(): DbClient {
  if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
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
