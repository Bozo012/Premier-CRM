import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildOpenInMapsUrl } from '@/lib/maps/external-maps-url';

import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';

interface PropertyRow {
  relationship: string | null;
  is_primary: boolean | null;
  properties: {
    id: string;
    address_line_1: string;
    address_line_2: string | null;
    city: string;
    state: string;
    zip: string;
  } | null;
}

export default async function PortalPropertiesPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="properties"><></></PortalShell>;
  }

  const { data } = await portalClient
    .from('customer_properties')
    .select('relationship, is_primary, properties(id, address_line_1, address_line_2, city, state, zip)')
    .eq('customer_id', account.customerId);

  const properties = (data ?? []) as unknown as PropertyRow[];

  return (
    <PortalShell account={account} activeId="properties">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Properties</h1>
          <p className="text-sm text-muted-foreground">Properties linked to your customer account.</p>
        </header>

        {properties.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No properties are linked yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {properties.map((row) => {
              const property = row.properties;
              if (!property) return null;
              // Only address fields go into the Maps link — never gate
              // codes/access notes, matching the same MapsDestination
              // exclusion discipline used by the Route Planning slice.
              const mapsUrl = buildOpenInMapsUrl({
                addressLine1: property.address_line_1,
                addressLine2: property.address_line_2,
                city: property.city,
                state: property.state,
                zip: property.zip,
              });
              return (
                <li key={property.id}>
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {property.address_line_2
                          ? `${property.address_line_1}, ${property.address_line_2}`
                          : property.address_line_1}
                      </CardTitle>
                      <CardDescription>
                        {property.city}, {property.state} {property.zip} · {row.relationship ?? 'customer'}
                        {row.is_primary ? ' · primary' : ''}
                      </CardDescription>
                    </CardHeader>
                    {mapsUrl ? (
                      <CardContent>
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-[#ea580c] underline-offset-4 hover:underline"
                        >
                          Open in Maps →
                        </a>
                      </CardContent>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}
