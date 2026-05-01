import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';
import { AppBottomNav } from '@/components/navigation/app-bottom-nav';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return (
    <AuthGuard>
      {children}
      <AppBottomNav />
    </AuthGuard>
  );
}
