import type { Metadata } from 'next';
import Link from 'next/link';
import { Globe2, ShieldCheck, Users2 } from 'lucide-react';

import { ForgeCard, ForgePage, ForgeSectionTitle } from '@/components/forge/presentation';

export const metadata: Metadata = { title: 'Settings' };

const settingsLinks = [
  {
    description: 'Manage the public website service highlights and promotions already backed by Premier.',
    href: '/settings/website',
    Icon: Globe2,
    label: 'Website settings',
  },
  {
    description: 'Invite staff and manage org membership through the existing team access flow.',
    href: '/team',
    Icon: Users2,
    label: 'Team access',
  },
  {
    description: 'Auth, RLS, and permission changes remain backend-owned and require separate implementation.',
    href: '/team',
    Icon: ShieldCheck,
    label: 'Access rules',
  },
] as const;

export default function SettingsPage() {
  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">
          A Base44-style settings hub mapped to Premier&apos;s current real settings routes.
        </p>
      </header>

      <section className="space-y-3">
        <ForgeSectionTitle>Available settings</ForgeSectionTitle>
        <div className="grid gap-3 md:grid-cols-3">
          {settingsLinks.map(({ description, href, Icon, label }) => (
            <Link
              key={label}
              href={href}
              className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-bold text-foreground">{label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </Link>
          ))}
        </div>
      </section>

      <ForgeCard>
        <h2 className="font-bold text-foreground">Backend boundary</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This hub does not port Base44 platform settings. Premier auth, org membership, RLS, and permissions stay authoritative.
        </p>
      </ForgeCard>
    </ForgePage>
  );
}
