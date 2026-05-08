import { NextResponse, type NextRequest } from 'next/server';

import { createServiceClient, createServiceRequest } from '@premier/db';
import { ErrorCode, ServiceRequestPayloadSchema } from '@premier/shared';

const PREMIER_ORG_ID =
  process.env.PREMIER_ORG_ID ?? 'a0000000-0000-0000-0000-000000000001';

const ALLOWED_ORIGINS_PROD = [
  'https://ppmnky.com',
  'https://www.ppmnky.com',
];

const ALLOWED_ORIGINS_DEV = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

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
  if (!allowed) return {};
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

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

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) return false;

  entry.count += 1;
  return true;
}

function cleanupExpiredRateLimits(): void {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(ip);
    }
  }
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request.headers.get('Origin')),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const origin = request.headers.get('Origin');
  const corsHeaders = buildCorsHeaders(origin);

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

  if (
    rawBody &&
    typeof rawBody === 'object' &&
    '_hp' in rawBody &&
    typeof (rawBody as { _hp: unknown })._hp === 'string' &&
    (rawBody as { _hp: string })._hp.length > 0
  ) {
    return NextResponse.json(
      { success: true, serviceRequestId: null },
      { status: 200, headers: corsHeaders }
    );
  }

  const parsed = ServiceRequestPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: ErrorCode.VALIDATION_ERROR,
        error: 'Invalid service-request payload.',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 400, headers: corsHeaders }
    );
  }

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

  if (rateLimitStore.size > 1000) cleanupExpiredRateLimits();

  const result = await createServiceRequest(createServiceClient(), {
    orgId: PREMIER_ORG_ID,
    payload: parsed.data,
  });

  if (!result.success) {
    console.error('Failed to create public service request', {
      code: result.code,
      error: result.error,
    });

    return NextResponse.json(
      {
        success: false,
        code: ErrorCode.DB_ERROR,
        error: 'Could not create the service request. Please try again.',
      },
      { status: 500, headers: corsHeaders }
    );
  }

  return NextResponse.json(
    {
      success: true,
      serviceRequestId: result.data.serviceRequestId,
    },
    { status: 201, headers: corsHeaders }
  );
}
