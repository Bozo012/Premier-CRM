'use client';

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
    href: '/customers',
    isActive: (pathname: string) => pathname.startsWith('/customers'),
    label: 'Customers',
  },
  {
    href: '/properties',
    isActive: (pathname: string) => pathname.startsWith('/properties'),
    label: 'Properties',
  },
] as const;

export function AppBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-3 text-xs">
        {navItems.map((item) => {
          const active = item.isActive(pathname);

          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                className={cn(
                  'min-h-14 w-full px-2 py-3 text-center transition-colors',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
