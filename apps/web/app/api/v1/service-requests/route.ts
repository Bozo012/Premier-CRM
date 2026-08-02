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
  type ServiceRequestPayload,
  type WebsiteServiceRequestPayload,
} from '@premier/shared';
import { createServiceRequest, createServiceClient } from '@premier/db';

import { sendServiceRequestSubmittedNotification } from '@/lib/customer-lifecycle-notifications';

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

function mapPropertyType(
  value: WebsiteServiceRequestPayload['propertyType']
): ServiceRequestPayload['property_type'] {
  switch (value) {
    case 'single-family':
      return 'single_family';
    case 'multi-family':
      return 'multi_family';
    case 'commercial':
      return 'commercial';
    default:
      return 'other';
  }
}

function mapPriority(
  value: WebsiteServiceRequestPayload['priorityLevel']
): ServiceRequestPayload['priority'] {
  switch (value) {
    case 'emergency':
      return 'emergency';
    case 'urgent':
      return 'high';
    case 'normal':
      return 'normal';
    default:
      return 'normal';
  }
}

/**
 * A datetime-local value ("YYYY-MM-DDTHH:mm") carries no timezone — it is
 * already the customer's intended wall-clock date/time, not a UTC instant
 * that needs converting. The org's timezone is loaded and threaded through
 * here for architectural correctness and so a future feature that DOES need
 * a real timestamptz (e.g. auto-suggesting a site-visit slot) has it
 * available — but for the two plain columns this populates (`preferred_date`
 * DATE, `preferred_time` TEXT), splitting the string directly is not just
 * sufficient but strictly safer than constructing a `Date` object: `new
 * Date(str)` would be interpreted in whatever timezone the Node process
 * happens to be running in (browser or server local time), which is exactly
 * the naive-parsing bug this fix exists to close. Never build a `Date` from
 * this string anywhere in this function.
 */
function parsePreferredDateTime(
  raw: string,
  _orgTimezone: string
): { preferredDate?: string; preferredTime?: string } {
  if (!raw) return {};
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return {};

  const [, datePart, hourStr, minuteStr] = match as unknown as [string, string, string, string];
  const hour24 = Number(hourStr);
  const period = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const preferredTime = `${hour12}:${minuteStr.padStart(2, '0')} ${period}`;

  return { preferredDate: datePart, preferredTime };
}

function toServiceRequestPayload(
  payload: WebsiteServiceRequestPayload,
  orgTimezone: string
): ServiceRequestPayload {
  const name = `${payload.firstName} ${payload.lastName}`.trim();

  const descriptionParts = [payload.problemDescription];
  if (payload.additionalNotes) {
    descriptionParts.push(`Additional notes: ${payload.additionalNotes}`);
  }
  // The raw datetime-local string is never appended to free-text description
  // anymore — it's parsed into the structured preferred_date/preferred_time
  // columns below, which already exist for exactly this purpose.

  const { preferredDate, preferredTime } = parsePreferredDateTime(payload.preferredDateTime, orgTimezone);

  return {
    name,
    email: payload.emailAddress,
    phone: payload.phoneNumber,
    address_line_1: payload.addressLine1,
    city: payload.city,
    state: payload.state,
    zip: payload.zipCode,
    country: 'US',
    property_type: mapPropertyType(payload.propertyType),
    service_category: payload.serviceCategory,
    service_title: payload.serviceCategory ?? 'Service Request',
    service_description: descriptionParts.join('\n\n'),
    preferred_date: preferredDate,
    preferred_time: preferredTime,
    access_notes: payload.accessInstructions ?? undefined,
    priority: mapPriority(payload.priorityLevel),
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

  const { data: org } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', PREMIER_ORG_ID)
    .maybeSingle();
  const orgTimezone = org?.timezone ?? 'UTC';

  const result = await createServiceRequest(supabase, {
    orgId: PREMIER_ORG_ID,
    payload: toServiceRequestPayload(parsed.data, orgTimezone),
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

  await sendServiceRequestSubmittedNotification({
    customerEmail: parsed.data.emailAddress,
    customerName: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
    preferredDateTime: parsed.data.preferredDateTime || null,
    propertyAddress: [parsed.data.addressLine1, `${parsed.data.city}, ${parsed.data.state} ${parsed.data.zipCode}`]
      .filter(Boolean)
      .join(', '),
    requestNumber: result.data.requestNumber,
    serviceTitle: parsed.data.serviceCategory,
  });

  return NextResponse.json(
    {
      success: true,
      data: {
        ticket_id: result.data.serviceRequestId,
        message: result.data.dedupedCustomer
          ? "Got it. We have your details on file already and will follow up within one business day."
          : "Got it. We'll follow up within one business day.",
      },
    },
    { status: 200, headers: corsHeaders }
  );
}
