import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BrowsePanel {
  description: string;
  href: string;
  label: string;
  title: string;
}

const PANELS: BrowsePanel[] = [
  { title: 'Customers', description: 'See the imported customer list, contact info, notes, quotes, and jobs.', href: '/customers', label: 'Open customers' },
  { title: 'Properties', description: 'Inspect imported addresses, linked owners, access notes, and property memory.', href: '/properties', label: 'Open properties' },
  { title: 'Jobs', description: 'Review imported or created jobs with status, priority, and scheduling context.', href: '/jobs', label: 'Open jobs' },
  { title: 'Service catalog', description: 'Review seeded services, pricing confidence, and current rate ranges.', href: '/services', label: 'Open service catalog' },
];

// Presentation-only, static route list (no data dependency). canManageTeam
// is passed through unchanged from the role resolved in page.tsx — this
// component never re-derives or approximates capability/role logic itself.
export function BrowseDataGrid({ canManageTeam }: { canManageTeam: boolean }) {
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Browse imported data</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {PANELS.map((panel) => (
            <Card key={panel.title}>
              <CardHeader>
                <CardTitle>{panel.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{panel.description}</p>
                <Button asChild variant="outline">
                  <Link href={panel.href}>{panel.label}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {canManageTeam ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Team access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Review manually-created team accounts with app access.</p>
              <Button asChild variant="outline">
                <Link href="/team">View team access</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {canManageTeam ? (
        <section>
          <Card>
            <CardHeader>
              <CardTitle>Website content</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Manage the CRM-backed marketing content that powers the public website.
              </p>
              <Button asChild variant="outline">
                <Link href="/settings/website">Open website content</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </>
  );
}
