import { Suspense, type ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { ShellRouter } from '@/components/navigation/shell-router';
import { RequestsBadge } from '@/components/navigation/requests-badge';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <AuthGuard>
      {/* ShellRouter picks AppShell (old Forge V1.1 nav) or no chrome here at
          all (new Base44-exact shell routes render their own, see
          shell-router.tsx) — see that file for the current routes-on-new-shell
          list. */}
      <ShellRouter
        requestsBadge={
          <Suspense fallback={null}>
            <RequestsBadge />
          </Suspense>
        }
      >
        {children}
      </ShellRouter>
    </AuthGuard>
  );
}
