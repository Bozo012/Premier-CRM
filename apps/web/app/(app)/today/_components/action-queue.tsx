import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock, Hourglass, type LucideIcon } from 'lucide-react';

import type { QuoteActivityItem, TodayActionItem } from '@premier/db';

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
// Rows now stack vertically below `sm` and go side-by-side at `sm`+. The
// Base44 visual integration (docs/ux/base44-today-sync-and-portability-audit.md)
// adopts AttentionSection.tsx's color/spacing/eyebrow-label treatment onto
// this existing row layout deliberately, rather than switching to its
// 2-column article-card grid — that would re-risk the phone-overflow fix
// this file already carries; the row structure below is unchanged.
export function ActionQueue({
  actionItems,
  quoteActivity,
}: {
  actionItems: TodayActionItem[];
  quoteActivity: QuoteActivityItem[];
}) {
  const count = actionItems.length + quoteActivity.length;

  // BASE44-REPLACEABLE: empty-state markup below is representative only.
  if (count === 0) {
    return (
      <section className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Priority queue</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Needs your attention</h2>
        </div>
        <EmptyState title="Nothing needs your attention right now" description="New tasks will appear here the moment they're actionable." />
      </section>
    );
  }

  // BASE44-REPLACEABLE: markup/classNames below (through ActionItemRow) are
  // representative only — real Base44 output would replace this JSX 1:1,
  // same props in/out.
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Priority queue</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">Needs your attention</h2>
        </div>
        <span className="shrink-0 text-sm font-semibold text-muted-foreground">
          {count} {count === 1 ? 'item' : 'items'}
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
          {actionItems.map((item) => (
            <ActionItemRow key={`${item.kind}-${'estimateId' in item ? item.estimateId : item.quoteId}`} item={item} />
          ))}
          {quoteActivity.map((entry) => (
            <AttentionCard
              key={entry.id}
              badgeTone={entry.isAccepted ? 'emerald' : 'amber'}
              badgeIcon={entry.isAccepted ? Clock : Hourglass}
              badgeLabel={entry.isAccepted ? 'Ready to convert' : 'Awaiting follow-up'}
              title={entry.isAccepted ? 'Quote accepted — ready for job review' : 'Follow up on quote decision'}
              description={entry.message ?? entry.label}
              customer={entry.label}
              actionHref={`/quotes/${entry.quoteId}`}
              actionLabel={entry.isAccepted ? 'Open quote' : 'View quote'}
            />
          ))}
      </div>
    </section>
  );
}

// BASE44-REPLACEABLE: every branch below returns representative-only JSX.
function ActionItemRow({ item }: { item: TodayActionItem }) {
  if (item.kind === 'pricing_review_requested') {
    return (
      <AttentionCard
        badgeTone="red"
        badgeIcon={AlertTriangle}
        badgeLabel="Pricing review"
        title="Approve estimate pricing review before it blocks scheduling"
        description={`${item.estimateNumber} · ${formatMoney(item.proposedTotal)}${item.submittedByName ? ` · Submitted by ${item.submittedByName}` : ''}`}
        customer={item.customerName ?? 'No customer'}
        actionHref={`/estimates/${item.estimateId}`}
        actionLabel="Open estimate"
      />
    );
  }

  if (item.kind === 'create_quote') {
    return (
      <AttentionCard
        badgeTone="emerald"
        badgeIcon={Clock}
        badgeLabel="Ready to quote"
        title="Create quote from approved estimate"
        description={`${item.estimateNumber} · ${item.title}`}
        customer={item.customerName ?? 'No customer'}
        actionHref={`/estimates/${item.estimateId}`}
        actionLabel="Create quote"
      />
    );
  }

  return (
    <AttentionCard
      badgeTone="blue"
      badgeIcon={Clock}
      badgeLabel="Draft quote"
      title="Send quote before the customer waits"
      description={item.quoteNumber ?? item.title ?? 'Quote'}
      customer={item.customerName ?? 'No customer'}
      actionHref={`/quotes/${item.quoteId}`}
      actionLabel="Send quote"
    />
  );
}

function AttentionCard({
  actionHref,
  actionLabel,
  badgeIcon: Icon,
  badgeLabel,
  badgeTone,
  customer,
  description,
  title,
}: {
  actionHref: string;
  actionLabel: string;
  badgeIcon: LucideIcon;
  badgeLabel: string;
  badgeTone: 'amber' | 'blue' | 'emerald' | 'red';
  customer: string;
  description: string;
  title: string;
}) {
  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="space-y-3">
        <StatusPill tone={badgeTone}>
          <Icon className="h-3 w-3" aria-hidden="true" />
          {badgeLabel}
        </StatusPill>
        <div>
          <h3 className="text-base font-bold leading-tight text-card-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <p className="truncate text-xs font-bold text-card-foreground">{customer}</p>
        <Link
          href={actionHref}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
