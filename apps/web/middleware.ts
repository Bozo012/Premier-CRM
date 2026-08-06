import { NextResponse, type NextRequest } from 'next/server';

// Added for rebuild/base44-exact-ui: stamps the request pathname onto a
// response header so the (app) server layout (app/(app)/layout.tsx) can
// decide, server-side, which shell chrome to render (the pre-existing
// AppShell vs. no chrome for routes that render their own new
// Base44-exact ForgeShell) — see components/navigation/shell-router.tsx.
// Server Components have no direct access to the request pathname without
// this; `headers()` only sees what middleware/the platform sets.
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

// Scoped to exactly the (app) route-group's top-level segments — the only
// routes ShellRouter (components/navigation/shell-router.tsx) reads
// x-pathname for. Deliberately NOT a broad "everything except static
// assets" matcher: /api/*, /portal/*, /login, /auth/*, /i/*, /invite/*,
// /q/*, /forgot-password, /update-password, and the customer portal never
// hit this middleware at all, so it cannot affect auth, redirects, or
// session handling on any of them. Root "/" is excluded too — it's a plain
// redirect to /today (app/page.tsx) that resolves before any shell renders.
// Add a new entry here only when a new (app) top-level route segment is
// added; sub-paths are covered automatically via the trailing `/:path*`.
export const config = {
  matcher: [
    '/today/:path*',
    '/customers/:path*',
    '/jobs/:path*',
    '/quotes/:path*',
    '/invoices/:path*',
    '/expenses/:path*',
    '/properties/:path*',
    '/requests/:path*',
    '/services/:path*',
    '/settings/:path*',
    '/site-photos/:path*',
    '/site-visits/:path*',
    '/team/:path*',
    '/calendar/:path*',
    '/activity-logs/:path*',
  ],
};
