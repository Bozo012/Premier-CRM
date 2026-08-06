// Server component: no hooks/handlers of its own, so no 'use client' — the
// interactive pieces (DesktopNavigation, MobileBottomNav, ForgeHeader) are
// each their own client components.

// Adapted from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/shared/ForgeShell.tsx. Composition (sidebar + header
// + content + mobile bottom nav) unchanged. Dropped: CreateFlowProvider
// (Base44's generic multi-record-type create-sheet host) — see
// ForgeHeader.tsx for why; `forge-today`/`forge-dark` scoping wrapper divs
// — dropped for the same reason as ProfileSheet.tsx (tokens are already
// global here, not per-component-scoped).
import type { ReactNode } from 'react';

import { DesktopNavigation } from './DesktopNavigation';
import { ForgeHeader } from './ForgeHeader';
import { MobileBottomNav } from './MobileBottomNav';
import type { ForgeShellCallbacks, ForgeShellData, MobileNavConfig } from './types';

export function ForgeShell({
  shellData,
  callbacks,
  mobileNav,
  children,
}: {
  shellData: ForgeShellData;
  callbacks: ForgeShellCallbacks;
  mobileNav: MobileNavConfig;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <DesktopNavigation items={shellData.navigation} />
      <div className="min-w-0 lg:pl-64">
        <ForgeHeader data={shellData} callbacks={callbacks} />
        {children}
        <MobileBottomNav config={mobileNav} />
      </div>
    </div>
  );
}
