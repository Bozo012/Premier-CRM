import type { ReactNode } from 'react';

// Application shell (Forge V1.1 UX modernization, Batch UX-A). Composes
// the new desktop nav with the existing, unmodified mobile bottom nav —
// purely additive: every route's own content renders exactly as it did
// before this shell existed; only the persistent chrome around it changes.
// `md:pl-64` reserves space for AppDesktopNav's fixed w-64 sidebar so page
// content never renders underneath it.
import { AppBottomNav } from '@/components/navigation/app-bottom-nav';
import { AppDesktopNav } from '@/components/navigation/app-desktop-nav';
import { AppTopbar } from '@/components/navigation/app-topbar';

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
      {/* AppBottomNav's own file is unmodified — hidden here at `md`+ only
          so the two navs are never shown simultaneously (previously the
          bottom nav rendered at every width by default, not by deliberate
          desktop design, since no desktop nav existed to conflict with). */}
      <div className="md:hidden">
        <AppBottomNav requestsBadge={requestsBadge} />
      </div>
    </div>
  );
}
