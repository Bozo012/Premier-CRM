import Link from 'next/link';

import type { QuoteActivityItem, TodayActionItem } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill } from '@/components/ui/status-pill';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

// Presentation-only (Layer 3). Consumes exactly the role-filtered,
// capability-gated result of getTodayActionItems() and the corrected,
// domain-owned result of getTodayQuoteActivity() — never re-implements or
// second-guesses either. Preserves: capability gating (an item is only
// ever rendered because Layer 1 already scoped it to this role), the
// disappears-on-completion behavior (no "dismiss" affordance exists at
// all — an item is simply absent from props once resolved), and org
// scoping (inherited from props).
//
// Fixes a pre-existing overflow bug found during Batch UX-A verification:
// the previous fixed `justify-between` row pushed the action button off
// the right edge of narrow phones when a title/customer name was long.
// Rows now stack vertically below `sm` and go side-by-side at `sm`+.
export function ActionQueue({
  actionItems,
  quoteActivity,
}: {
  actionItems: TodayActionItem[];
  quoteActivity: QuoteActivityItem[];
}) {
  if (actionItems.length === 0 && quoteActivity.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Needs your attention</h2>
        <EmptyState title="Nothing needs your attention right now" description="New tasks will appear here the moment they're actionable." />
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Needs your attention</h2>
      <Card className="border-l-4 border-l-amber-400">
        <CardContent className="divide-y pt-6">
          {actionItems.map((item) => (
            <ActionItemRow key={`${item.kind}-${'estimateId' in item ? item.estimateId : item.quoteId}`} item={item} />
          ))}
          {quoteActivity.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">
                  {entry.isAccepted ? 'Quote accepted — ' : 'Quote declined — '}
                  {entry.label}
                </p>
                {entry.message ? <p className="text-xs text-muted-foreground">{entry.message}</p> : null}
                <StatusPill tone={entry.isAccepted ? 'emerald' : 'amber'}>{entry.isAccepted ? 'Ready to create a job' : 'Declined'}</StatusPill>
              </div>
              <Button asChild size="sm" variant={entry.isAccepted ? 'default' : 'outline'} className="shrink-0">
                <Link href={`/quotes/${entry.quoteId}`}>{entry.isAccepted ? 'Review & create job' : 'View quote'}</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

function ActionItemRow({ item }: { item: TodayActionItem }) {
  if (item.kind === 'pricing_review_requested') {
    return (
      <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {item.estimateNumber} — {item.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {item.customerName ?? 'No customer'} • {formatMoney(item.proposedTotal)}
            {item.submittedByName ? ` • Submitted by ${item.submittedByName}` : ''}
          </p>
          <StatusPill tone="amber">Awaiting your review</StatusPill>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href={`/estimates/${item.estimateId}`}>Review estimate</Link>
        </Button>
      </div>
    );
  }

  if (item.kind === 'create_quote') {
    return (
      <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">
            {item.estimateNumber} — {item.title}
          </p>
          <p className="truncate text-xs text-muted-foreground">{item.customerName ?? 'No customer'}</p>
          <StatusPill tone="emerald">Pricing approved — ready to quote</StatusPill>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link href={`/estimates/${item.estimateId}`}>Create quote</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="truncate text-sm font-medium">{item.quoteNumber ?? item.title ?? 'Quote'}</p>
        <p className="truncate text-xs text-muted-foreground">{item.customerName ?? 'No customer'}</p>
        <StatusPill tone="blue">Draft quote ready — send quote</StatusPill>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link href={`/quotes/${item.quoteId}`}>Send quote</Link>
      </Button>
    </div>
  );
}
