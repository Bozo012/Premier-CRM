import type {
  ChangeOrderComment,
  ChangeOrderRevision,
  ChangeOrderThreadDetail,
} from '@premier/db';

/**
 * Interleaves a change-order thread's revisions and comments into one
 * chronological feed (original request -> comments -> proposal -> more
 * comments -> decision -> incorporation), instead of the two separate
 * lists the portal and CRM previously rendered. No new schema — reads
 * `change_order_revisions` and `change_order_comments` exactly as they
 * are; a revision can contribute up to three events (created, proposed,
 * decided/incorporated) since each is a real, distinct, immutable
 * timestamp already on the row.
 */
export interface ChangeOrderHistoryEvent {
  id: string;
  createdAt: string;
  kind: 'revision_created' | 'revision_proposed' | 'revision_decided' | 'revision_incorporated' | 'comment';
  label: string;
  detail: string | null;
}

export function buildChangeOrderHistoryFeed(thread: ChangeOrderThreadDetail): ChangeOrderHistoryEvent[] {
  const events: ChangeOrderHistoryEvent[] = [];

  for (const revision of thread.revisions) {
    events.push(...revisionEvents(revision));
  }

  for (const comment of thread.comments) {
    events.push(commentEvent(comment));
  }

  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function revisionEvents(revision: ChangeOrderRevision): ChangeOrderHistoryEvent[] {
  const events: ChangeOrderHistoryEvent[] = [
    {
      id: `${revision.id}-created`,
      createdAt: revision.created_at,
      kind: 'revision_created',
      label: `Revision v${revision.version} drafted`,
      detail: revision.reason,
    },
  ];

  if (revision.proposed_at) {
    events.push({
      id: `${revision.id}-proposed`,
      createdAt: revision.proposed_at,
      kind: 'revision_proposed',
      label: `Revision v${revision.version} proposed`,
      detail: revision.scope_change_summary,
    });
  }

  if (revision.decided_at) {
    events.push({
      id: `${revision.id}-decided`,
      createdAt: revision.decided_at,
      kind: 'revision_decided',
      label: `Revision v${revision.version} ${revision.status}`,
      detail: revision.decision_note,
    });
  }

  if (revision.incorporated_at) {
    events.push({
      id: `${revision.id}-incorporated`,
      createdAt: revision.incorporated_at,
      kind: 'revision_incorporated',
      label: `Revision v${revision.version} incorporated into working invoice`,
      detail: null,
    });
  }

  return events;
}

function commentEvent(comment: ChangeOrderComment): ChangeOrderHistoryEvent {
  return {
    id: comment.id,
    createdAt: comment.created_at,
    kind: 'comment',
    label: comment.author_customer_id ? 'Customer comment' : 'Staff comment',
    detail: comment.body,
  };
}
