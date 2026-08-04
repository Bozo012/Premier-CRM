'use client';

// Desktop/tablet-landscape navigation shell (Forge V1.1 UX modernization,
// Batch UX-A). Closes the confirmed gap: app-bottom-nav.tsx was the ONLY
// navigation in the app at any viewport width — there has never been a
// desktop nav. Purely additive: renders nothing at any narrower viewport
// (hidden below `md`), so mobile behavior (app-bottom-nav.tsx, unchanged)
// is completely unaffected by this component's existence.
//
// Route set is intentionally broader than the 6-item mobile bottom nav,
// since desktop has room for every top-level section — this is not a
// change to what mobile shows.
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const navItems = [
  { href: '/today', label: 'Today', isActive: (p: string) => p === '/today' },
  { href: '/requests', label: 'Requests', isActive: (p: string) => p.startsWith('/requests') },
  { href: '/customers', label: 'Customers', isActive: (p: string) => p.startsWith('/customers') },
  { href: '/properties', label: 'Properties', isActive: (p: string) => p.startsWith('/properties') },
  { href: '/site-visits', label: 'Site visits', isActive: (p: string) => p.startsWith('/site-visits') },
  { href: '/estimates', label: 'Estimates', isActive: (p: string) => p.startsWith('/estimates') },
  { href: '/quotes', label: 'Quotes', isActive: (p: string) => p.startsWith('/quotes') },
  { href: '/jobs', label: 'Jobs', isActive: (p: string) => p.startsWith('/jobs') },
  { href: '/invoices', label: 'Invoices', isActive: (p: string) => p.startsWith('/invoices') },
  { href: '/services', label: 'Service catalog', isActive: (p: string) => p.startsWith('/services') },
  { href: '/team', label: 'Team', isActive: (p: string) => p.startsWith('/team') },
] as const;

export function AppDesktopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 hidden w-56 shrink-0 flex-col border-r bg-background/95 px-3 py-6 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:flex"
    >
      <div className="px-2 pb-6 text-lg font-semibold tracking-tight">Forge</div>
      <ul className="space-y-0.5">
        {navItems.map((item) => {
          const active = item.isActive(pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'block rounded-md px-2 py-2 text-sm transition-colors',
                  active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
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
