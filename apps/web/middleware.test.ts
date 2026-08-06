import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { config, middleware } from './middleware';

// Regression coverage for the Base44-exact shell rebuild's middleware
// (see the file's own header comment for why it exists at all): it must
// stay narrowly scoped to the (app) route-group's real routes, must never
// redirect, and must never touch anything auth/session/portal/API-related.

function buildRequest(pathname: string): NextRequest {
  return new NextRequest(new URL(pathname, 'https://app.example.com'));
}

describe('middleware', () => {
  it('stamps x-pathname onto the forwarded request headers, not a response header', () => {
    const response = middleware(buildRequest('/customers'));
    expect(response.headers.get('x-pathname')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-pathname')).toBe('/customers');
  });

  it('carries the exact pathname through for a dynamic detail route', () => {
    const response = middleware(buildRequest('/customers/11111111-1111-1111-1111-111111111111'));
    expect(response.headers.get('x-middleware-request-x-pathname')).toBe(
      '/customers/11111111-1111-1111-1111-111111111111'
    );
  });

  it('never redirects — always NextResponse.next()', () => {
    const response = middleware(buildRequest('/customers'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('does not set any Set-Cookie, auth, or session header', () => {
    const response = middleware(buildRequest('/customers'));
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

describe('middleware matcher scope', () => {
  it('covers every (app) route-group top-level segment', () => {
    const expectedSegments = [
      'today',
      'customers',
      'jobs',
      'quotes',
      'invoices',
      'expenses',
      'properties',
      'requests',
      'services',
      'settings',
      'site-photos',
      'site-visits',
      'team',
      'calendar',
      'activity-logs',
    ];
    for (const segment of expectedSegments) {
      expect(config.matcher).toContain(`/${segment}/:path*`);
    }
    expect(config.matcher).toHaveLength(expectedSegments.length);
  });

  it('does not include a catch-all "everything except static assets" pattern', () => {
    for (const pattern of config.matcher) {
      expect(pattern.startsWith('/((?!')).toBe(false);
    }
  });

  it('does not include portal, api, auth, login, or public routes', () => {
    const forbiddenPrefixes = ['/portal', '/api', '/auth', '/login', '/i', '/invite', '/q', '/forgot-password', '/update-password'];
    for (const pattern of config.matcher) {
      for (const forbidden of forbiddenPrefixes) {
        expect(pattern.startsWith(`${forbidden}/`) || pattern === forbidden).toBe(false);
      }
    }
  });

  it('does not include the bare "/" route', () => {
    expect(config.matcher).not.toContain('/');
    expect(config.matcher).not.toContain('/:path*');
  });
});
