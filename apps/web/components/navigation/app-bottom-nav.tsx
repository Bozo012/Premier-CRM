'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/today',
    isActive: (pathname: string) => pathname === '/today',
    label: 'Today',
  },
  {
    href: '/jobs',
    isActive: (pathname: string) => pathname.startsWith('/jobs'),
    label: 'Jobs',
  },
  {
    href: '/quotes',
    isActive: (pathname: string) => pathname.startsWith('/quotes'),
    label: 'Quotes',
  },
  {
    href: '/invoices',
    isActive: (pathname: string) => pathname.startsWith('/invoices'),
    label: 'Invoices',
  },
  {
    href: '/customers',
    isActive: (pathname: string) => pathname.startsWith('/customers'),
    label: 'Customers',
  },
  {
    href: '/requests',
    isActive: (pathname: string) => pathname.startsWith('/requests'),
    label: 'Requests',
  },
] as const;

interface AppBottomNavProps {
  requestsBadge?: ReactNode;
}

export function AppBottomNav({ requestsBadge }: AppBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-6 text-xs">
        {navItems.map((item) => {
          const active = item.isActive(pathname);

          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                className={cn(
                  'inline-flex min-h-14 w-full items-center justify-center gap-1 px-2 py-3 transition-colors',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {item.label}
                {item.href === '/requests' ? requestsBadge : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
