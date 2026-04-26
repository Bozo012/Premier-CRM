import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

export function createBrowserClient(): SupabaseClient<Database> {
  const url = getPublicSupabaseUrl();
const anonKey = getPublicSupabaseAnonKey();

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

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
