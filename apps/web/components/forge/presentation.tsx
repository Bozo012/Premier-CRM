import Link from 'next/link';
import type { ReactNode } from 'react';

import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { cn } from '@/lib/utils';

export function ForgePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn('mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-8 lg:px-8', className)}>
      {children}
    </main>
  );
}

export function ForgeCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 text-card-foreground shadow-sm', className)}>
      {children}
    </section>
  );
}

export function ForgeSectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function ForgeStatusPill({
  tone,
  children,
}: {
  tone: StatusTone;
  children: ReactNode;
}) {
  return (
    <StatusPill tone={tone} className="font-bold">
      {children}
    </StatusPill>
  );
}

export function ForgeBackLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      ← {children}
    </Link>
  );
}
