import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { PortalShell, requirePortalUser } from '../_components/portal-shell';
import { getPortalRequestStatusDescription, getPortalRequestStatusLabel } from '@/lib/request-intake-flow';
import { resolveActivePortalAccount } from '../_lib/portal-session';
import { getServerSupabase } from '@/lib/supabase-server';

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

  const { data } = await portalClient
    .from('service_requests')
    .select(
      'id, request_number, status, priority, estimate_id, job_id, service_title, service_description, submitted_at, preferred_date, property_address_line_1, property_city, property_state'
    )
    .eq('customer_id', account.customerId)
    .order('submitted_at', { ascending: false });

  const requests = data ?? [];

  return (
    <PortalShell account={account} activeId="requests">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Requests</h1>
          <p className="text-sm text-muted-foreground">
            All service requests submitted for your properties.
          </p>
        </header>

        {/*
          NEW REQUEST — INTENTIONALLY NOT BUILT THIS SLICE.
          A real, matching RLS INSERT policy (customer_insert_own_portal_
          service_requests) existed on service_requests, but was
          deliberately DROPPED — along with the INSERT/UPDATE/DELETE grant
          to `authenticated` on the whole table — by migration
          20260803080000_harden_service_requests_estimates_site_visits.sql,
          which explicitly states the unused policy was closed as part of a
          security hardening pass and that any future portal-submission
          feature "should be designed and reviewed as a deliberate addition,
          not inherited from a policy nobody currently exercises." That is a
          genuine stop condition per this slice's own instructions: it
          cannot be wired without either (a) a new migration re-opening a
          scoped write path, ideally as a SECURITY DEFINER RPC
          (create_portal_service_request(...), matching the guarded-RPC
          pattern the hardening migration itself prefers) validating
          source='portal', status='new', reviewed_at IS NULL, and portal
          account ownership server-side, or (b) a new server action using
          the service-role client with the same validation performed in
          application code. Both are genuine additive changes requiring
          review, not something this pass can quietly restore. See the
          delivery report's gap table for the proposed smallest model.
        */}
        <Card className="border-dashed">
          <CardContent className="py-4 text-sm text-muted-foreground">
            Submitting a new request from inside the portal isn&apos;t available yet — use{' '}
            <a href="/portal/messages" className="underline underline-offset-4">
              Contact Premier
            </a>{' '}
            and we&apos;ll get a request started for you.
          </CardContent>
        </Card>

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
