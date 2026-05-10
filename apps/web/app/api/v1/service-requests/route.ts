/**
 * POST /api/v1/service-requests
 *
 * Compatibility endpoint for the marketing site's existing RequestService form.
 * Keeps the website payload contract stable while mapping into the CRM's
 * internal quote-request workflow.
 */

import { NextResponse, type NextRequest } from 'next/server';

import {
  ErrorCode,
  WebsiteServiceRequestPayloadSchema,
  type QuoteRequestPayload,
  type WebsiteServiceRequestPayload,
} from '@premier/shared';
import { createQuoteRequest, createServiceClient } from '@premier/db';

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
  if (real) {
    return real.trim();
  }

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

function cleanupExpiredRateLimits(): void {
  const now = Date.now();

  for (const [ip, entry] of rateLimitStore.entries()) {
    if (now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(ip);
    }
  }
}

function mapPropertyType(value: WebsiteServiceRequestPayload['propertyType']) {
  switch (value) {
    case 'single-family':
      return 'single_family' as const;
    case 'multi-family':
      return 'multi_family' as const;
    case 'commercial':
      return 'commercial' as const;
    default:
      return 'other' as const;
  }
}

function mapTimeline(value: WebsiteServiceRequestPayload['priorityLevel']) {
  switch (value) {
    case 'emergency':
      return 'asap' as const;
    case 'urgent':
      return 'this_week' as const;
    case 'normal':
      return 'this_month' as const;
    default:
      return 'flexible' as const;
  }
}

function toQuoteRequestPayload(
  payload: WebsiteServiceRequestPayload
): QuoteRequestPayload {
  const customerName = `${payload.firstName} ${payload.lastName}`.trim();
  const descriptionLines = [
    `Preferred contact method: ${payload.preferredContactMethod}`,
    `Customer type: ${payload.customerType}`,
    `Property address: ${payload.addressLine1}, ${payload.city}, ${payload.state} ${payload.zipCode}`,
    `Property type: ${payload.propertyType}`,
    `Priority level: ${payload.priorityLevel}`,
    payload.preferredDateTime
      ? `Preferred date/time: ${payload.preferredDateTime}`
      : null,
    payload.accessInstructions
      ? `Access instructions: ${payload.accessInstructions}`
      : null,
    '',
    payload.problemDescription,
    payload.additionalNotes
      ? `Additional notes: ${payload.additionalNotes}`
      : null,
  ].filter(Boolean);

  return {
    name: customerName,
    email: payload.emailAddress,
    phone: payload.phoneNumber,
    property_type: mapPropertyType(payload.propertyType),
    timeline: mapTimeline(payload.priorityLevel),
    service_needed: payload.serviceCategory,
    description: descriptionLines.join('\n'),
  };
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: buildCorsHeaders(request.headers.get('Origin')),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const corsHeaders = buildCorsHeaders(request.headers.get('Origin'));

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
      {
        success: true,
        data: {
          ticket_id: null,
          message: "Got it. We'll follow up within one business day.",
        },
      },
      { status: 200, headers: corsHeaders }
    );
  }

  const parsed = WebsiteServiceRequestPayloadSchema.safeParse(rawBody);
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

  if (rateLimitStore.size > 1000) {
    cleanupExpiredRateLimits();
  }

  const supabase = createServiceClient();
  const result = await createQuoteRequest(supabase, {
    orgId: PREMIER_ORG_ID,
    payload: toQuoteRequestPayload(parsed.data),
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

  return NextResponse.json(
    {
      success: true,
      data: {
        ticket_id: result.data.taskId,
        message: result.data.deduped
          ? "Got it. We have your details on file already and will follow up within one business day."
          : "Got it. We'll follow up within one business day.",
      },
    },
    { status: 200, headers: corsHeaders }
  );
}
