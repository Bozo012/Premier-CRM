/**
 * Server-side, role-aware "Needs your attention" queue for the Today page.
 * Every query is scoped by org_id and filtered to exactly the rows that
 * disappear the moment they're no longer actionable (no separate
 * "dismiss" state to get out of sync) — see each section below for why.
 * Never mixed into the Requests badge count (that stays a separate,
 * unrelated snapshot number on the Today page itself).
 */
import { ErrorCode, err, ok, hasCapability, type OrgRole, type Result } from '@premier/shared';

import type { DbClient } from '../client';

export interface PricingReviewTask {
  kind: 'pricing_review_requested';
  estimateId: string;
  estimateNumber: string;
  title: string;
  customerName: string | null;
  proposedTotal: number;
  submittedByName: string | null;
  submittedAt: string;
}

export interface CreateQuoteTask {
  kind: 'create_quote';
  estimateId: string;
  estimateNumber: string;
  title: string;
  customerName: string | null;
  approvedAt: string;
}

export interface SendQuoteTask {
  kind: 'send_quote';
  quoteId: string;
  quoteNumber: string | null;
  title: string | null;
  customerName: string | null;
  createdAt: string;
}

export type TodayActionItem = PricingReviewTask | CreateQuoteTask | SendQuoteTask;

export interface QuoteActivityItem {
  id: string;
  quoteId: string;
  label: string;
  message: string | null;
  isAccepted: boolean;
}

function resolveDisplayName(row: { first_name: string | null; last_name: string | null; company_name: string | null } | null): string | null {
  if (!row) return null;
  if (row.company_name?.trim()) return row.company_name.trim();
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return name || null;
}

/**
 * "Pricing review requested" — for whoever can act on it
 * (canApproveEstimatePricing). Disappears the instant the estimate is
 * approved (pricing_reviewed_at set) or returned for changes
 * (pricing_review_status leaves 'pending_review') — no separate dismissal
 * step, the query itself only ever matches the live pending state.
 */
async function getPricingReviewTasks(client: DbClient, orgId: string): Promise<Result<PricingReviewTask[]>> {
  const { data, error } = await client
    .from('estimates')
    .select(
      `
      id, estimate_number, title, pricing_review_requested_at, pricing_review_requested_by,
      customers ( first_name, last_name, company_name ),
      estimate_line_items ( quantity, unit_price )
    `
    )
    .eq('org_id', orgId)
    .eq('pricing_review_status', 'pending_review')
    .order('pricing_review_requested_at', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const requesterIds = [...new Set((data ?? []).map((row) => row.pricing_review_requested_by).filter((id): id is string => !!id))];
  const { data: profiles } = requesterIds.length
    ? await client.from('user_profiles').select('id, full_name').in('id', requesterIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name?.trim() || null]));

  const tasks: PricingReviewTask[] = (data ?? []).map((row) => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    const lineItems = Array.isArray(row.estimate_line_items) ? row.estimate_line_items : [];
    const proposedTotal = lineItems.reduce((sum, li) => sum + (li.quantity ?? 0) * (li.unit_price ?? 0), 0);
    return {
      kind: 'pricing_review_requested',
      estimateId: row.id,
      estimateNumber: row.estimate_number,
      title: row.title,
      customerName: resolveDisplayName(customer ?? null),
      proposedTotal,
      submittedByName: row.pricing_review_requested_by ? (nameById.get(row.pricing_review_requested_by) ?? null) : null,
      submittedAt: row.pricing_review_requested_at ?? '',
    };
  });

  return ok(tasks);
}

/**
 * "Pricing approved — create quote" — for whoever can act on it
 * (canCreateQuote). Disappears the instant any quote exists for the
 * estimate (any status — a declined quote means "create a new one",
 * handled separately by the existing accepted/declined activity feed, not
 * this task, so it deliberately does not reappear here).
 */
async function getCreateQuoteTasks(client: DbClient, orgId: string): Promise<Result<CreateQuoteTask[]>> {
  const { data, error } = await client
    .from('estimates')
    .select(
      `
      id, estimate_number, title, pricing_reviewed_at, service_request_id,
      customers ( first_name, last_name, company_name )
    `
    )
    .eq('org_id', orgId)
    .not('pricing_reviewed_at', 'is', null)
    .not('service_request_id', 'is', null)
    .order('pricing_reviewed_at', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const estimateIds = (data ?? []).map((row) => row.id);
  const { data: existingQuotes, error: quotesError } = estimateIds.length
    ? await client.from('quotes').select('estimate_id').eq('org_id', orgId).in('estimate_id', estimateIds)
    : { data: [] as { estimate_id: string | null }[], error: null };
  if (quotesError) return err(ErrorCode.DB_ERROR, quotesError.message);
  const estimateIdsWithQuote = new Set((existingQuotes ?? []).map((q) => q.estimate_id));

  const tasks: CreateQuoteTask[] = (data ?? [])
    .filter((row) => !estimateIdsWithQuote.has(row.id))
    .map((row) => {
      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      return {
        kind: 'create_quote' as const,
        estimateId: row.id,
        estimateNumber: row.estimate_number,
        title: row.title,
        customerName: resolveDisplayName(customer ?? null),
        approvedAt: row.pricing_reviewed_at ?? '',
      };
    });

  return ok(tasks);
}

/**
 * "Draft quote ready — send quote" — for whoever can act on it
 * (canSendQuote). Disappears the instant the quote leaves 'draft' status
 * (sent, or any other transition).
 */
async function getSendQuoteTasks(client: DbClient, orgId: string): Promise<Result<SendQuoteTask[]>> {
  const { data, error } = await client
    .from('quotes')
    .select(
      `
      id, quote_number, title, created_at, estimate_id,
      estimates ( customers ( first_name, last_name, company_name ) )
    `
    )
    .eq('org_id', orgId)
    .eq('status', 'draft')
    .order('created_at', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const tasks: SendQuoteTask[] = (data ?? []).map((row) => {
    const estimate = Array.isArray(row.estimates) ? row.estimates[0] : row.estimates;
    const customer = estimate ? (Array.isArray(estimate.customers) ? estimate.customers[0] : estimate.customers) : null;
    return {
      kind: 'send_quote',
      quoteId: row.id,
      quoteNumber: row.quote_number,
      title: row.title,
      customerName: resolveDisplayName(customer ?? null),
      createdAt: row.created_at,
    };
  });

  return ok(tasks);
}

/**
 * Recent quote-response activity relevant to Today — moved here from the
 * page/view-model layer (Forge V1.1 UX modernization, corrected ownership
 * of a workflow-relevance rule originally misplaced in the Base44
 * compatibility spike's Layer 2 adapter, see
 * docs/ux/forge-v1.1-today-redesign.md). This is a workflow-relevance
 * decision — which activity_log rows still matter — not presentation
 * formatting, so it belongs here alongside getTodayActionItems(), never in
 * a page-level view model.
 *
 * "Still actionable": an accepted quote that hasn't been converted to a
 * job yet (no auto-created job — see respondToQuoteAction /
 * sendQuoteRespondedNotification); a declined quote has nothing further to
 * convert but stays visible as recent activity worth being aware of.
 *
 * Unlike the three capability-gated buckets above, this feed is not
 * capability-gated — preserves the pre-existing behavior (previously
 * inline in Today's page.tsx), where any signed-in org member could see
 * recent quote activity regardless of role.
 */
export async function getTodayQuoteActivity(
  client: DbClient,
  args: { orgId: string; since: Date }
): Promise<Result<QuoteActivityItem[]>> {
  const { orgId, since } = args;

  const { data: activity, error: activityError } = await client
    .from('activity_log')
    .select('id, entity_id, event_type, message, created_at')
    .eq('org_id', orgId)
    .in('event_type', ['quote_accepted', 'quote_declined'])
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })
    .limit(10);

  if (activityError) return err(ErrorCode.DB_ERROR, activityError.message);

  const rows = activity ?? [];
  const quoteIds = [...new Set(rows.map((entry) => entry.entity_id))];
  const { data: quotes, error: quotesError } = quoteIds.length
    ? await client.from('quotes').select('id, title, quote_number, job_id').in('id', quoteIds)
    : { data: [] as { id: string; title: string | null; quote_number: string | null; job_id: string | null }[], error: null };

  if (quotesError) return err(ErrorCode.DB_ERROR, quotesError.message);

  const quoteById = new Map((quotes ?? []).map((q) => [q.id, q]));

  const items: QuoteActivityItem[] = rows
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

  return ok(items);
}

export interface TodaySiteVisit {
  appointmentId: string;
  siteVisitId: string;
  scheduledStart: string;
  contactName: string | null;
  propertyAddress: string | null;
}

/**
 * Site visits with a scheduled appointment window overlapping today
 * (Forge V1.1 Today redesign — new Layer 1 read, matching the existing
 * "today's scheduled jobs" query pattern already on the page; no new
 * table/column/RPC, a plain org-scoped SELECT). Status is restricted to
 * 'scheduled' — cancelled/completed appointments never appear here.
 */
export async function getTodaySiteVisits(
  client: DbClient,
  args: { orgId: string; startOfDay: Date; endOfDay: Date }
): Promise<Result<TodaySiteVisit[]>> {
  const { orgId, startOfDay, endOfDay } = args;

  const { data, error } = await client
    .from('site_visit_appointments')
    .select(
      `
      id, scheduled_start, site_visit_id,
      site_visits ( service_requests ( contact_name, property_address_line_1, property_city ) )
    `
    )
    .eq('org_id', orgId)
    .eq('status', 'scheduled')
    .gte('scheduled_start', startOfDay.toISOString())
    .lt('scheduled_start', endOfDay.toISOString())
    .order('scheduled_start', { ascending: true });

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const visits: TodaySiteVisit[] = (data ?? []).map((row) => {
    const siteVisit = Array.isArray(row.site_visits) ? row.site_visits[0] : row.site_visits;
    const request = siteVisit ? (Array.isArray(siteVisit.service_requests) ? siteVisit.service_requests[0] : siteVisit.service_requests) : null;
    const address = request ? [request.property_address_line_1, request.property_city].filter(Boolean).join(', ') : null;
    return {
      appointmentId: row.id,
      siteVisitId: row.site_visit_id,
      scheduledStart: row.scheduled_start,
      contactName: request?.contact_name ?? null,
      propertyAddress: address || null,
    };
  });

  return ok(visits);
}

/**
 * Count of invoices still requiring payment action (Forge V1.1 Today
 * redesign — Kevin decision: Today's snapshot may show operational counts
 * for "invoices or payments requiring action," never accounting totals/
 * revenue figures). "Requiring action" = sent, viewed, partially_paid, or
 * overdue — explicitly excludes draft (not yet sent), paid (done), void,
 * and refunded (both terminal, nothing to act on).
 */
export async function getTodayInvoicesNeedingActionCount(client: DbClient, orgId: string): Promise<Result<number>> {
  const { count, error } = await client
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .in('status', ['sent', 'viewed', 'partially_paid', 'overdue']);

  if (error) return err(ErrorCode.DB_ERROR, error.message);
  return ok(count ?? 0);
}

/**
 * Combined, role-filtered action queue. Each bucket is only fetched (and
 * only ever returned) when the caller's role actually holds the capability
 * that makes it actionable — a role without canApproveEstimatePricing never
 * even queries pricing-review tasks, let alone sees them.
 */
export async function getTodayActionItems(
  client: DbClient,
  args: { orgId: string; role: OrgRole }
): Promise<Result<TodayActionItem[]>> {
  const { orgId, role } = args;
  const items: TodayActionItem[] = [];

  if (hasCapability(role, 'canApproveEstimatePricing')) {
    const result = await getPricingReviewTasks(client, orgId);
    if (!result.success) return result;
    items.push(...result.data);
  }

  if (hasCapability(role, 'canCreateQuote')) {
    const result = await getCreateQuoteTasks(client, orgId);
    if (!result.success) return result;
    items.push(...result.data);
  }

  if (hasCapability(role, 'canSendQuote')) {
    const result = await getSendQuoteTasks(client, orgId);
    if (!result.success) return result;
    items.push(...result.data);
  }

  return ok(items);
}
