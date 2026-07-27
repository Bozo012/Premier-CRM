import { describe, expect, it } from 'vitest';

import { normalizeRedirectPath } from './auth-routing';

describe('normalizeRedirectPath', () => {
  it('accepts a valid internal path', () => {
    expect(normalizeRedirectPath('/invite/abc-123/continue')).toBe('/invite/abc-123/continue');
  });

  it('accepts a valid internal path with a query string', () => {
    expect(normalizeRedirectPath('/today?tab=jobs')).toBe('/today?tab=jobs');
  });

  it('rejects a protocol-relative URL (//evil.com) and falls back', () => {
    expect(normalizeRedirectPath('//evil.com')).toBe('/today');
  });

  it('rejects a backslash-prefixed protocol-relative URL (/\\evil.com) and falls back', () => {
    expect(normalizeRedirectPath('/\\evil.com')).toBe('/today');
  });

  it('rejects an absolute external URL and falls back', () => {
    expect(normalizeRedirectPath('https://evil.com')).toBe('/today');
    expect(normalizeRedirectPath('http://evil.com/phish')).toBe('/today');
  });

  it('rejects empty and null input and falls back', () => {
    expect(normalizeRedirectPath('')).toBe('/today');
    expect(normalizeRedirectPath(null)).toBe('/today');
    expect(normalizeRedirectPath(undefined)).toBe('/today');
  });

  it('honors a custom fallback', () => {
    expect(normalizeRedirectPath(null, '/login')).toBe('/login');
    expect(normalizeRedirectPath('//evil.com', '/login')).toBe('/login');
  });
});
