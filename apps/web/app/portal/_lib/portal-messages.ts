import { createServiceClient } from '@premier/db';

// activity_log has no customer-facing SELECT RLS at all (org-member-only —
// see 20260731010000_activity_log.sql) — every read here goes through the
// service client, narrowly scoped ourselves to this one customer's own
// portal_contact_requested rows via related_ids->>'customer_id' AND org_id,
// never a bare org-wide read. This is the honest data behind "Messages":
// the customer's own past contact-us submissions. There is no staff-reply
// thread model in the schema (no message_thread/request_messages table) —
// replies happen off-platform (phone/email per the reply method chosen),
// which this view states plainly rather than fabricating a reply.
export interface PortalMessageRow {
  id: string;
  referenceNumber: string | null;
  subject: string;
  createdAt: string;
  category: string | null;
  replyMethod: string | null;
}

export function extractSubject(message: string | null): string {
  if (!message) return 'Portal message';
  const match = message.match(/Subject:\s*(.+)/);
  return match?.[1]?.trim() || 'Portal message';
}

export function extractCategory(message: string | null): string | null {
  if (!message) return null;
  const match = message.match(/Category:\s*(.+)/);
  return match?.[1]?.trim() || null;
}

export async function listPortalMessages(args: { customerId: string; orgId: string }): Promise<PortalMessageRow[]> {
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from('activity_log')
    .select('id, message, created_at, related_ids')
    .eq('org_id', args.orgId)
    .eq('event_type', 'portal_contact_requested')
    .contains('related_ids', { customer_id: args.customerId })
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  return data.map((row) => {
    const relatedIds = (row.related_ids ?? {}) as Record<string, unknown>;
    return {
      id: row.id,
      referenceNumber:
        typeof relatedIds.portal_contact_reference === 'string' ? relatedIds.portal_contact_reference : null,
      subject: extractSubject(row.message),
      createdAt: row.created_at,
      category: extractCategory(row.message),
      replyMethod: typeof relatedIds.reply_method === 'string' ? relatedIds.reply_method : null,
    };
  });
}
