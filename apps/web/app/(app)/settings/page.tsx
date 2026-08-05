import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bell, Globe2, Plug, ShieldCheck, UserRound, Building2 } from 'lucide-react';

import { getActiveOrgContext } from '@premier/db';

import { ForgeCard, ForgePage } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';
import { getServerSupabase } from '@/lib/supabase-server';

import { signOutAction } from '../today/actions';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/login?redirectTo=/settings');
  }

  const orgContext = await getActiveOrgContext(supabase, user.id);
  const profile = await supabase.from('user_profiles').select('full_name, phone').eq('id', user.id).maybeSingle();
  const organization = orgContext.success
    ? await supabase.from('organizations').select('name, timezone, phone, email').eq('id', orgContext.data.orgId).maybeSingle()
    : null;

  const orgName = orgContext.success ? organization?.data?.name ?? orgContext.data.orgName : 'No active organization';
  const displayName = profile.data?.full_name?.trim() || user.email || 'Staff';

  return (
    <ForgePage className="max-w-4xl gap-5 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage organization preferences, appearance, and your staff profile.</p>
      </header>

      <SettingsSection Icon={Building2} title="Organization" description="Workspace identity and regional defaults.">
        <Field label="Organization name" value={orgName} />
        <Field label="Descriptor" value="Demo maintenance workspace" />
        <Field label="Default timezone" value={organization?.data?.timezone ?? 'America/New_York'} />
        <Field label="Public phone" value={organization?.data?.phone ?? 'Not set'} />
      </SettingsSection>

      <SettingsSection Icon={Globe2} title="Website content" description="CRM-backed content for the public website.">
        <div className="flex flex-col gap-3 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold">Website settings</p>
            <p className="text-xs text-muted-foreground">Edit public-safe copy, promotions, and service highlights.</p>
          </div>
          <Button asChild variant="outline">
            <Link href="/settings/website">Open website content</Link>
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection Icon={UserRound} title="Your profile" description="Your staff identity and contact details.">
        <Field label="Display name" value={displayName} />
        <Field label="Email" value={user.email ?? 'Not set'} />
        <Field label="Phone" value={profile.data?.phone ?? 'Not set'} />
        <Field label="Role" value={orgContext.success ? formatRoleLabel(orgContext.data.role) : 'No active role'} />
      </SettingsSection>

      <SettingsSection Icon={Bell} title="Notifications" description="Choose what updates you receive.">
        <ToggleRow label="New request alerts" description="Get notified when a customer submits a request." enabled />
        <ToggleRow label="Quote accepted" description="Alert when a customer accepts a quote." enabled />
        <ToggleRow label="Invoice overdue" description="Alert when an invoice becomes overdue." enabled />
        <ToggleRow label="Daily digest" description="A morning summary of today's work." enabled={false} />
      </SettingsSection>

      <SettingsSection Icon={Plug} title="Integrations" description="Connected services and data sources.">
        <Row label="Customer portal" description="Branded portal for customer self-service." badge="Active" />
        <Row label="Payments" description="Accept online invoice payments." badge="Not connected" />
      </SettingsSection>

      <SettingsSection Icon={ShieldCheck} title="Security" description="Access control and audit settings.">
        <Row label="Two-factor authentication" description="Requires backend policy and auth configuration before enabling." badge="Planned" />
        <form action={signOutAction}>
          <Button type="submit" variant="destructive" className="w-full justify-start">
            Sign out
          </Button>
        </form>
      </SettingsSection>
    </ForgePage>
  );
}

function SettingsSection({
  children,
  description,
  Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  Icon: typeof Building2;
  title: string;
}) {
  return (
    <ForgeCard className="overflow-hidden p-0">
      <header className="flex items-start gap-3 border-b px-4 py-4">
        <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <div>
          <h2 className="font-bold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="space-y-3 p-4">{children}</div>
    </ForgeCard>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <input
        readOnly
        value={value}
        className="min-h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold text-foreground"
      />
    </label>
  );
}

function ToggleRow({ description, enabled, label }: { description: string; enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span
        aria-label={enabled ? 'Enabled' : 'Disabled'}
        className={`relative h-6 w-10 rounded-full ${enabled ? 'bg-primary' : 'bg-muted'}`}
      >
        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${enabled ? 'right-1' : 'left-1'}`} />
      </span>
    </div>
  );
}

function Row({ badge, description, label }: { badge: string; description: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
      <div>
        <p className="text-sm font-bold">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{badge}</span>
    </div>
  );
}

function formatRoleLabel(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
