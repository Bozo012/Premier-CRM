'use client'; // usePathname drives the active nav item, and Next.js requires client components for that hook.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/today/DesktopNavigation.tsx. Markup/spacing/hover
// treatment unchanged. Two Vite -> Next.js App Router conversions:
//   1. Navigation is real <Link href> + usePathname() instead of an
//      onNavigate(id) callback resolved through a fixture id->route map
//      (Base44's getForgeRoute) — this repo's existing app-desktop-nav.tsx
//      already established that Link/usePathname pattern for this app.
//   2. `forge-*` Tailwind classes swapped for the equivalent existing
//      tokens (bg-nav, text-nav-foreground, bg-primary/[0.17], ring-ring) —
//      see ForgeMark.tsx for why no new CSS was required.
import { ArrowUpRight, LayoutDashboard, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ForgeMark } from './ForgeMark';
import type { NavigationDestination } from './types';

export function DesktopNavigation({ items }: { items: NavigationDestination[] }) {
  const pathname = usePathname();
  const allItems = [{ id: 'today', label: 'Today', href: '/today', Icon: Sun }, ...items.map((item) => ({ ...item, Icon: LayoutDashboard }))];

  return (
    <aside className="hidden min-h-screen w-64 shrink-0 flex-col border-r border-nav-border bg-nav px-4 py-6 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:overflow-y-auto">
      <ForgeMark />
      <nav aria-label="Primary" className="mt-9 space-y-1">
        {allItems.map((item) => {
          const active = item.href === '/today' ? pathname === '/today' : pathname?.startsWith(item.href);
          const Icon = item.Icon;
          if (active) {
            return (
              <span
                key={item.id}
                aria-current="page"
                className="flex min-h-11 w-full items-center gap-3 rounded-xl bg-primary/[0.17] px-3 text-left text-sm font-bold text-nav-active-foreground shadow-[inset_3px_0_0_0_hsl(var(--primary))]"
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left text-sm font-medium text-nav-foreground transition hover:bg-white/[0.06] hover:text-nav-active-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span>{item.label}</span>
              <ArrowUpRight className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
