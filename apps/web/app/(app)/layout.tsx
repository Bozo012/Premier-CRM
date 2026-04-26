import type { ReactNode } from 'react';

import { AuthGuard } from '@/components/auth/auth-guard';

interface AuthenticatedLayoutProps {
  children: ReactNode;
}

export default function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  return <AuthGuard>{children}</AuthGuard>;
}
