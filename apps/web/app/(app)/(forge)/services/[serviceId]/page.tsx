import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { getActiveOrgContext, getServiceItemById } from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { ForgeBackLink, ForgeCard, ForgePage, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';

import { ServicesShell } from '../_components/services-shell';
import { buildForgeShellData, buildMobileNavConfig } from '../_lib/forge-shell-context';

export const metadata: Metadata = { title: 'Service Detail' };

interface ServiceDetailPageProps {
  params: Promise<{ serviceId: string }>;
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { serviceId } = await params;

  if (!isUuid(serviceId)) {
    notFound();
  }

  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/services/${serviceId}`)}`);
  }

  const orgContextResult = await getActiveOrgContext(supabase, user.id);

  if (!orgContextResult.success) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-4 p-6">
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </main>
    );
  }

  const profile = await supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle();
  const shellData = buildForgeShellData({
    orgContext: orgContextResult.data,
    userId: user.id,
    displayName: profile.data?.full_name?.trim() || user.email || 'Staff',
    email: user.email ?? 'No email',
  });
  const mobileNav = buildMobileNavConfig();

  const result = await getServiceItemById(supabase, {
    serviceItemId: serviceId,
    orgId: orgContextResult.data.orgId,
  });

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <ServicesShell shellData={shellData} mobileNav={mobileNav}>
        <ForgePage className="max-w-4xl gap-5 md:gap-6">
          <BackLink />
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to load service: {result.error}
          </p>
        </ForgePage>
      </ServicesShell>
    );
  }

  const { category, item } = result.data;

  return (
    <ServicesShell shellData={shellData} mobileNav={mobileNav}>
      <ForgePage className="max-w-4xl gap-5 md:gap-6">
        <BackLink />

        <header className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {category ? (
              <span className="text-sm text-muted-foreground">{category.name}</span>
            ) : null}
            {item.rate_confirmed !== null ? (
              <ForgeStatusPill tone="emerald">Confirmed rate</ForgeStatusPill>
            ) : item.confidence === 'unconfirmed' ? (
              <ForgeStatusPill tone="neutral">Unconfirmed</ForgeStatusPill>
            ) : (
              <ForgeStatusPill tone="amber">Pricing guidance</ForgeStatusPill>
            )}
            {item.is_active === false ? <ForgeStatusPill tone="neutral">Inactive</ForgeStatusPill> : null}
          </div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{item.name}</h1>
          {item.description ? (
            <p className="text-sm text-muted-foreground">{item.description}</p>
          ) : null}
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <InfoCard label="Primary price">
            <p className="text-lg font-bold text-foreground">
              {formatMoney(item.rate_confirmed ?? item.default_unit_price)}
            </p>
            <p className="text-sm text-muted-foreground">
              {pricingMetricLabel(item.pricing_metric)} · {item.unit_label ?? item.unit}
            </p>
          </InfoCard>

          <InfoCard label="Rate range">
            <p className="text-sm text-foreground">{formatPriceRange(item.rate_low, item.rate_high)}</p>
          </InfoCard>

          <InfoCard label="Default labor / markup">
            <p className="text-sm text-foreground">
              {item.default_labor_minutes !== null ? `${item.default_labor_minutes} min labor` : 'No default labor set'}
            </p>
            <p className="text-sm text-muted-foreground">
              {item.default_markup_pct !== null ? `${item.default_markup_pct}% markup` : 'No default markup set'}
            </p>
          </InfoCard>

          <InfoCard label="Confidence">
            <p className="text-sm text-foreground">{formatEnumLabel(item.confidence)}</p>
          </InfoCard>

          {item.scope_includes ? (
            <InfoCard label="Scope includes">
              <p className="whitespace-pre-wrap text-sm text-foreground">{item.scope_includes}</p>
            </InfoCard>
          ) : null}

          {item.scope_excludes ? (
            <InfoCard label="Scope excludes">
              <p className="whitespace-pre-wrap text-sm text-foreground">{item.scope_excludes}</p>
            </InfoCard>
          ) : null}

          {item.common_addons ? (
            <InfoCard label="Common add-ons">
              <p className="whitespace-pre-wrap text-sm text-foreground">{item.common_addons}</p>
            </InfoCard>
          ) : null}

          {item.exclusion_note ? (
            <InfoCard label="Exclusion note">
              <p className="whitespace-pre-wrap text-sm text-foreground">{item.exclusion_note}</p>
            </InfoCard>
          ) : null}
        </div>

        <ForgeCard className="text-sm">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Edit this service</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Category and pricing edits happen in the catalog manager.
          </p>
          <Link
            href="/services#manage-service-catalog"
            className="mt-2 inline-flex text-sm font-medium underline-offset-2 hover:underline"
          >
            Open catalog manager →
          </Link>
        </ForgeCard>
      </ForgePage>
    </ServicesShell>
  );
}

function BackLink() {
  return <ForgeBackLink href="/services">Service Catalog</ForgeBackLink>;
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <ForgeCard className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <div>{children}</div>
    </ForgeCard>
  );
}

function formatMoney(value: number | null): string {
  if (value === null) return 'Not set';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatPriceRange(low: number | null, high: number | null): string {
  if (low === null && high === null) return 'No rate range set';
  if (low !== null && high !== null) return `${formatMoney(low)}–${formatMoney(high)}`;
  return formatMoney(low ?? high);
}

function pricingMetricLabel(value: string | null): string {
  if (!value) return 'Manual';
  return value.replace('per_', 'per ').replaceAll('_', ' ');
}

function formatEnumLabel(value: string | null): string {
  if (!value) return 'Not set';
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
