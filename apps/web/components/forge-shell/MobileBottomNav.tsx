'use client'; // usePathname drives active state; Sheet open state is local.

// Ported from Base44 Forge-Base44-UX @ 497d0693 —
// src/components/forge/shared/MobileBottomNav.tsx (the REAL mobile nav —
// src/components/forge/today/MobileNavigation.tsx is dead/unused in Base44
// and was skipped per instructions). Markup/spacing/"More" sheet unchanged.
// Vite -> Next.js conversions: Link/usePathname instead of onNavigate(id);
// `forge-*` tokens swapped for the existing equivalent tokens (see
// ForgeMark.tsx). Sheet primitive is the newly-added
// apps/web/components/ui/sheet.tsx (shadcn/ui, @radix-ui/react-dialog) —
// this repo had no Sheet before this PR.
import {
  Home,
  ClipboardList,
  MapPin,
  FileText,
  MoreHorizontal,
  Users,
  Building2,
  FileSignature,
  Briefcase,
  Receipt,
  BookOpen,
  UsersRound,
  Settings,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@/components/ui/sheet';

import type { MobileNavConfig } from './types';

const iconMap: Record<string, typeof Home> = {
  home: Home,
  clipboard: ClipboardList,
  mapPin: MapPin,
  fileText: FileText,
  more: MoreHorizontal,
  users: Users,
  building: Building2,
  fileSignature: FileSignature,
  briefcase: Briefcase,
  receipt: Receipt,
  bookOpen: BookOpen,
  usersRound: UsersRound,
  settings: Settings,
};

export function MobileBottomNav({ config }: { config: MobileNavConfig }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/today' ? pathname === '/today' : pathname?.startsWith(href));
  const primary = config.primary;
  const secondary = config.secondary;

  return (
    <nav
      aria-label="Mobile primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-nav-border bg-card px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${primary.length}, minmax(0, 1fr))` }}>
        {primary.map((item) => {
          const active = isActive(item.href);
          const Icon = iconMap[item.icon] || ChevronRight;

          if (item.id === 'more') {
            return (
              <Sheet key={item.id}>
                <SheetTrigger asChild>
                  <button
                    type="button"
                    className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold text-muted-foreground transition hover:text-card-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {item.label}
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="flex max-h-[70vh] flex-col gap-0 rounded-t-2xl border-border bg-card p-0 text-card-foreground">
                  <SheetHeader className="border-b border-border px-5 pt-5 text-left">
                    <SheetTitle className="text-base font-bold text-card-foreground">More</SheetTitle>
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {secondary.map((s) => {
                      const SIcon = iconMap[s.icon] || ChevronRight;
                      const sActive = isActive(s.href);
                      return (
                        <SheetClose asChild key={s.id}>
                          <Link
                            href={s.href}
                            aria-current={sActive ? 'page' : undefined}
                            className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sActive ? 'bg-primary/15 text-primary' : 'text-card-foreground hover:bg-muted'}`}
                          >
                            <SIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            {s.label}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </div>
                </SheetContent>
              </Sheet>
            );
          }

          return (
            <Link
              key={item.id}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? 'text-primary' : 'text-muted-foreground hover:text-card-foreground'}`}
            >
              {active && <span className="absolute top-0 h-0.5 w-7 rounded-full bg-primary" aria-hidden="true" />}
              <Icon className="h-5 w-5" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
