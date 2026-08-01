import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface TimelineEntry {
  id: string;
  label: string;
  createdAt: string;
}

/**
 * Shared rendering for a linear activity timeline. Fed already-projected
 * entries — the CRM passes raw staff entries (formatted to this shape at
 * the call site), the portal passes the customer-safe projection from
 * `getEntityTimelineForCustomer()`. Same component, different data going
 * in, so "customer and contractor from the same source of truth" holds
 * without exposing the same *view* of it.
 */
export function Timeline({ entries, title = 'Timeline' }: { entries: TimelineEntry[]; title?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="space-y-3 border-l pl-4">
            {entries.map((entry) => (
              <li key={entry.id} className="relative">
                <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-foreground" />
                <p className="text-sm text-foreground">{entry.label}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}
