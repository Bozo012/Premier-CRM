import type { Metadata } from 'next';
import Link from 'next/link';
import { WalletCards } from 'lucide-react';

import { ForgeCard, ForgePage, ForgeSectionTitle, ForgeStatusPill } from '@/components/forge/presentation';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Expenses' };

const backendNeeds = [
  'An expenses table scoped by org, job, optional invoice, vendor, amount, date, receipt vault item, billable flag, and reimbursement status.',
  'RLS policies that keep expense data org-private and role-aware.',
  'Server actions for receipt upload, expense create/edit, approval, invoice eligibility, and audit logging.',
  'Invoice integration that can pull approved billable expenses without mixing internal cost with customer invoice totals.',
] as const;

export default function ExpensesPage() {
  return (
    <ForgePage className="max-w-6xl gap-5 md:gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Expenses</h1>
        <p className="text-sm text-muted-foreground">
          Base44 has the visual flow, but Premier does not yet have an authoritative expense backend.
        </p>
      </header>

      <ForgeCard className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <WalletCards className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">Backend work required before this can be real</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This page is intentionally not using Base44 fixtures or mocked persistence. It is a routed placeholder until the expense model is approved.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ForgeStatusPill tone="amber">Blocked by schema</ForgeStatusPill>
            <ForgeStatusPill tone="neutral">No mock expenses</ForgeStatusPill>
          </div>
        </div>
      </ForgeCard>

      <section className="space-y-3">
        <ForgeSectionTitle>Needed to match Base44</ForgeSectionTitle>
        <ForgeCard>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {backendNeeds.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </ForgeCard>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/invoices">Back to invoices</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/jobs">Review jobs</Link>
        </Button>
      </div>
    </ForgePage>
  );
}
