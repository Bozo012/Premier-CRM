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
