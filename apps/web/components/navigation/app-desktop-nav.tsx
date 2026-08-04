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
import {
  Briefcase,
  ClipboardList,
  Flame,
  MapPin,
  Receipt,
  ScrollText,
  Settings,
  Sun,
  Users,
  Users2,
  Wrench,
} from 'lucide-react';

import { cn } from '@/lib/utils';

// Route list, active-state logic, and icon assignment stay entirely
// Forge-owned (unchanged from before the Base44 visual integration) —
// only the visual treatment below (nav-* tokens, icons) adopts the
// approved Base44 Today reference. See
// docs/ux/base44-today-sync-and-portability-audit.md — Base44's own
// DesktopNavigation.tsx was NOT ported as a component (it renders a
// second, Today-scoped nav shell); this is a theming-only change to the
// existing, already-shared nav.
const navItems = [
  { href: '/today', label: 'Today', Icon: Sun, isActive: (p: string) => p === '/today' },
  { href: '/requests', label: 'Requests', Icon: ClipboardList, isActive: (p: string) => p.startsWith('/requests') },
  { href: '/customers', label: 'Customers', Icon: Users, isActive: (p: string) => p.startsWith('/customers') },
  { href: '/properties', label: 'Properties', Icon: MapPin, isActive: (p: string) => p.startsWith('/properties') },
  { href: '/site-visits', label: 'Site visits', Icon: Wrench, isActive: (p: string) => p.startsWith('/site-visits') },
  { href: '/estimates', label: 'Estimates', Icon: ScrollText, isActive: (p: string) => p.startsWith('/estimates') },
  { href: '/quotes', label: 'Quotes', Icon: ScrollText, isActive: (p: string) => p.startsWith('/quotes') },
  { href: '/jobs', label: 'Jobs', Icon: Briefcase, isActive: (p: string) => p.startsWith('/jobs') },
  { href: '/invoices', label: 'Invoices', Icon: Receipt, isActive: (p: string) => p.startsWith('/invoices') },
  { href: '/services', label: 'Service catalog', Icon: Settings, isActive: (p: string) => p.startsWith('/services') },
  { href: '/team', label: 'Team', Icon: Users2, isActive: (p: string) => p.startsWith('/team') },
] as const;

export function AppDesktopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 hidden w-56 shrink-0 flex-col border-r border-nav-border bg-nav px-3 py-6 md:flex"
    >
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Flame className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-lg font-bold tracking-tight text-nav-active-foreground">Forge</span>
      </div>
      <ul className="space-y-0.5">
        {navItems.map(({ href, label, Icon, isActive }) => {
          const active = isActive(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'bg-primary/[0.17] font-bold text-nav-active-foreground shadow-[inset_3px_0_0_0_hsl(var(--primary))]'
                    : 'font-medium text-nav-foreground hover:bg-white/[0.06] hover:text-nav-active-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
