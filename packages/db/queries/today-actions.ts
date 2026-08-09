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

export interface NewRequestTask {
  kind: 'new_request';
  requestId: string;
  requestNumber: string;
  title: string;
  contactName: string | null;
  priority: string | null;
  submittedAt: string;
}

export type TodayActionItem = NewRequestTask | PricingReviewTask | CreateQuoteTask | SendQuoteTask;

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

async function getNewRequestTasks(client: DbClient, orgId: string): Promise<Result<NewRequestTask[]>> {
  const { data, error } = await client
    .from('service_requests')
    .select('id, request_number, service_title, contact_name, priority, submitted_at')
    .eq('org_id', orgId)
    .eq('status', 'new')
    .order('submitted_at', { ascending: true })
    .limit(10);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const tasks: NewRequestTask[] = (data ?? []).map((row) => ({
    kind: 'new_request',
    requestId: row.id,
    requestNumber: row.request_number,
    title: row.service_title?.trim() || 'New service request',
    contactName: row.contact_name?.trim() || null,
    priority: row.priority,
    submittedAt: row.submitted_at,
  }));

  return ok(tasks);
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

export interface BoardSiteVisit {
  siteVisitId: string;
  /** Real lifecycle stage — see site_visit_status enum. Never fabricated;
   * awaiting_scheduling/cancelled are excluded before this type is built. */
  status: 'scheduled' | 'in_progress' | 'completed';
  serviceTitle: string;
  contactName: string | null;
  propertyAddress: string | null;
  /** From the visit's currently-active ('scheduled'-status) appointment.
   * Null once completed — complete_site_visit() flips that appointment's
   * own status to 'completed' too, so it's no longer the "active" one this
   * query joins against; completedAt is the meaningful time for that case. */
  scheduledStart: string | null;
  completedAt: string | null;
}

/**
 * Operational-board site visits — deliberately NOT date-scoped to "today"
 * the way getTodaySiteVisits() is (see that function's own doc comment:
 * it exists for the Today schedule, a different, correctly date-scoped
 * concept). This is the query that fixes the "in-progress inspection
 * disappears from the Kanban because its appointment isn't today" defect:
 * it fetches every currently-relevant site visit by REAL lifecycle status
 * (site_visits.status, not appointment.status, which stays 'scheduled'
 * throughout an entire in-progress inspection and can't distinguish "not
 * started" from "in progress" at all), regardless of scheduled_start date,
 * bounded only by completedSince for the 'completed' bucket so finished
 * work doesn't accumulate forever. The board-horizon cut for the
 * 'scheduled' bucket (e.g. "next 7 days") is applied by the view-model
 * layer, not here — this returns every non-cancelled,
 * non-awaiting-scheduling visit so that decision stays a pure, testable,
 * presentation-adjacent concern rather than baked into the query.
 */
export async function getBoardSiteVisits(
  client: DbClient,
  args: { orgId: string; completedSince: Date }
): Promise<Result<BoardSiteVisit[]>> {
  const { orgId, completedSince } = args;

  const { data, error } = await client
    .from('site_visits')
    .select(
      `
      id, status, completed_at,
      service_requests ( service_title, contact_name, property_address_line_1, property_city )
    `
    )
    .eq('org_id', orgId)
    .or(`status.in.(scheduled,in_progress),and(status.eq.completed,completed_at.gte.${completedSince.toISOString()})`);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const rows = data ?? [];
  const visitIds = rows.map((row) => row.id);

  // Active appointment per visit, for scheduled_start display — same
  // two-query shape listSiteVisits() already uses (packages/db/queries/
  // site-visits.ts): a completed visit's appointment row has moved to
  // status='completed' too, so it won't appear here, which is correct —
  // completedAt is what the board shows for those cards instead.
  const { data: appointments, error: appointmentError } = visitIds.length
    ? await client.from('site_visit_appointments').select('site_visit_id, scheduled_start').in('site_visit_id', visitIds).eq('status', 'scheduled')
    : { data: [], error: null };
  if (appointmentError) return err(ErrorCode.DB_ERROR, appointmentError.message);

  const scheduledStartByVisitId = new Map((appointments ?? []).map((a) => [a.site_visit_id, a.scheduled_start]));

  const visits: BoardSiteVisit[] = rows
    .filter((row): row is typeof row & { status: 'scheduled' | 'in_progress' | 'completed' } =>
      row.status === 'scheduled' || row.status === 'in_progress' || row.status === 'completed'
    )
    .map((row) => {
      const request = Array.isArray(row.service_requests) ? row.service_requests[0] : row.service_requests;
      const address = request ? [request.property_address_line_1, request.property_city].filter(Boolean).join(', ') : null;
      return {
        siteVisitId: row.id,
        status: row.status,
        serviceTitle: request?.service_title ?? 'Site visit',
        contactName: request?.contact_name ?? null,
        propertyAddress: address || null,
        scheduledStart: scheduledStartByVisitId.get(row.id) ?? null,
        completedAt: row.completed_at,
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

  if (hasCapability(role, 'canTriageRequests')) {
    const result = await getNewRequestTasks(client, orgId);
    if (!result.success) return result;
    items.push(...result.data);
  }

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

export interface BoardJob {
  id: string;
  title: string;
  status: 'scheduled' | 'in_progress' | 'on_hold' | 'completed';
  priority: 'low' | 'normal' | 'high' | 'emergency';
  scheduledStart: string | null;
  /** Proxy for "when did this reach its current state" for the completed
   * bucket's recency window — jobs has a closed_at column but it is dead
   * (not set by any application code, confirmed by repository-wide grep),
   * so updated_at is the honest choice, not a fabricated field. */
  updatedAt: string;
  customers: { company_name: string | null; display_name: string | null; first_name: string | null; last_name: string | null } | null;
  properties: { address_line_1: string; city: string; state: string } | null;
}

/**
 * Operational-board jobs — the Jobs-side equivalent of getBoardSiteVisits(),
 * fixing the identical defect: TodayPage's inline jobs query was scoped to
 * scheduled_start falling today, so an in-progress job started yesterday or
 * an on-hold job with no scheduled_start today would silently disappear
 * from the board. Bounded only by completedSince for the 'completed'
 * bucket; the 'scheduled' bucket's horizon (e.g. next 7 days) is a
 * view-model concern, matching getBoardSiteVisits()'s split.
 */
export async function getBoardJobs(
  client: DbClient,
  args: { orgId: string; completedSince: Date }
): Promise<Result<BoardJob[]>> {
  const { orgId, completedSince } = args;

  const { data, error } = await client
    .from('jobs')
    .select(
      'id, title, scheduled_start, status, priority, updated_at, customers(display_name, company_name, first_name, last_name), properties(address_line_1, city, state)'
    )
    .eq('org_id', orgId)
    .or(`status.in.(scheduled,in_progress,on_hold),and(status.eq.completed,updated_at.gte.${completedSince.toISOString()})`);

  if (error) return err(ErrorCode.DB_ERROR, error.message);

  const jobs: BoardJob[] = (data ?? [])
    .filter((row): row is typeof row & { status: 'scheduled' | 'in_progress' | 'on_hold' | 'completed' } =>
      row.status === 'scheduled' || row.status === 'in_progress' || row.status === 'on_hold' || row.status === 'completed'
    )
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      priority: row.priority,
      scheduledStart: row.scheduled_start,
      updatedAt: row.updated_at,
      customers: Array.isArray(row.customers) ? (row.customers[0] ?? null) : row.customers,
      properties: Array.isArray(row.properties) ? (row.properties[0] ?? null) : row.properties,
    }));

  return ok(jobs);
}
