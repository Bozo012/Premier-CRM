import Link from 'next/link';
import { redirect } from 'next/navigation';

import {
  createServiceClient,
  getWebsiteSettingsForOrg,
  listWebsitePromotionsForOrg,
  listWebsiteServiceHighlightsForOrg,
} from '@premier/db';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServerSupabase } from '@/lib/supabase-server';

import { WebsiteHighlightList } from './_components/website-highlight-list';
import { WebsitePromotionList } from './_components/website-promotion-list';
import { WebsiteSettingsForm } from './_components/website-settings-form';

export default async function WebsiteSettingsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/settings/website');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return (
      <PageShell>
        <ErrorPanel>
          Could not load your organization membership: {membershipError.message}
        </ErrorPanel>
      </PageShell>
    );
  }

  if (!membership) {
    return (
      <PageShell>
        <ErrorPanel>
          No organization membership was found for this user.
        </ErrorPanel>
      </PageShell>
    );
  }

  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return (
      <PageShell>
        <ErrorPanel>
          Only owners and admins can manage website content.
        </ErrorPanel>
      </PageShell>
    );
  }

  const serviceClient = createServiceClient();
  const [settingsResult, promotionsResult, highlightsResult] = await Promise.all([
    getWebsiteSettingsForOrg(serviceClient, { orgId: membership.org_id }),
    listWebsitePromotionsForOrg(serviceClient, { orgId: membership.org_id }),
    listWebsiteServiceHighlightsForOrg(serviceClient, {
      orgId: membership.org_id,
    }),
  ]);

  if (!settingsResult.success) {
    return (
      <PageShell>
        <ErrorPanel>Failed to load website settings: {settingsResult.error}</ErrorPanel>
      </PageShell>
    );
  }

  if (!promotionsResult.success) {
    return (
      <PageShell>
        <ErrorPanel>Failed to load promotions: {promotionsResult.error}</ErrorPanel>
      </PageShell>
    );
  }

  if (!highlightsResult.success) {
    return (
      <PageShell>
        <ErrorPanel>
          Failed to load service highlights: {highlightsResult.error}
        </ErrorPanel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard
          label="Published settings"
          value={settingsResult.data ? '1' : '0'}
          helper="Singleton per org"
        />
        <SummaryCard
          label="Promotions"
          value={String(promotionsResult.data.length)}
          helper="Optional homepage banners"
        />
        <SummaryCard
          label="Highlights"
          value={String(highlightsResult.data.length)}
          helper="Homepage service cards"
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Website settings</CardTitle>
        </CardHeader>
        <CardContent>
          <WebsiteSettingsForm settings={settingsResult.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Promotions</CardTitle>
        </CardHeader>
        <CardContent>
          <WebsitePromotionList promotions={promotionsResult.data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Service highlights</CardTitle>
        </CardHeader>
        <CardContent>
          <WebsiteHighlightList highlights={highlightsResult.data} />
        </CardContent>
      </Card>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 pb-24 pt-5 sm:px-6 md:gap-6 md:px-8 md:pt-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Website content
            </h1>
            <p className="text-sm text-muted-foreground">
              Edit only the public-safe, CRM-backed content used by the marketing site.
            </p>
          </div>
          <Link
            href="/today"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Back to dashboard
          </Link>
        </div>
      </header>
      {children}
    </main>
  );
}

function SummaryCard({
  helper,
  label,
  value,
}: {
  helper: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  );
}
