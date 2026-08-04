'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, ClipboardList, Receipt, ScrollText, Sun, Users } from 'lucide-react';

import { cn } from '@/lib/utils';

// Route list, active-state logic, and badge slot stay entirely Forge-owned
// (unchanged from before the Base44 visual integration) — only the visual
// treatment below (nav-* tokens, icons) adopts the approved Base44 Today
// reference. See docs/ux/base44-today-sync-and-portability-audit.md —
// Base44's own MobileNavigation.tsx was NOT ported (it hardcoded its own
// nav-item list internally rather than accepting one as a prop); this
// component's item list remains the single, already-existing Forge source
// of truth, now just themed to match.
const navItems = [
  {
    href: '/today',
    isActive: (pathname: string) => pathname === '/today',
    label: 'Today',
    Icon: Sun,
  },
  {
    href: '/jobs',
    isActive: (pathname: string) => pathname.startsWith('/jobs'),
    label: 'Jobs',
    Icon: Briefcase,
  },
  {
    href: '/quotes',
    isActive: (pathname: string) => pathname.startsWith('/quotes'),
    label: 'Quotes',
    Icon: ScrollText,
  },
  {
    href: '/invoices',
    isActive: (pathname: string) => pathname.startsWith('/invoices'),
    label: 'Invoices',
    Icon: Receipt,
  },
  {
    href: '/customers',
    isActive: (pathname: string) => pathname.startsWith('/customers'),
    label: 'Customers',
    Icon: Users,
  },
  {
    href: '/requests',
    isActive: (pathname: string) => pathname.startsWith('/requests'),
    label: 'Requests',
    Icon: ClipboardList,
  },
] as const;

interface AppBottomNavProps {
  requestsBadge?: ReactNode;
}

export function AppBottomNav({ requestsBadge }: AppBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-nav-border bg-nav pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1"
    >
      <ul className="mx-auto grid w-full max-w-5xl grid-cols-6 text-xs">
        {navItems.map(({ href, label, Icon, isActive }) => {
          const active = isActive(pathname);

          return (
            <li key={href} className="flex min-w-0">
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative inline-flex min-h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 px-0.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2',
                  active ? 'font-bold text-nav-active' : 'text-nav-foreground hover:text-nav-active-foreground'
                )}
              >
                {active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-nav-active" aria-hidden="true" />}
                {/* Badge floats in the corner instead of sitting inline after the
                    label — inline placement was what caused "Customers" and
                    "Requests" to visually run together on narrow screens, since a
                    2-digit count could push the label wider than its grid column. */}
                {href === '/requests' && requestsBadge ? <span className="absolute right-1 top-0">{requestsBadge}</span> : null}
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="w-full truncate text-center text-[11px] font-bold leading-tight">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
