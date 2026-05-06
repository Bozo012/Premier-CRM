import {
  ErrorCode,
  err,
  ok,
  type QuoteRequestPayload,
  type Result,
} from '@premier/shared';

import type { DbClient } from '../client';

/**
 * Result shape for `createQuoteRequest`.
 */
export interface CreateQuoteRequestResult {
  /** The id of the `tasks` row that represents the quote request. */
  taskId: string;
  /** The id of the `customers` row (existing or newly created). */
  customerId: string;
  /** True if we matched an existing customer instead of creating one. */
  deduped: boolean;
}

/**
 * Strip everything except digits from a phone string and return the last 10
 * digits, which is the standard US-domestic comparison key. Handles inputs
 * like `(859) 912-0526`, `+1 859 912 0526`, `8599120526` consistently.
 */
function normalizePhoneForLookup(value: string): string | null {
  const digits = value.replace(/\D+/g, '');
  if (digits.length < 7) return null;
  // Use the last 10 digits to ignore optional country code prefix.
  return digits.slice(-10);
}

/**
 * Best-effort split of a single "name" field into first/last. Anything past
 * the first whitespace becomes the last name; if there's no whitespace, the
 * whole thing goes into first_name. Kevin can clean these up at customer
 * detail later — the goal here is "good enough to greet them by name."
 */
function splitName(name: string): { first: string; last: string | null } {
  const trimmed = name.trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) {
    return { first: trimmed, last: null };
  }
  return {
    first: trimmed.slice(0, idx),
    last: trimmed.slice(idx + 1).trim() || null,
  };
}

/**
 * Build a human-readable description block for the task. Includes structured
 * fields above the free-text description so Kevin can see at a glance what
 * the customer wants without parsing prose.
 */
function buildTaskDescription(payload: QuoteRequestPayload): string {
  const lines: string[] = [];
  lines.push(`From: ${payload.name}`);
  if (payload.email) lines.push(`Email: ${payload.email}`);
  if (payload.phone) lines.push(`Phone: ${payload.phone}`);
  if (payload.property_type) lines.push(`Property type: ${payload.property_type}`);
  if (payload.timeline) lines.push(`Timeline: ${payload.timeline}`);
  if (payload.service_needed) lines.push(`Service: ${payload.service_needed}`);
  lines.push('');
  lines.push(payload.description);
  if (payload.photo_urls && payload.photo_urls.length > 0) {
    lines.push('');
    lines.push('Photos:');
    for (const url of payload.photo_urls) {
      lines.push(`- ${url}`);
    }
  }
  return lines.join('\n');
}

/**
 * Compose the task's title. Always starts with "Quote request from {name}";
 * appends the requested service if known so the today-screen list shows what
 * the request is about without opening the task.
 */
function buildTaskTitle(payload: QuoteRequestPayload): string {
  const base = `Quote request from ${payload.name}`;
  return payload.service_needed ? `${base} — ${payload.service_needed}` : base;
}

/**
 * Create a quote request: dedupe (or create) the customer, then create a
 * `tasks` row that represents the inquiry. Caller supplies the org_id and a
 * Supabase client with write privileges (typically the service-role client,
 * since this runs from the public `/api/v1/quote-requests` endpoint with no
 * user session).
 *
 * Dedupe priority: email match wins over phone match. Match is org-scoped.
 */
export async function createQuoteRequest(
  client: DbClient,
  args: { orgId: string; payload: QuoteRequestPayload }
): Promise<Result<CreateQuoteRequestResult>> {
  const { orgId, payload } = args;
  const normalizedPhone = payload.phone
    ? normalizePhoneForLookup(payload.phone)
    : null;

  // 1. Try to match an existing customer by email first, then by phone.
  let customerId: string | null = null;
  let deduped = false;

  if (payload.email) {
    const { data, error } = await client
      .from('customers')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', payload.email)
      .limit(1)
      .maybeSingle();

    if (error) {
      return err(ErrorCode.DB_ERROR, error.message);
    }
    if (data?.id) {
      customerId = data.id;
      deduped = true;
    }
  }

  if (!customerId && normalizedPhone) {
    // Match on the last 10 digits of phone_primary. We use ilike with a
    // %normalized% pattern because phone_primary is stored in whatever
    // format the customer typed; this finds anything whose digits end with
    // the same 10. Not perfect but good enough at this volume.
    const { data, error } = await client
      .from('customers')
      .select('id, phone_primary')
      .eq('org_id', orgId)
      .not('phone_primary', 'is', null)
      .limit(50);

    if (error) {
      return err(ErrorCode.DB_ERROR, error.message);
    }

    if (data) {
      const match = data.find((row) => {
        if (!row.phone_primary) return false;
        const rowDigits = row.phone_primary.replace(/\D+/g, '').slice(-10);
        return rowDigits === normalizedPhone;
      });
      if (match) {
        customerId = match.id;
        deduped = true;
      }
    }
  }

  // 2. If no match, create a new customer.
  if (!customerId) {
    const { first, last } = splitName(payload.name);
    const insertNotes = [
      payload.service_needed ? `Service interest: ${payload.service_needed}` : null,
      payload.property_type ? `Property type: ${payload.property_type}` : null,
      payload.timeline ? `Timeline: ${payload.timeline}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const { data, error } = await client
      .from('customers')
      .insert({
        org_id: orgId,
        type: 'residential',
        first_name: first,
        last_name: last,
        email: payload.email ?? null,
        phone_primary: payload.phone ?? null,
        source: 'web_quote_request',
        tags: ['web_lead', 'unverified'],
        notes: insertNotes || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      return err(
        ErrorCode.DB_ERROR,
        error?.message ?? 'Failed to create customer.'
      );
    }
    customerId = data.id;
  }

  // 3. Create the task.
  const { data: task, error: taskError } = await client
    .from('tasks')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      title: buildTaskTitle(payload),
      description: buildTaskDescription(payload),
      priority: 'normal',
      status: 'open',
      ai_generated: false,
    })
    .select('id')
    .single();

  if (taskError || !task) {
    return err(
      ErrorCode.DB_ERROR,
      taskError?.message ?? 'Failed to create quote-request task.'
    );
  }

  return ok({
    taskId: task.id,
    customerId,
    deduped,
  });
}
