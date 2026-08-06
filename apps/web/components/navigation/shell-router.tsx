// Server-only helper (no 'use client' — this must run in the (app) layout,
// a Server Component, so it can conditionally render AppShell, itself a
// Server Component that calls next/headers-backed getServerSupabase()).
//
// A client component CANNOT import and instantiate a Server Component
// module directly (Next.js has to bundle it for the browser, which fails
// the moment that module touches a server-only API like next/headers) — so
// the pathname check has to happen server-side too. Since Server Components
// have no direct access to the request pathname, middleware.ts stamps it
// onto an `x-pathname` request header, read here via next/headers.
//
// Shell status after this PR:
//   - New Base44-exact shell (forge-shell/): /customers (list) and
//     /customers/[uuid] (detail) — these two routes render their own full
//     ForgeShell chrome via CustomersShell, so isOnNewShell() returning true
//     means "render children directly, no AppShell wrapper".
//   - Old Forge V1.1 shell (AppShell): every other (app) route.
// Extend CUSTOMER_DETAIL_PATTERN / the exact-path check as more routes
// migrate to the new shell.
import { headers } from 'next/headers';
import type { ReactNode } from 'react';

import { AppShell } from './app-shell';

const CUSTOMER_DETAIL_PATTERN = /^\/customers\/[0-9a-f-]{8,}$/i;

function isOnNewShell(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === '/customers') return true;
  return CUSTOMER_DETAIL_PATTERN.test(pathname);
}

export async function ShellRouter({ children, requestsBadge }: { children: ReactNode; requestsBadge?: ReactNode }) {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname');

  if (isOnNewShell(pathname)) {
    return <>{children}</>;
  }

  return <AppShell requestsBadge={requestsBadge}>{children}</AppShell>;
}
