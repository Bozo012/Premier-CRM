import Link from 'next/link';

import { PORTAL_NAV_LINKS } from '../_lib/portal-nav-links';

// Server component: real navigation, no client state. Desktop renders the
// full sidebar list; mobile renders only the 4 primary links inline plus a
// native <details> "More" disclosure for the rest — no client JS needed for
// a simple show/hide, keeping this out of the "use client" boundary.
export function PortalNav({ activeId }: { activeId: string }) {
  const primary = PORTAL_NAV_LINKS.filter((link) => link.primary);
  const secondary = PORTAL_NAV_LINKS.filter((link) => !link.primary);

  return (
    <>
      <nav
        aria-label="Portal navigation"
        className="hidden w-56 shrink-0 flex-col gap-1 border-r bg-[#171717] px-3 py-6 text-sm text-neutral-200 md:flex"
      >
        {PORTAL_NAV_LINKS.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            className={`rounded-md px-3 py-2 transition-colors hover:bg-white/10 ${
              activeId === link.id ? 'bg-[#ea580c] text-white' : ''
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <nav
        aria-label="Portal navigation"
        className="fixed inset-x-0 bottom-0 z-10 flex items-stretch justify-around border-t bg-[#171717] text-xs text-neutral-200 md:hidden"
      >
        {primary.map((link) => (
          <Link
            key={link.id}
            href={link.href}
            className={`flex-1 px-2 py-3 text-center ${activeId === link.id ? 'text-[#ea580c]' : ''}`}
          >
            {link.label}
          </Link>
        ))}
        <details className="group relative flex-1">
          <summary className="list-none px-2 py-3 text-center">More</summary>
          <div className="absolute bottom-full right-0 mb-1 w-44 rounded-md border bg-[#171717] p-2 shadow-lg">
            {secondary.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className={`block rounded px-3 py-2 text-left hover:bg-white/10 ${
                  activeId === link.id ? 'text-[#ea580c]' : ''
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </details>
      </nav>
    </>
  );
}
