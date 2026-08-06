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

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icon-.*\\.png).*)'],
};
