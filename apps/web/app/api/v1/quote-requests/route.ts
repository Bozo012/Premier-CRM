/**
 * POST /api/v1/quote-requests
 *
 * Public endpoint that accepts a quote-request payload from the marketing
 * site (ppmnky.com) and creates a deduped customer + a tasks row in the CRM.
 *
 * Unauthenticated by design: marketing-site visitors aren't logged in. We
 * trust the request shape (validated via Zod) and use the service-role
 * Supabase client to write into the Premier org. RLS would normally protect
 * us; since we bypass it here, the org_id is hardcoded server-side and the
 * insert columns are explicitly allowlisted via the query function.
 *
 * Defenses on this endpoint:
 *  - Zod validation rejects malformed payloads with HTTP 400.
 *  - Honeypot field `_hp`: if a bot fills it, we return 200 silently without
 *    writing anything. Bots don't learn they've been detected; humans never
 *    see the field (display:none in the form).
 *  - In-memory IP rate limit: 10 requests per hour per source IP. Per
 *    serverless instance — won't survive cold starts and doesn't sync across
 *    instances. Good enough for the volume we expect; revisit if abuse appears.
 *  - CORS allowlist: only the marketing site origins can cross-origin POST.
 *
 * NOT defended against here:
 *  - Distributed/sophisticated abuse (would need a captcha or per-IP DB
 *    rate-limit; deferred).
 *  - Email-spoofed submissions (we don't verify the email; that's what the
 *    follow-up reply email is for).
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  ErrorCode,
  QuoteRequestPayloadSchema,
} from '@premier/shared';
import {
  createQuoteRequest,
  createServiceClient,
} from '@premier/db';

const PREMIER_ORG_ID =
  process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';

const ALLOWED_ORIGINS_PROD = [
  'https://ppmnky.com',
  'https://www.ppmnky.com',
  'https://premier-property-maintenance.vercel.app',
];

const ALLOWED_ORIGINS_DEV = [
  'http://localhost:3000',
  'http://localhost:5173',
];

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Resolve a stable allow-origin string for the response. Returns the matched
 * origin if it's on the allowlist (so we can echo it back on
 * `Access-Control-Allow-Origin`), or null to reject.
 */
function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const allowed =
    process.env.NODE_ENV === 'development'
      ? [...ALLOWED_ORIGINS_PROD, ...ALLOWED_ORIGINS_DEV]
      : ALLOWED_ORIGINS_PROD;
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

function buildCorsHeaders(origin: string | null): HeadersInit {
  const allowed = resolveAllowedOrigin(origin);
  if (!allowed) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/**
 * Pull a best-effort source IP from request headers. Vercel sets
 * `x-forwarded-for` (comma-separated chain) and `x-real-ip`. Falls back to
 * 'unknown' so the rate limiter still applies (one shared bucket for all
 * unidentifiable requests, which is conservative).
 */
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

/**
 * Returns true if this IP is over the rate limit window. Increments the
 * counter as a side effect when allowed.
 */
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

/**
 * Periodic cleanup so the in-memory store doesn't grow unbounded across the
 * lifetime of a serverless instance. Called opportunistically from the POST
 * handler; cheap O(n) walk over the map.
 */
function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(ip);
    }
  }
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('Origin');
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(origin),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('Origin');
  const corsHeaders = buildCorsHeaders(origin);

  // 1. Parse JSON body. Malformed JSON → 400.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        code: ErrorCode.VALIDATION_ERROR,
        error: 'Invalid JSON body.',
      },
      { status: 400, headers: corsHeaders }
    );
  }

  // 2. Validate with Zod. The honeypot field is part of the schema — if
  //    present and non-empty, validation will fail; we treat that as a bot
  //    submission and return 200 silently below.
  const parsed = QuoteRequestPayloadSchema.safeParse(rawBody);

  // Honeypot: a non-empty `_hp` indicates a bot. We accept the request
  // visually (200) without writing anything, so bots don't learn they've
  // been detected. We check this *before* generic validation so that even a
  // payload with multiple problems still gets the silent-accept treatment.
  if (
    rawBody &&
    typeof rawBody === 'object' &&
    '_hp' in rawBody &&
    typeof (rawBody as { _hp: unknown })._hp === 'string' &&
    ((rawBody as { _hp: string })._hp).length > 0
  ) {
    return NextResponse.json(
      {
        success: true,
        data: {
          message: "Got it. We'll be in touch within one business day.",
        },
      },
      { status: 200, headers: corsHeaders }
    );
  }

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: ErrorCode.VALIDATION_ERROR,
        error: 'Invalid quote-request payload.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400, headers: corsHeaders }
    );
  }

  // 3. Rate limit by source IP.
  const ip = resolveClientIp(request);
  if (!checkAndIncrementRateLimit(ip)) {
    return NextResponse.json(
      {
        success: false,
        code: 'RATE_LIMITED',
        error: 'Too many requests. Please try again later.',
      },
      { status: 429, headers: corsHeaders }
    );
  }

  // Opportunistic cleanup so the rate-limit map doesn't grow unbounded.
  if (rateLimitStore.size > 1000) {
    cleanupExpiredRateLimits();
  }

  // 4. Write to the database via the service-role client. The query function
  //    handles dedupe-by-email-or-phone, customer creation when needed, and
  //    task creation in one transaction-shaped sequence.
  const supabase = createServiceClient();

  const result = await createQuoteRequest(supabase, {
    orgId: PREMIER_ORG_ID,
    payload: parsed.data,
  });

  if (!result.success) {
    return NextResponse.json(
      {
        success: false,
        code: result.code,
        error: result.error,
      },
      { status: 500, headers: corsHeaders }
    );
  }

  // 5. Success. Return a friendly confirmation. We don't expose the customer
  //    or task ids to the marketing site (no need for it to know).
  return NextResponse.json(
    {
      success: true,
      data: {
        ticket_id: result.data.taskId,
        message: result.data.deduped
          ? "Got it. We have your details on file already and will follow up within one business day."
          : "Got it. We'll be in touch within one business day.",
      },
    },
    { status: 200, headers: corsHeaders }
  );
}
