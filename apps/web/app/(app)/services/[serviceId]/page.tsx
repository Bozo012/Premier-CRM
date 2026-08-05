import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import {
  getActiveOrgContext,
  getServiceCatalogItemById,
  listServiceCategories,
  type ServiceCatalogQuoteUsage,
} from '@premier/db';
import { ErrorCode } from '@premier/shared';

import { ForgeBackLink, ForgeCard, ForgePage, ForgeSectionTitle, ForgeStatusPill } from '@/components/forge/presentation';
import { OrgContextError } from '@/components/org-context-error';
import { getServerSupabase } from '@/lib/supabase-server';
import { quoteStatusTone } from '../../quotes/_lib/forge-quote-view-model';

import { ServiceItemEditorCard } from '../_components/service-item-manager';

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
      <ForgePage>
        <OrgContextError code={orgContextResult.code} message={orgContextResult.error} />
      </ForgePage>
    );
  }

  const [result, categoriesResult] = await Promise.all([
    getServiceCatalogItemById(supabase, {
      id: serviceId,
      orgId: orgContextResult.data.orgId,
    }),
    listServiceCategories(supabase, { orgId: orgContextResult.data.orgId }),
  ]);

  if (!result.success) {
    if (result.code === ErrorCode.NOT_FOUND) {
      notFound();
    }

    return (
      <ForgePage>
        <ForgeBackLink href="/services">Back to service catalog</ForgeBackLink>
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">Failed to load service: {result.error}</p>
      </ForgePage>
    );
  }

  const { category, item, quoteUsages } = result.data;
  const categories = categoriesResult.success ? categoriesResult.data : category ? [category] : [];

  return (
    <ForgePage>
      <ForgeBackLink href="/services">Back to service catalog</ForgeBackLink>

      <header className="mb-5 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{item.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{category?.name ?? 'Uncategorized'}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {item.rate_confirmed !== null ? <ForgeStatusPill tone="emerald">Confirmed rate</ForgeStatusPill> : null}
            {item.rate_confirmed === null && item.confidence !== 'unconfirmed' ? <ForgeStatusPill tone="amber">Pricing guidance</ForgeStatusPill> : null}
            {item.confidence === 'unconfirmed' ? <ForgeStatusPill tone="neutral">Unconfirmed</ForgeStatusPill> : null}
            {item.is_active === false ? <ForgeStatusPill tone="neutral">Inactive</ForgeStatusPill> : null}
          </div>
        </div>
        {item.description ? <p className="text-sm text-card-foreground">{item.description}</p> : null}
      </header>

      <div className="space-y-5">
        <ForgeCard>
          <ForgeSectionTitle>Scope</ForgeSectionTitle>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Includes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-card-foreground">{item.scope_includes || 'Not documented'}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-muted-foreground">Excludes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-card-foreground">{item.scope_excludes || 'Not documented'}</p>
            </div>
          </div>
        </ForgeCard>

        <ForgeCard>
          <ForgeSectionTitle>Used in quotes</ForgeSectionTitle>
          {quoteUsages.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Not currently used on any quote line item.</p>
          ) : (
            <ul className="mt-3 divide-y">
              {quoteUsages.map((usage) => (
                <QuoteUsageRow key={usage.quoteId} usage={usage} />
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Estimates reference catalog services only indirectly — estimate line items do not carry a catalog link in the current data model.
          </p>
        </ForgeCard>

        <section aria-labelledby="edit-service-heading">
          <h2 id="edit-service-heading" className="sr-only">
            Edit service
          </h2>
          <ServiceItemEditorCard categories={categories} itemSummary={{ category, item }} />
        </section>
      </div>
    </ForgePage>
  );
}

function QuoteUsageRow({ usage }: { usage: ServiceCatalogQuoteUsage }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <Link href={`/quotes/${usage.quoteId}`} className="min-w-0 text-sm font-semibold text-primary hover:underline">
        {usage.title || usage.quoteNumber || 'Untitled quote'}
      </Link>
      <ForgeStatusPill tone={quoteStatusTone(usage.status)}>{usage.status}</ForgeStatusPill>
    </li>
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
