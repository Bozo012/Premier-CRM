import { Suspense, type ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppBottomNav } from '@/components/navigation/app-bottom-nav';
import { RequestsBadge } from '@/components/navigation/requests-badge';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <AuthGuard>
      {children}
      <AppBottomNav
        requestsBadge={
          <Suspense fallback={null}>
            <RequestsBadge />
          </Suspense>
        }
      />
    </AuthGuard>
  );
}
