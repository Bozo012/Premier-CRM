import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { todayBrowseLinks } from '@/components/navigation/navigation-links';

export function BrowseForge() {
  return (
    <aside className="space-y-6">
      <section aria-labelledby="browse-heading">
        <h2 id="browse-heading" className="mb-3 text-sm font-bold uppercase tracking-[.14em] text-muted-foreground">
          Browse Forge
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card">
          {todayBrowseLinks.map((item, index) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex min-h-11 w-full items-center justify-between px-4 text-left text-sm font-semibold text-card-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                index ? 'border-t' : '',
              ].join(' ')}
            >
              {item.label}
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </aside>
  );
}
