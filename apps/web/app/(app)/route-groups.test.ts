/**
 * Regression coverage for the (legacy)/(forge) route-group split (Base44-
 * exact rebuild, PR #125) that replaced the earlier middleware-based shell
 * selection. Source/filesystem-level checks, matching this repo's
 * established pattern (see lib/branding.test.ts) for verifying Next.js App
 * Router structure without a React-rendering test environment.
 *
 * What this proves, and what it deliberately can't:
 *   - CAN prove: every expected route's page.tsx exists in exactly one
 *     route-group folder (never both, never neither); (legacy)/layout.tsx
 *     renders AppShell; (forge)/layout.tsx renders no chrome; the shared
 *     (app)/layout.tsx contains no shell-selection logic and no middleware
 *     reference; no application middleware.ts exists; URL-affecting route
 *     files (page.tsx/layout.tsx segment names) are unchanged since route
 *     groups are stripped from the URL by Next.js.
 *   - CANNOT prove: that a live request actually resolves to the right
 *     rendered shell, that there's no double-render, or that refresh/direct-
 *     URL behave correctly at runtime — those require a running dev server
 *     with real auth and are covered by the (currently unexecuted, see PR
 *     body) Playwright E2E suite instead.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const APP_DIR = path.join(ROOT, 'apps', 'web', 'app', '(app)');

function exists(...segments: string[]): boolean {
  return existsSync(path.join(APP_DIR, ...segments));
}

const LEGACY_ROUTES = [
  'today',
  'jobs',
  'quotes',
  'invoices',
  'expenses',
  'services',
  'settings',
  'site-photos',
  'calendar',
  'activity-logs',
  'estimates',
] as const;

const FORGE_ROUTES = ['customers', 'properties', 'team', 'requests', 'site-visits'] as const;

describe('(app) route-group split — no middleware, no duplicate/missing routes', () => {
  it('has no application middleware.ts anywhere under apps/web', () => {
    expect(exists('..', '..', 'middleware.ts')).toBe(false);
    expect(exists('..', '..', 'middleware.test.ts')).toBe(false);
  });

  it('has no shell-router.tsx (the removed middleware-driven runtime shell picker)', () => {
    expect(existsSync(path.join(ROOT, 'apps', 'web', 'components', 'navigation', 'shell-router.tsx'))).toBe(false);
  });

  it.each(LEGACY_ROUTES)('%s lives under (legacy)/ only, not bare or (forge)/', (route) => {
    expect(exists('(legacy)', route)).toBe(true);
    expect(exists(route)).toBe(false);
    expect(exists('(forge)', route)).toBe(false);
  });

  it.each(FORGE_ROUTES)('%s lives under (forge)/ only, not bare or (legacy)/', (route) => {
    expect(exists('(forge)', route)).toBe(true);
    expect(exists(route)).toBe(false);
    expect(exists('(legacy)', route)).toBe(false);
  });

  it('every legacy route still has a page.tsx (route resolves)', () => {
    for (const route of LEGACY_ROUTES) {
      expect(exists('(legacy)', route, 'page.tsx')).toBe(true);
    }
  });

  it('customers list and detail routes still have page.tsx (route resolves)', () => {
    expect(exists('(forge)', 'customers', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'customers', '[customerId]', 'page.tsx')).toBe(true);
    // /customers/new was never migrated to the new shell — it must still
    // exist, unmoved, so "Add customer" keeps working.
    expect(exists('(forge)', 'customers', 'new', 'page.tsx')).toBe(true);
  });

  it('properties list and detail routes still have page.tsx (route resolves)', () => {
    expect(exists('(forge)', 'properties', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'properties', '[propertyId]', 'page.tsx')).toBe(true);
  });

  it('team list and (new) detail routes have page.tsx (route resolves)', () => {
    expect(exists('(forge)', 'team', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'team', '[memberId]', 'page.tsx')).toBe(true);
  });

  it('requests list/detail/new routes have page.tsx (route resolves)', () => {
    expect(exists('(forge)', 'requests', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'requests', '[taskId]', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'requests', 'new', 'page.tsx')).toBe(true);
  });

  it('site-visits list/detail/inspection routes have page.tsx (route resolves)', () => {
    expect(exists('(forge)', 'site-visits', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'site-visits', '[siteVisitId]', 'page.tsx')).toBe(true);
    expect(exists('(forge)', 'site-visits', '[siteVisitId]', 'inspection', 'page.tsx')).toBe(true);
  });

  it('per-route error/loading boundaries moved with their routes', () => {
    expect(exists('(legacy)', 'invoices', 'error.tsx')).toBe(true);
    expect(exists('(legacy)', 'jobs', 'error.tsx')).toBe(true);
    expect(exists('(forge)', 'customers', 'error.tsx')).toBe(true);
    expect(exists('(forge)', 'customers', 'loading.tsx')).toBe(true);
  });
});

describe('shell assignment — one shell per route-group, verified from source', () => {
  const readSource = (...segments: string[]) => readFileSync(path.join(APP_DIR, ...segments), 'utf-8');

  it('(app)/layout.tsx is an auth/session boundary only — no shell, no middleware header plumbing', () => {
    // Checks actual imports/JSX usage, not arbitrary substrings — the file's
    // own explanatory comment legitimately mentions AppShell/ForgeShell by
    // name when describing where shell selection now happens instead.
    const source = readSource('layout.tsx');
    expect(source).toContain('AuthGuard');
    expect(source).not.toMatch(/^import .*AppShell/m);
    expect(source).not.toMatch(/^import .*ForgeShell/m);
    expect(source).not.toMatch(/^import .*ShellRouter/m);
    expect(source).not.toContain('<AppShell');
    expect(source).not.toContain('<ForgeShell');
    expect(source).not.toContain('x-pathname');
    expect(source).not.toContain('next/headers');
  });

  it('(legacy)/layout.tsx renders AppShell', () => {
    const source = readSource('(legacy)', 'layout.tsx');
    expect(source).toContain('AppShell');
    expect(source).not.toContain('ForgeShell');
  });

  it('(forge)/layout.tsx renders no chrome (each route builds its own ForgeShell)', () => {
    const source = readSource('(forge)', 'layout.tsx');
    expect(source).not.toContain('AppShell');
    expect(source).not.toContain('<ForgeShell');
    // Deliberate pass-through — must not add its own chrome or it would
    // double-wrap every (forge) route's own ForgeShell render.
    expect(source).toContain('{children}');
  });

  it('customers page.tsx builds its own ForgeShell chrome (via CustomersShell)', () => {
    const source = readSource('(forge)', 'customers', 'page.tsx');
    expect(source).toContain('CustomersShell');
  });

  it('properties page.tsx builds its own ForgeShell chrome (via PropertiesShell)', () => {
    const source = readSource('(forge)', 'properties', 'page.tsx');
    expect(source).toContain('PropertiesShell');
  });

  it('team page.tsx builds its own ForgeShell chrome (via TeamShell)', () => {
    const source = readSource('(forge)', 'team', 'page.tsx');
    expect(source).toContain('TeamShell');
  });
});
