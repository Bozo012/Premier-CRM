import Link from 'next/link';

import type { TodayActionItem } from '@premier/db';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

import { StatusPill } from './status-pill';

export interface QuoteActivityRow {
  id: string;
  quoteId: string;
  label: string;
  message: string | null;
  isAccepted: boolean;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

// Presentation-only. Consumes exactly the role-filtered, capability-gated
// result of getTodayActionItems() (handoff doc §5) and the already-computed
// pendingQuoteActivity list — never re-implements or second-guesses either
// filter client-side. Preserves: capability gating (an item is only ever
// rendered because the query already scoped it to this role), the
// disappears-on-completion behavior (this component has no "dismiss"
// affordance at all — the item is simply absent from its props once the
// underlying condition clears), and org scoping (inherited from props).
export function ActionQueue({
  actionItems,
  quoteActivity,
}: {
  actionItems: TodayActionItem[];
  quoteActivity: QuoteActivityRow[];
}) {
  if (actionItems.length === 0 && quoteActivity.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        Needs your attention
      </h2>
      <Card className="border-l-4 border-l-amber-400">
        <CardContent className="divide-y pt-6">
          {actionItems.map((item) => (
            <ActionItemRow key={`${item.kind}-${'estimateId' in item ? item.estimateId : item.quoteId}`} item={item} />
          ))}
          {quoteActivity.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {entry.isAccepted ? 'Quote accepted — ' : 'Quote declined — '}
                  {entry.label}
                </p>
                {entry.message ? <p className="text-xs text-muted-foreground">{entry.message}</p> : null}
                <StatusPill tone={entry.isAccepted ? 'emerald' : 'amber'}>
                  {entry.isAccepted ? 'Ready to create a job' : 'Declined'}
                </StatusPill>
              </div>
              <Button asChild size="sm" variant={entry.isAccepted ? 'default' : 'outline'}>
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
      <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {item.estimateNumber} — {item.title}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.customerName ?? 'No customer'} • {formatMoney(item.proposedTotal)}
            {item.submittedByName ? ` • Submitted by ${item.submittedByName}` : ''}
          </p>
          <StatusPill tone="amber">Awaiting your review</StatusPill>
        </div>
        <Button asChild size="sm">
          <Link href={`/estimates/${item.estimateId}`}>Review estimate</Link>
        </Button>
      </div>
    );
  }

  if (item.kind === 'create_quote') {
    return (
      <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {item.estimateNumber} — {item.title}
          </p>
          <p className="text-xs text-muted-foreground">{item.customerName ?? 'No customer'}</p>
          <StatusPill tone="emerald">Pricing approved — ready to quote</StatusPill>
        </div>
        <Button asChild size="sm">
          <Link href={`/estimates/${item.estimateId}`}>Create quote</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="space-y-1">
        <p className="text-sm font-medium">{item.quoteNumber ?? item.title ?? 'Quote'}</p>
        <p className="text-xs text-muted-foreground">{item.customerName ?? 'No customer'}</p>
        <StatusPill tone="blue">Draft quote ready — send quote</StatusPill>
      </div>
      <Button asChild size="sm">
        <Link href={`/quotes/${item.quoteId}`}>Send quote</Link>
      </Button>
    </div>
  );
}
