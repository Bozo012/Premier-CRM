import { notFound, redirect } from 'next/navigation';

// ── LAYER 1: existing Forge domain/data code, reused unchanged ─────────────
import { getActiveOrgContext, getPropertyMemory } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { OrgContextError } from '@/components/org-context-error';
import { buildOpenInMapsUrl } from '@/lib/maps/external-maps-url';
import { getServerSupabase } from '@/lib/supabase-server';

// ── LAYER 2: adapter / view-model ───────────────────────────────────────────
import { buildForgeShellData, buildMobileNavConfig } from '../_lib/forge-shell-context';
import { toPropertyDetailModel } from '../_lib/forge-property-detail-view-model';

// ── LAYER 3: ported Base44-exact presentation ───────────────────────────────
import { PropertiesShell } from '../_components/properties-shell';
import { PropertyDetailContainer } from '../_components/property-detail-container';

interface PropertyDetailPageProps {
  params: Promise<{ propertyId: string }>;
}

export default async function PropertyDetailPage({ params }: PropertyDetailPageProps) {
  const { propertyId } = await params;

  if (!isUuid(propertyId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/properties/${propertyId}`)}`);
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
  const result = await getPropertyMemory(supabase, { orgId, propertyId });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      // Real not-found state — RLS/org-scoping enforced by getPropertyMemory
      // itself (search_org_id passed to the RPC), not re-implemented here.
      notFound();
    }

    const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
    const shellData = buildForgeShellData({
      orgContext: orgContextResult.data,
      userId: user.id,
      displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
      email: user.email ?? 'No email',
    });
    return (
      <PropertiesShell shellData={shellData} mobileNav={buildMobileNavConfig()}>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <p className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            Failed to load property: {result.error}
          </p>
        </main>
      </PropertiesShell>
    );
  }

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const model = toPropertyDetailModel(result.data);
  const { property } = result.data;
  const mapsUrl = buildOpenInMapsUrl({
    addressLine1: property.address_line_1,
    addressLine2: property.address_line_2,
    city: property.city,
    state: property.state,
    zip: property.zip,
  });

  return (
    <PropertiesShell shellData={shellData} mobileNav={buildMobileNavConfig()}>
      <PropertyDetailContainer model={model} mapsUrl={mapsUrl} />
    </PropertiesShell>
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
