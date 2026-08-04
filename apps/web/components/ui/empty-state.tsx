// Shared empty state (Forge V1.1 UX modernization, Batch UX-A). Every list
// page currently writes its own inline "no results" text — this closes that
// gap without changing what any page decides to show as empty (that
// decision stays with the page).
import { Card, CardContent } from '@/components/ui/card';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
