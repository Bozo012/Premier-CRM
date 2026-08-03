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
    <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-6 text-xs">
        {navItems.map((item) => {
          const active = item.isActive(pathname);

          return (
            <li key={item.href} className="flex min-w-0">
              <Link
                href={item.href}
                className={cn(
                  'relative inline-flex min-h-14 w-full min-w-0 items-center justify-center px-0.5 py-3 transition-colors sm:px-2',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {/* Badge floats in the corner instead of sitting inline after the
                    label — inline placement was what caused "Customers" and
                    "Requests" to visually run together on narrow screens, since a
                    2-digit count could push the label wider than its grid column. */}
                {item.href === '/requests' && requestsBadge ? (
                  <span className="absolute right-1 top-1">{requestsBadge}</span>
                ) : null}
                <span className="w-full truncate text-center leading-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
