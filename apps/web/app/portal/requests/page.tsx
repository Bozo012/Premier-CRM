import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { getPortalRequestStatusDescription, getPortalRequestStatusLabel } from '@/lib/request-intake-flow';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';
import { PortalNewRequestSheet, type PortalNewRequestProperty } from './_components/portal-new-request-sheet';

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value)
  );
}

export default async function PortalRequestsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  requirePortalUser(Boolean(user));

  const { account, portalClient } = await resolveActivePortalAccount();
  if (!account) {
    return <PortalShell account={null} activeId="requests"><></></PortalShell>;
  }

  const [{ data }, { data: propertyLinks }] = await Promise.all([
    portalClient
      .from('service_requests')
      .select(
        'id, request_number, status, priority, estimate_id, job_id, service_title, service_description, submitted_at, preferred_date, property_address_line_1, property_city, property_state'
      )
      .eq('customer_id', account.customerId)
      .order('submitted_at', { ascending: false }),
    portalClient
      .from('customer_properties')
      .select('properties(id, address_line_1, address_line_2, city, state, zip)')
      .eq('customer_id', account.customerId),
  ]);

  const requests = data ?? [];

  const newRequestProperties: PortalNewRequestProperty[] = ((propertyLinks ?? []) as unknown as Array<{
    properties:
      | { id: string; address_line_1: string; address_line_2: string | null; city: string; state: string; zip: string }
      | Array<{ id: string; address_line_1: string; address_line_2: string | null; city: string; state: string; zip: string }>
      | null;
  }>)
    .map((row) => (Array.isArray(row.properties) ? row.properties[0] : row.properties))
    .filter((property): property is NonNullable<typeof property> => Boolean(property))
    .map((property) => ({
      id: property.id,
      label: property.address_line_2
        ? `${property.address_line_1}, ${property.address_line_2}, ${property.city}, ${property.state} ${property.zip}`
        : `${property.address_line_1}, ${property.city}, ${property.state} ${property.zip}`,
    }));

  return (
    <PortalShell account={account} activeId="requests">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-semibold tracking-tight">Requests</h1>
            <p className="text-sm text-muted-foreground">
              All service requests submitted for your properties.
            </p>
          </div>
          {/*
            Real portal-submission path, added by migration
            20260810120000_create_portal_service_request_rpc.sql: a guarded
            SECURITY DEFINER RPC (create_portal_service_request), not a
            restored INSERT policy — see docs/implementation/
            portal-request-creation.md. service_requests still has no
            direct-INSERT grant/policy for `authenticated`; this button
            only ever reaches the RPC.
          */}
          <PortalNewRequestSheet properties={newRequestProperties} />
        </header>

        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No service requests yet.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-3">
            {requests.map((request) => (
              <li key={request.id}>
                <Card>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">{request.service_title}</CardTitle>
                      <CardDescription>
                        {request.request_number} · {formatDate(request.submitted_at)}
                      </CardDescription>
                    </div>
                    <span className="whitespace-nowrap rounded-full bg-muted px-2 py-1 text-xs capitalize text-muted-foreground">
                      {getPortalRequestStatusLabel({
                        status: request.status,
                        estimateId: request.estimate_id,
                        jobId: request.job_id,
                      })}
                    </span>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-sm text-muted-foreground">{request.service_description}</p>
                    <p className="text-xs text-muted-foreground">
                      {request.property_address_line_1}, {request.property_city}, {request.property_state}
                    </p>
                    {getPortalRequestStatusDescription({
                      status: request.status,
                      estimateId: request.estimate_id,
                      jobId: request.job_id,
                    }) ? (
                      <p className="text-xs text-muted-foreground">
                        {getPortalRequestStatusDescription({
                          status: request.status,
                          estimateId: request.estimate_id,
                          jobId: request.job_id,
                        })}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </PortalShell>
  );
}
