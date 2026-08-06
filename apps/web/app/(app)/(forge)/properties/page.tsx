import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { getActiveOrgContext, listProperties, type PropertyListItem } from '@premier/db';

import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from './_lib/forge-shell-context';
import { toPropertiesListViewModel, toPropertySummary, type PropertyJobRow, type PropertyWorkRow } from './_lib/forge-properties-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { PropertiesShell } from './_components/properties-shell';
import { PropertiesListContainer } from './_components/properties-list-container';

export const metadata: Metadata = { title: 'Properties' };

interface PropertiesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_VALUES = ['all', 'active', 'onboarding', 'inactive'] as const;
const TYPE_VALUES = ['all', 'residential', 'commercial'] as const;

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const params = await searchParams;
  const search = readStringParam(params.q);
  const statusFilter = readEnumParam(params.status, STATUS_VALUES);
  const typeFilter = readEnumParam(params.type, TYPE_VALUES);

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/properties');
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const { orgId } = orgContextResult.data;
  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  // Real server-side search (packages/db/queries/properties.ts:listProperties
  // ilike's address/city/state/zip) — status/type stay a post-fetch filter
  // over this bounded page, matching the pre-existing (legacy) page.tsx.
  const result = await listProperties(supabase, { orgId, search, limit: 250, offset: 0 });

  if (!result.success) {
    return (
      <PropertiesShell shellData={shellData} mobileNav={mobileNav}>
        <PropertiesListContainer
          model={toPropertiesListViewModel({
            properties: [],
            searchQuery: search ?? '',
            statusFilter,
            typeFilter,
            canCreate: false,
            error: result.error,
          })}
        />
      </PropertiesShell>
    );
  }

  const properties = result.data.properties;
  const propertyIds = properties.map((row: PropertyListItem) => row.property.id);
  const [requestsResult, jobsResult] =
    propertyIds.length > 0
      ? await Promise.all([
          supabase.from('service_requests').select('property_id, status').eq('org_id', orgId).in('property_id', propertyIds),
          supabase.from('jobs').select('property_id, status, scheduled_start, title').eq('org_id', orgId).in('property_id', propertyIds),
        ])
      : [{ data: null }, { data: null }];

  const now = new Date();
  const summaries = properties.map((item: PropertyListItem) =>
    toPropertySummary(item, (requestsResult.data ?? []) as PropertyWorkRow[], (jobsResult.data ?? []) as PropertyJobRow[], now)
  );

  // No real property-creation route exists at the list level (verified:
  // createPropertyForCustomer is only reachable from Customer Detail's
  // "Add property" flow) — the "New property" button stays disabled here,
  // same honest-unavailable state the pre-existing (legacy) page.tsx used.
  const model = toPropertiesListViewModel({ properties: summaries, searchQuery: search ?? '', statusFilter, typeFilter, canCreate: false });

  return (
    <PropertiesShell shellData={shellData} mobileNav={mobileNav}>
      <PropertiesListContainer model={model} />
    </PropertiesShell>
  );
}

function readStringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && trimmed.length > 0 && trimmed.length <= 200 ? trimmed : undefined;
}

function readEnumParam<T extends readonly string[]>(value: string | string[] | undefined, values: T): T[number] {
  const raw = Array.isArray(value) ? value[0] : value;
  return (values as readonly string[]).includes(raw ?? '') ? (raw as T[number]) : (values[0] as T[number]);
}
