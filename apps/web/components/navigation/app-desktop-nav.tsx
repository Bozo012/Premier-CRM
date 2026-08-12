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
  CalendarDays,
  ClipboardList,
  History,
  Images,
  Flame,
  MapPin,
  MessageSquare,
  Receipt,
  ScrollText,
  Settings,
  Sun,
  Users,
  Users2,
  WalletCards,
  Wrench,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { forgeNavigationLinks } from './navigation-links';

// Route list, active-state logic, and icon assignment stay entirely
// Forge-owned (unchanged from before the Base44 visual integration) —
// only the visual treatment below (nav-* tokens, icons) adopts the
// approved Base44 Today reference. See
// docs/ux/base44-today-sync-and-portability-audit.md — Base44's own
// DesktopNavigation.tsx was NOT ported as a component (it renders a
// second, Today-scoped nav shell); this is a theming-only change to the
// existing, already-shared nav.
const iconsByHref = {
  '/activity-logs': History,
  '/calendar': CalendarDays,
  '/customers': Users,
  '/estimates': ScrollText,
  '/expenses': WalletCards,
  '/invoices': Receipt,
  '/jobs': Briefcase,
  '/messages': MessageSquare,
  '/properties': MapPin,
  '/quotes': ScrollText,
  '/requests': ClipboardList,
  '/routes': MapPin,
  '/services': Settings,
  '/settings': Settings,
  '/site-photos': Images,
  '/site-visits': Wrench,
  '/team': Users2,
  '/today': Sun,
} as const;

const desktopNavItems = forgeNavigationLinks.map((item) => ({
  ...item,
  Icon: iconsByHref[item.href],
  isActive: (pathname: string) => (item.href === '/today' ? pathname === '/today' : pathname.startsWith(item.href)),
}));

export function AppDesktopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-40 hidden w-64 shrink-0 flex-col overflow-y-auto border-r border-nav-border bg-nav px-3 py-6 md:flex"
    >
      <div className="flex items-center gap-2.5 px-2 pb-6">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Flame className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-lg font-bold tracking-tight text-nav-active-foreground">Forge</span>
      </div>
      <ul className="space-y-0.5">
        {desktopNavItems.map(({ href, label, Icon, isActive }) => {
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
