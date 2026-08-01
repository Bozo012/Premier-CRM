/**
 * POST /api/client-error-log
 *
 * Diagnostic-only sink for client-side errors (see global-error.tsx and
 * lib/report-client-error.ts). Does a structured console.error, which is
 * what actually makes a client crash visible in Vercel's runtime logs —
 * the missing piece that left the final-invoice-generation crash
 * unroot-caused in a prior investigation (server logs never see browser
 * console output).
 *
 * Hardened per explicit requirement, reusing the exact rate-limit shape
 * already proven in app/api/v1/service-requests/route.ts and
 * .../quote-requests/route.ts, plus additional protections specific to an
 * endpoint that accepts arbitrary error text from any authenticated or
 * unauthenticated client session.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { redact, safePathname } from './redact';

const MAX_BODY_BYTES = 20_000;
const MAX_FIELD_LENGTH = 2000;

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 20;

const DEDUPE_WINDOW_MS = 60 * 1000;

const ClientErrorSchema = z.object({
  message: z.string().min(1).max(MAX_FIELD_LENGTH),
  stack: z.string().max(MAX_FIELD_LENGTH).optional(),
  digest: z.string().max(200).optional(),
  componentStack: z.string().max(MAX_FIELD_LENGTH).optional(),
  url: z.string().max(500).optional(),
});

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const dedupeStore = new Map<string, number>();

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

function cleanupExpiredDedupeEntries(): void {
  const now = Date.now();
  for (const [key, timestamp] of dedupeStore.entries()) {
    if (now - timestamp >= DEDUPE_WINDOW_MS) {
      dedupeStore.delete(key);
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ success: false, error: 'Payload too large.' }, { status: 413 });
  }

  const ip = resolveClientIp(request);
  if (!checkAndIncrementRateLimit(ip)) {
    return NextResponse.json({ success: false, error: 'Too many requests.' }, { status: 429 });
  }

  if (rateLimitStore.size > 1000) {
    cleanupExpiredRateLimits();
  }

  let rawBody: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Payload too large.' }, { status: 413 });
    }
    rawBody = JSON.parse(text);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = ClientErrorSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid error report.' }, { status: 400 });
  }

  const { message, stack, digest, componentStack, url } = parsed.data;
  const safeUrl = safePathname(url);

  const dedupeKey = `${ip}:${message}:${digest ?? ''}:${safeUrl ?? ''}`;
  const now = Date.now();
  const lastSeen = dedupeStore.get(dedupeKey);
  if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
    return new NextResponse(null, { status: 204 });
  }
  dedupeStore.set(dedupeKey, now);
  if (dedupeStore.size > 1000) {
    cleanupExpiredDedupeEntries();
  }

  console.error('[client-error]', {
    message: redact(message),
    stack: stack ? redact(stack) : undefined,
    digest,
    componentStack: componentStack ? redact(componentStack) : undefined,
    url: safeUrl,
  });

  return new NextResponse(null, { status: 204 });
}
