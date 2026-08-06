'use client';

// Transitional shell dispatcher (rebuild/base44-exact-ui). AppShell (the
// pre-existing Forge V1.1 nav — app-shell.tsx, app-topbar.tsx,
// app-desktop-nav.tsx, app-bottom-nav.tsx) still wraps every (app) route by
// default. Routes rebuilt on the new Base44-exact shell
// (apps/web/components/forge-shell/ForgeShell.tsx) render their OWN full
// chrome — sidebar, header, mobile nav — so this dispatcher skips AppShell
// for those routes to avoid nesting two navs/two headers inside one
// another. `usePathname()` requires a client component, which is why this
// logic could not stay inline in the (app) layout (a server component).
//
// Shell status after this PR:
//   - New Base44-exact shell (forge-shell/): /customers, /customers/[id]
//   - Old Forge V1.1 shell (AppShell): every other (app) route
// Extend FORGE_SHELL_PREFIXES as more routes migrate to the new shell.
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppShell } from './app-shell';

const FORGE_SHELL_PREFIXES = ['/customers'];

export function ShellRouter({ children, requestsBadge }: { children: ReactNode; requestsBadge?: ReactNode }) {
  const pathname = usePathname();
  const onNewShell = FORGE_SHELL_PREFIXES.some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`));

  if (onNewShell) {
    return <>{children}</>;
  }

  return <AppShell requestsBadge={requestsBadge}>{children}</AppShell>;
}
