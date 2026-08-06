/**
 * Forge/Foundry naming rollout (docs/architecture/forge-foundry-naming-audit.md,
 * docs/architecture/forge-foundry-brand-boundaries.md). These are source-level
 * checks rather than rendered-DOM checks — this repo has no React-rendering
 * test environment configured (vitest.config.ts only runs .test.ts against a
 * plain Node environment), and several of the files below have Next.js/
 * Supabase module-scope dependencies (next/font, server-only clients) that
 * aren't safe to import outside the real Next.js build. Reading the source
 * and asserting on the exact metadata/text is a deliberate, lower-risk
 * alternative that still catches drift or an incomplete rename.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PRODUCT_NAME, ECOSYSTEM_NAME } from '@premier/shared';

const ROOT = path.resolve(__dirname, '..', '..', '..');

function read(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), 'utf-8');
}

describe('brand constants', () => {
  it('PRODUCT_NAME is Forge and ECOSYSTEM_NAME is Foundry', () => {
    expect(PRODUCT_NAME).toBe('Forge');
    expect(ECOSYSTEM_NAME).toBe('Foundry');
  });
});

describe('root/default browser title', () => {
  const layout = read('apps/web/app/layout.tsx');

  it('uses the PRODUCT_NAME constant, not a hardcoded literal, for the default title and template', () => {
    expect(layout).toContain('import { PRODUCT_NAME }');
    expect(layout).toContain('default: PRODUCT_NAME');
    expect(layout).toContain('template: `${PRODUCT_NAME} — %s`');
    expect(layout).not.toContain("'Premier CRM'");
  });

  it('PWA appleWebApp title uses PRODUCT_NAME', () => {
    expect(layout).toContain('title: PRODUCT_NAME');
  });
});

describe('PWA manifest', () => {
  it('name and short_name are Forge', () => {
    const manifest = JSON.parse(read('apps/web/public/manifest.json')) as {
      name: string;
      short_name: string;
    };
    expect(manifest.name).toBe('Forge');
    expect(manifest.short_name).toBe('Forge');
  });
});

describe('representative staff page titles', () => {
  // Paths reflect the (legacy)/(forge) route-group split (Base44-exact
  // rebuild, PR #125) — route groups don't affect the URL, only the file
  // location these string-path checks read from.
  const cases: Array<[string, string]> = [
    ['apps/web/app/(app)/(legacy)/today/page.tsx', 'Today'],
    ['apps/web/app/(app)/(forge)/customers/page.tsx', 'Customers'],
    ['apps/web/app/(app)/(legacy)/properties/page.tsx', 'Properties'],
    ['apps/web/app/(app)/(legacy)/requests/page.tsx', 'Requests'],
    ['apps/web/app/(app)/(legacy)/site-visits/[siteVisitId]/page.tsx', 'Site Visits'],
    ['apps/web/app/(app)/(legacy)/estimates/page.tsx', 'Estimates'],
    ['apps/web/app/(app)/(legacy)/quotes/page.tsx', 'Quotes'],
    ['apps/web/app/(app)/(legacy)/jobs/page.tsx', 'Jobs'],
    ['apps/web/app/(app)/(legacy)/invoices/page.tsx', 'Invoices'],
    ['apps/web/app/(app)/(legacy)/settings/website/page.tsx', 'Settings'],
  ];

  it.each(cases)('%s exports metadata.title = %s (combines with the root template into "Forge — %s")', (file, title) => {
    const source = read(file);
    expect(source).toContain(`export const metadata: Metadata = { title: '${title}' };`);
  });
});

describe('staff sign-in page', () => {
  it('displays the product identity via PRODUCT_NAME, not a hardcoded string', () => {
    const source = read('apps/web/app/login/page.tsx');
    expect(source).toContain('Sign in to {PRODUCT_NAME}');
    expect(source).not.toContain('Sign in to Premier');
  });
});

describe('customer portal stays tenant-branded, not product-branded', () => {
  it('portal doorway redirects unauthenticated customers to the marketing-owned doorway', () => {
    const source = read('apps/web/app/portal/page.tsx');
    expect(source).toContain('buildMarketingPortalUrl');
    expect(source).toContain("redirect('/portal/dashboard')");
    expect(source).not.toContain('Sign in or create account');
  });

  it('portal login route is redirect-only, not a competing Forge sign-in page', () => {
    const source = read('apps/web/app/portal/login/page.tsx');
    expect(source).toContain('buildMarketingPortalUrl');
    expect(source).not.toContain('<form');
    expect(source).not.toContain('Sign in to your customer account');
  });
});

describe('active organization stays separate from product identity', () => {
  it('the org switcher renders tenant data (org.orgName), never a hardcoded brand string', () => {
    const source = read('apps/web/app/(app)/(legacy)/today/_components/org-switcher.tsx');
    expect(source).toContain('{org.orgName}');
    expect(source).not.toMatch(/Forge|Foundry|Premier Property Maintenance/);
  });
});

describe('no public PPM marketing content changed', () => {
  it('the marketing-site references list in the naming audit records zero content changes there', () => {
    const audit = read('docs/architecture/forge-foundry-naming-audit.md');
    expect(audit).toMatch(/No public marketing copy/i);
  });
});
