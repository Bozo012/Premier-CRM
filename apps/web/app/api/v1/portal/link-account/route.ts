/**
 * POST /api/v1/portal/link-account
 *
 * Bridge endpoint for the website's customer portal (a Vite SPA with no
 * server, so it can't run the service-role match-or-create logic itself).
 * The website performs Supabase Auth signUp/signInWithPassword directly in
 * the browser (anon key, safe to expose), then calls this route with the
 * resulting access token so the customer<->auth-user link — which requires
 * a privileged lookup across all customers by email, not just the caller's
 * own row — can happen server-side.
 *
 * The caller's identity (auth user id + email) is taken ONLY from the verified
 * access token, never from the request body, so a caller cannot link an
 * arbitrary auth_user_id to someone else's customer record.
 *
 * Mirrors apps/web/app/portal/actions.ts's ensureCustomerAccount exactly —
 * same match-or-create-by-email logic, same customer_accounts upsert shape.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { ensureCustomerAccount } from '@/lib/customer-portal-account';

const ALLOWED_ORIGINS_PROD = [
  'https://ppmnky.com',
  'https://www.ppmnky.com',
  'https://premier-property-maintenance.vercel.app',
];

const ALLOWED_ORIGINS_DEV = ['http://localhost:3000', 'http://localhost:5173'];

function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;

  const allowedOrigins =
    process.env.NODE_ENV === 'development'
      ? [...ALLOWED_ORIGINS_PROD, ...ALLOWED_ORIGINS_DEV]
      : ALLOWED_ORIGINS_PROD;

  return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

function buildCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigin = resolveAllowedOrigin(origin);
  if (!allowedOrigin) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function resolveClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

function checkAndIncrementRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);

  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request.headers.get('Origin')),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const corsHeaders = buildCorsHeaders(request.headers.get('Origin'));

  const ip = resolveClientIp(request);
  if (!checkAndIncrementRateLimit(ip)) {
    return NextResponse.json(
      { success: false, code: 'RATE_LIMITED', error: 'Too many requests. Please try again later.' },
      { status: 429, headers: corsHeaders }
    );
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';

  if (!token) {
    return NextResponse.json(
      { success: false, code: 'FORBIDDEN', error: 'Missing bearer token.' },
      { status: 401, headers: corsHeaders }
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { success: false, code: 'INTERNAL_ERROR', error: 'Server misconfiguration.' },
      { status: 500, headers: corsHeaders }
    );
  }

  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: userResult, error: userError } = await anonClient.auth.getUser(token);

  if (userError || !userResult.user?.email) {
    return NextResponse.json(
      { success: false, code: 'FORBIDDEN', error: 'Invalid or expired session.' },
      { status: 401, headers: corsHeaders }
    );
  }

  const authUserId = userResult.user.id;
  const email = userResult.user.email.toLowerCase();

  let rawBody: unknown = {};
  try {
    rawBody = await request.json();
  } catch {
    // No body is fine — fullName is optional (only used if creating a new customer).
  }
  const bodyFullName =
    rawBody && typeof rawBody === 'object' && 'fullName' in rawBody && typeof (rawBody as { fullName: unknown }).fullName === 'string'
      ? (rawBody as { fullName: string }).fullName.trim()
      : '';
  const metadataFullName =
    typeof userResult.user.user_metadata?.full_name === 'string'
      ? (userResult.user.user_metadata.full_name as string).trim()
      : '';
  const fullName = metadataFullName || bodyFullName;

  const accountResult = await ensureCustomerAccount({ authUserId, email, fullName });
  if (!accountResult.success) {
    return NextResponse.json(
      { success: false, code: accountResult.code, error: 'Could not finish linking your portal account.' },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    { success: true, data: { customerId: accountResult.customerId } },
    { status: 200, headers: corsHeaders }
  );
}
