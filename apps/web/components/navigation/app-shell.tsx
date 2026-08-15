import type { ReactNode } from 'react';

// Application shell (Forge V1.1 UX modernization, Batch UX-A; mobile-nav
// route-parity fix). Composes the desktop nav with the shared
// MobileBottomNav (the same "primary + More sheet" component every (forge)
// route already uses) — purely additive: every route's own content renders
// exactly as it did before this shell existed; only the persistent chrome
// around it changes. `md:pl-64` reserves space for AppDesktopNav's fixed
// w-64 sidebar so page content never renders underneath it.
//
// Previously this rendered app-bottom-nav.tsx, a hardcoded 6-item bar with
// no "More" affordance — meaning every (forge) route beyond those 6
// (Properties, Site Visits, Estimates, Service Catalog, Calendar, Route
// Planning, Messages, Expenses, Team, Settings, plus the other three
// (legacy) routes: Activity Logs, Site Photos, Settings itself) was
// unreachable through normal mobile navigation from Today (the default
// post-login landing page) or from any other (legacy) route. Swapping to
// MobileBottomNav + buildMobileNavConfig() (navigation-links.ts, the same
// single source every (forge) route's shell already builds from) closes
// that gap without inventing a third nav list. app-bottom-nav.tsx (the
// hardcoded 6-item bar) is deleted outright — grep confirmed nothing else
// imported it once this shell stopped rendering it.
import { AppDesktopNav } from '@/components/navigation/app-desktop-nav';
import { AppTopbar } from '@/components/navigation/app-topbar';
import { buildMobileNavConfig } from '@/components/navigation/navigation-links';
import { MobileBottomNav } from '@/components/forge-shell/MobileBottomNav';

const MOBILE_NAV_CONFIG = buildMobileNavConfig();

export function AppShell({
  children,
  requestsBadge,
}: {
  children: ReactNode;
  requestsBadge?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppDesktopNav />
      <div className="min-w-0 md:pl-64">
        <AppTopbar />
        {children}
      </div>
      {/* Hidden at `md`+ only, matching AppDesktopNav's own `md:flex` —
          the two navs are never shown simultaneously. */}
      <div className="md:hidden">
        <MobileBottomNav config={MOBILE_NAV_CONFIG} badges={requestsBadge ? { requests: requestsBadge } : undefined} />
      </div>
    </div>
  );
}
