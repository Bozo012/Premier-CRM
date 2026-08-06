import { Suspense, type ReactNode } from 'react';

import { AppShell } from '@/components/navigation/app-shell';
import { RequestsBadge } from '@/components/navigation/requests-badge';

interface LegacyLayoutProps {
  children: ReactNode;
}

// Every route under app/(app)/(legacy)/ renders the pre-existing Forge V1.1
// AppShell (desktop nav + topbar + mobile bottom nav). This is the shell
// every route had before the Base44-exact rebuild started; nothing in this
// file changes that behavior, it only moves the wrapping from the shared
// (app)/layout.tsx (which used to runtime-branch via ShellRouter) into a
// route-group-owned layout that always renders this shell, for every route
// physically located under (legacy)/.
export default function LegacyLayout({ children }: LegacyLayoutProps) {
  return (
    <AppShell
      requestsBadge={
        <Suspense fallback={null}>
          <RequestsBadge />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
