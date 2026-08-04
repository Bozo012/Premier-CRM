import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Presentation-only (Layer 3). Replaces the pre-redesign "Browse imported
// data" grid, which duplicated every section already reachable from the
// persistent desktop nav shipped in Batch UX-A (Requests, Customers,
// Properties, Estimates, Quotes, Jobs, Invoices, Service catalog, Team are
// all primary-nav items now — see components/navigation/app-desktop-nav.tsx).
// Only Website content isn't in primary nav, so that's all that remains
// here. canManageTeam is passed through unchanged from the role resolved
// in page.tsx — this component never re-derives capability/role logic.
export function AdminLinks({ canManageTeam }: { canManageTeam: boolean }) {
  if (!canManageTeam) return null;

  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle>Website content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Manage the CRM-backed marketing content that powers the public website.</p>
          <Button asChild variant="outline">
            <Link href="/settings/website">Open website content</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
