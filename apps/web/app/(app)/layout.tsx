import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

// Authentication/session boundary ONLY — no visual shell here. Which shell
// a route gets (legacy AppShell vs. the Base44-exact ForgeShell) is decided
// by which route-group folder the route physically lives in, not by any
// runtime logic in this layout:
//   app/(app)/(legacy)/**  -> app/(app)/(legacy)/layout.tsx renders AppShell
//   app/(app)/(forge)/**   -> app/(app)/(forge)/layout.tsx renders no chrome
//                             (Base44-exact routes render their own full
//                             ForgeShell internally, see customers-shell.tsx)
// Route-group folder names never appear in the URL, so every existing path
// (/today, /customers, /jobs, ...) is unchanged. This replaced an earlier
// middleware-based approach (see PR #125 history) that stamped the request
// pathname onto a header for a Server Component to branch on at runtime —
// removed in favor of this, since Next.js route groups give the same
// per-route-subtree layout control declaratively, with no request-time
// branching, no header plumbing, and no risk of a route ending up with the
// wrong shell (or both, or neither) due to a runtime check being wrong.
export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return <AuthGuard>{children}</AuthGuard>;
}
