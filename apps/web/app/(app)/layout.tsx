import { Suspense, type ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppShell } from '@/components/navigation/app-shell';
import { RequestsBadge } from '@/components/navigation/requests-badge';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <AuthGuard>
      <AppShell
        requestsBadge={
          <Suspense fallback={null}>
            <RequestsBadge />
          </Suspense>
        }
      >
        {children}
      </AppShell>
    </AuthGuard>
  );
}
