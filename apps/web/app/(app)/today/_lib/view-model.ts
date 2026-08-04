// ============================================================================
// ADAPTER / VIEW-MODEL LAYER (spike-introduced)
// ============================================================================
// Pure, side-effect-free functions that reshape data already returned by
// existing Forge domain code (packages/db queries, getTodayActionItems())
// into plain props the presentation components in ../_components/ can
// render directly. This layer:
//   - performs NO Supabase/network/database access of its own
//   - performs NO authorization, capability, or role-gating decisions —
//     every access decision was already made by getTodayActionItems() and
//     RLS before any of this code runs; this layer only formats/sorts/labels
//     data that's already been correctly scoped and filtered
//   - is where a Base44-style redesign's data requirements get reconciled
//     with Forge's existing query shapes, without either side needing to
//     change
//
// The one piece of business-adjacent logic here — "an accepted quote with
// no job yet is still actionable" (buildQuoteActivityRows) — already existed
// inline in page.tsx before this spike; it is relocated here, not
// introduced, and not duplicated anywhere else (the presentation layer never
// re-derives it).
import type { TodayActionItem } from '@premier/db';

import type { QuoteActivityRow } from '../_components/action-queue';
import type { ScheduleJob } from '../_components/today-schedule';
import type { SnapshotItem } from '../_components/snapshot-grid';

export function normalizePropertyAddressKey(property: {
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}): string {
  return [property.address_line_1, property.city, property.state, property.zip]
    .map((value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
    )
    .join('|');
}

export function countUniqueProperties(
  properties: Array<{ address_line_1: string | null; city: string | null; state: string | null; zip: string | null }>
): number {
  return new Set(properties.map(normalizePropertyAddressKey)).size;
}

export function formatScheduledTime(value: string | null): string {
  if (!value) return 'Anytime';
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function buildScheduleJobs(jobs: Array<{ id: string; title: string; scheduled_start: string | null }>): ScheduleJob[] {
  return jobs.map((job) => ({
    id: job.id,
    title: job.title,
    scheduledTimeLabel: formatScheduledTime(job.scheduled_start),
  }));
}

export function sortActionItems(items: TodayActionItem[]): TodayActionItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.kind === 'pricing_review_requested' ? a.submittedAt : a.kind === 'create_quote' ? a.approvedAt : a.createdAt;
    const bTime = b.kind === 'pricing_review_requested' ? b.submittedAt : b.kind === 'create_quote' ? b.approvedAt : b.createdAt;
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
}

// Relocated unchanged from the pre-spike page.tsx (see module comment above)
// — decides which quote-related activity_log entries are still "actionable"
// today. Not a new rule introduced by this spike.
export function buildQuoteActivityRows(
  activity: Array<{ id: string; entity_id: string; event_type: string; message: string | null }>,
  quoteById: Map<string, { id: string; title: string | null; quote_number: string | null; job_id: string | null }>
): QuoteActivityRow[] {
  return activity
    .filter((entry) => {
      const quote = quoteById.get(entry.entity_id);
      if (!quote) return false;
      if (entry.event_type === 'quote_accepted') return !quote.job_id;
      return true;
    })
    .map((entry) => {
      const quote = quoteById.get(entry.entity_id);
      const isAccepted = entry.event_type === 'quote_accepted';
      return {
        id: entry.id,
        quoteId: entry.entity_id,
        label: quote?.title?.trim() || quote?.quote_number || 'Quote',
        message: entry.message ?? (isAccepted ? 'Ready to create a job when you are.' : null),
        isAccepted,
      };
    });
}

export function buildSnapshotItems(counts: {
  customerCount: number;
  uniquePropertyCount: number;
  jobCount: number;
  newRequestCount: number;
}): SnapshotItem[] {
  return [
    { label: 'Customers', value: String(counts.customerCount), helper: 'Review imported records', href: '/customers' },
    { label: 'Properties', value: String(counts.uniquePropertyCount), helper: 'Browse addresses and owners', href: '/properties' },
    { label: 'Jobs', value: String(counts.jobCount), helper: 'Jobs imported or created', href: '/jobs' },
    { label: 'New requests', value: String(counts.newRequestCount), helper: 'Unreviewed website inquiries', href: '/requests' },
  ];
}

export function deriveGreeting(now: Date): string {
  const hour = now.getHours();
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export function deriveFirstName(fullName: string | null, email: string | null): string {
  const fromProfile = fullName ? fullName.split(' ')[0] : null;
  const fromEmail = email ? email.split('@')[0] : null;
  return fromProfile ?? fromEmail ?? 'there';
}
