import type { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { POST, redact, safePathname } from './route';

function buildRequest(body: unknown, ip: string): NextRequest {
  return new Request('https://app.ppmnky.com/api/client-error-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('redact', () => {
  it('strips email addresses', () => {
    expect(redact('failed for user@example.com')).toBe('failed for [redacted-email]');
  });

  it('strips bearer tokens', () => {
    expect(redact('Authorization: Bearer abc123DEF456')).toBe(
      'Authorization: Bearer [redacted-token]'
    );
  });

  it('strips long opaque alphanumeric tokens', () => {
    expect(redact('token=aVeryLongOpaqueToken1234567890abcdef')).toBe('token=[redacted-token]');
  });

  it('leaves ordinary short text untouched', () => {
    expect(redact('Cannot read properties of undefined')).toBe(
      'Cannot read properties of undefined'
    );
  });
});

describe('safePathname', () => {
  it('accepts a bare pathname as-is', () => {
    expect(safePathname('/jobs/123')).toBe('/jobs/123');
  });

  it('accepts a same-origin absolute URL and returns only the pathname', () => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    expect(safePathname(`${appUrl}/invoices/456`)).toBe('/invoices/456');
  });

  it('rejects a cross-origin absolute URL', () => {
    expect(safePathname('https://evil.com/steal')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(safePathname(undefined)).toBeNull();
  });
});

describe('POST /api/client-error-log', () => {
  it('accepts a valid report and returns 204', async () => {
    const response = await POST(buildRequest({ message: 'Something broke' }, '198.51.100.1'));
    expect(response.status).toBe(204);
  });

  it('rejects a payload missing the required message field', async () => {
    const response = await POST(buildRequest({ stack: 'no message here' }, '198.51.100.2'));
    expect(response.status).toBe(400);
  });

  it('rejects invalid JSON', async () => {
    const request = new Request('https://app.ppmnky.com/api/client-error-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    }) as NextRequest;

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it('deduplicates an identical report from the same IP within the dedupe window', async () => {
    const ip = '198.51.100.3';
    const first = await POST(buildRequest({ message: 'Duplicate crash' }, ip));
    const second = await POST(buildRequest({ message: 'Duplicate crash' }, ip));

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);

    const consoleSpy = vi.spyOn(console, 'error');
    await POST(buildRequest({ message: 'Duplicate crash' }, ip));
    // Only the first call for this exact (ip, message, digest, url) key
    // should have logged — later identical reports within the window are
    // silently dropped, not re-logged.
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('rate-limits after the configured number of requests from one IP', async () => {
    const ip = '198.51.100.4';
    let lastStatus = 200;
    for (let i = 0; i < 25; i += 1) {
      const response = await POST(buildRequest({ message: `crash ${i}` }, ip));
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });
});
